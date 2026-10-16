(function installPaulWeiBitmexDataProvider(global) {
  "use strict";

  if (!global.document || !global.fetch) return;
  if (!global.PaulWeiDataTransform) {
    throw new Error("PaulWeiDataTransform 必须在 data-provider.js 之前加载");
  }

  const CONFIG = Object.freeze({
    symbol: "XBTUSD",
    account: "1501242",
    trader: "Paul Wei (@coolish)",
    sourceRepository: "bwjoke/BTC-Trading-Since-2020",
    sourceUrl: "https://github.com/bwjoke/BTC-Trading-Since-2020",
    intervals: ["1m", "3m", "5m", "15m", "1h", "4h", "1d", "1w"],
    exchangeStatus: "BitMEX 交易所于 2026-09-23 04:00 UTC 结束交易，网站仍可登录及提现；本页使用 2026-09-11 导出的静态账户快照",
  });

  const REFERENCE_INTERVAL = "1h";
  const SOURCE_FILES = ["fills.json", "orders.json", "equity.json", "order_evidence.json", "order_events.json", "order_bounds.json",
                      "source-manifest.json", "funding.json", "btc-event-prices.json", "btc-wallet-flows.json"];
  const TIMELINE_PATTERN = new RegExp(`^timeline_(${CONFIG.intervals.join("|")})$`);

  const nativeFetch = global.fetch.bind(global);
  const CATALOG_SCHEMA = "paulwei.bitmex-candle-catalog.v1";
  const MAX_ACTIVE_BARS = 30_000;
  const MAX_CACHED_BYTES = 48 * 1024 * 1024;
  const BUFFER_BARS = 10_000;
  const shardCache = new Map();
  const activeWindows = new Map();
  const activeDescriptors = new Map();
  const rangeRequests = new Map();
  let catalogPromise;
  let retainedInterval = null;
  const exportsCache = new Map();
  const candleArchives = new Map();
  let inputPromise;
  let modelPromise;

  const metrics = {
    mode: "browser-compute-from-static-archive",
    sourceRepository: CONFIG.sourceRepository,
    exchangeStatus: CONFIG.exchangeStatus,
    requestedAt: new Date().toISOString(),
    inputFetchMs: null,
    candleFetchMs: {},
    coreTransformMs: null,
    timelines: {},
    counts: {},
    candleArchive: { loadedShards: {}, activeWindows: {}, cachedBytes: 0, cachedShards: 0 },
  };

  function mark(name, milliseconds, details = {}) {
    const rounded = Math.round(milliseconds * 100) / 100;
    console.info(`[PaulWei BitMEX] ${name}: ${rounded} ms`, details);
    return rounded;
  }

  async function fetchJson(url) {
    const response = await nativeFetch(url, {
      cache: "no-cache",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}，加载 ${url} 失败`);
    return await response.json();
  }

  const sourceHashes = {};
  async function fetchSourceJson(name, url) {
    const response = await nativeFetch(url, { cache: "no-cache", headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}，加载 ${url} 失败`);
    if (typeof response.arrayBuffer !== "function" || !global.crypto?.subtle || typeof global.TextDecoder !== "function") {
      return await response.json();
    }
    const bytes = await response.arrayBuffer();
    const digest = await global.crypto.subtle.digest("SHA-256", bytes);
    sourceHashes[name] = [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join("");
    return JSON.parse(new global.TextDecoder().decode(bytes));
  }

  function validateCandleArchive(archive, interval, symbol) {
    if (
      !archive ||
      archive.schema !== "paulwei.bitmex-candles.v1" ||
      archive.interval !== interval ||
      archive.symbol !== symbol ||
      !Array.isArray(archive.bars)
    ) {
      throw new Error(`${symbol} ${interval} K 线档案不合法`);
    }
    return archive;
  }

  function loadCatalog() {
    if (!catalogPromise) {
      catalogPromise = fetchJson(new URL("data/archive/candle-catalog.json", document.baseURI))
        .then((catalog) => {
          if (catalog?.schema !== CATALOG_SCHEMA || catalog.symbol !== CONFIG.symbol ||
              JSON.stringify(catalog.displayIntervals) !== JSON.stringify(CONFIG.intervals)) {
            throw new Error("BitMEX candle catalog header is invalid");
          }
          for (const interval of CONFIG.intervals) {
            const entry = catalog.intervals?.[interval];
            if (entry?.stepMs !== global.PaulWeiDataTransform.intervalMilliseconds(interval) ||
                !entry.shards?.length || entry.totalBars !== entry.shards.reduce((n, s) => n + s.bars, 0)) {
              throw new Error(`Invalid ${interval} candle catalog`);
            }
            let prior = null;
            for (const descriptor of entry.shards) {
              if (!descriptor.file.startsWith(`candles_${interval}`) || descriptor.file.includes('..') ||
                  !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 1 ||
                  descriptor.bars < 1 || descriptor.first > descriptor.last ||
                  (prior && descriptor.first <= prior.last)) {
                throw new Error(`Invalid ${interval} candle shard descriptor`);
              }
              prior = descriptor;
            }
            if (entry.first !== entry.shards[0].first || entry.last !== prior.last) {
              throw new Error(`Invalid ${interval} candle catalog boundaries`);
            }
          }
          return catalog;
        }).catch((error) => { catalogPromise = undefined; throw error; });
    }
    return catalogPromise;
  }

  function pruneShardCache() {
    let bytes = [...shardCache.values()].reduce((sum, entry) => sum + entry.bytes, 0);
    const protectedFiles = new Set([
      ...(activeDescriptors.get(retainedInterval)?.map((row) => row.file) || []),
      ...(activeDescriptors.get(REFERENCE_INTERVAL)?.map((row) => row.file) || []),
    ]);
    for (const [file, entry] of shardCache) {
      if (bytes <= MAX_CACHED_BYTES) break;
      if (!entry.loaded || protectedFiles.has(file)) continue;
      shardCache.delete(file);
      bytes -= entry.bytes;
    }
    metrics.candleArchive.cachedBytes = bytes;
    metrics.candleArchive.cachedShards = shardCache.size;
  }

  async function loadShard(interval, descriptor) {
    if (shardCache.has(descriptor.file)) {
      const entry = shardCache.get(descriptor.file);
      shardCache.delete(descriptor.file);
      shardCache.set(descriptor.file, entry);
      return entry.promise;
    }
    const promise = fetchJson(new URL(`data/archive/${descriptor.file}`, document.baseURI))
      .then((archive) => {
        validateCandleArchive(archive, interval, CONFIG.symbol);
        if (archive.bars.length !== descriptor.bars || archive.bars[0]?.[0] !== descriptor.first ||
            archive.bars.at(-1)?.[0] !== descriptor.last) {
          throw new Error(`${descriptor.file} differs from catalog`);
        }
        return archive;
      });
    const entry = { promise, bytes: descriptor.bytes, loaded: false };
    shardCache.set(descriptor.file, entry);
    try {
      const archive = await promise;
      entry.loaded = true;
      metrics.candleArchive.loadedShards[interval] = [...new Set([
        ...(metrics.candleArchive.loadedShards[interval] || []), descriptor.file,
      ])];
      return archive;
    } catch (error) {
      if (shardCache.get(descriptor.file) === entry) shardCache.delete(descriptor.file);
      throw error;
    }
  }

  function selectDescriptors(entry, from, to) {
    let first = entry.shards.findIndex((row) => row.last >= from);
    if (first < 0) first = entry.shards.length - 1;
    let last = first;
    while (last + 1 < entry.shards.length && entry.shards[last + 1].first <= to) last++;
    return entry.shards.slice(first, last + 1);
  }

  function superseded(from, to) {
    return { changed: false, available: true, stale: true, from, to };
  }

  async function ensureCandleRange(interval, { from, to, beforeBars = BUFFER_BARS, afterBars = BUFFER_BARS } = {}) {
    if (!CONFIG.intervals.includes(interval)) throw new Error(`Unsupported interval: ${interval}`);
    const request = (rangeRequests.get(interval) || 0) + 1;
    rangeRequests.set(interval, request);
    const isStale = () => rangeRequests.get(interval) !== request;
    const entry = (await loadCatalog()).intervals[interval];
    if (interval === REFERENCE_INTERVAL) {
      const descriptors = entry.shards;
      await Promise.all(descriptors.map((d) => loadShard(interval, d)));
      activeDescriptors.set(interval, descriptors);
      pruneShardCache();
      return { changed: false, available: true, shards: descriptors.map((d) => d.file) };
    }
    const step = entry.stepMs;
    const requestedFrom = Number.isFinite(from) ? from : entry.last;
    const requestedTo = Number.isFinite(to) ? Math.max(to, requestedFrom) : requestedFrom;
    const visible = Math.ceil((requestedTo - requestedFrom) / step) + 1;
    if (visible > MAX_ACTIVE_BARS) throw new RangeError(`${interval} visible range exceeds ${MAX_ACTIVE_BARS} bars`);
    const spare = MAX_ACTIVE_BARS - visible;
    const before = Math.min(Math.max(0, beforeBars), Math.floor(spare / 2));
    const after = Math.min(Math.max(0, afterBars), spare - before);
    const window = {
      from: Math.max(entry.first, requestedFrom - before * step),
      to: Math.min(entry.last, requestedTo + after * step),
    };
    if (window.from > window.to) {
      const nearest = requestedTo < entry.first ? entry.first : entry.last;
      window.from = nearest; window.to = nearest;
    }
    const previous = activeWindows.get(interval);
    const edge = 3_000 * step;
    const start = Math.max(entry.first, Math.min(entry.last, requestedFrom));
    const end = Math.max(entry.first, Math.min(entry.last, requestedTo));
    const covers = previous && start >= previous.from && end <= previous.to &&
      (previous.from <= entry.first || start - previous.from >= edge) &&
      (previous.to >= entry.last || previous.to - end >= edge);
    if (covers) {
      const cached = await Promise.all((activeDescriptors.get(interval) || []).map((d) => loadShard(interval, d)));
      if (isStale()) return superseded(requestedFrom, requestedTo);
      return { changed: false, available: cached.some((archive) => archive.bars.some((bar) =>
        bar[0] >= requestedFrom && bar[0] <= requestedTo)), from: requestedFrom, to: requestedTo };
    }
    const descriptors = selectDescriptors(entry, window.from, window.to);
    const archives = await Promise.all(descriptors.map((d) => loadShard(interval, d)));
    if (isStale()) return superseded(requestedFrom, requestedTo);
    const changed = previous?.from !== window.from || previous?.to !== window.to ||
      activeDescriptors.get(interval)?.map((d) => d.file).join() !== descriptors.map((d) => d.file).join();
    activeWindows.set(interval, window);
    activeDescriptors.set(interval, descriptors);
    metrics.candleArchive.activeWindows[interval] = window;
    if (changed) { candleArchives.delete(`${CONFIG.symbol}|${interval}`); exportsCache.delete(`timeline_${interval}`); }
    const available = archives.some((archive) => archive.bars.some((bar) =>
      bar[0] >= requestedFrom && bar[0] <= requestedTo));
    pruneShardCache();
    return { changed, available, from: requestedFrom, to: requestedTo,
      shards: descriptors.map((d) => d.file) };
  }

  async function loadCatalogArchive(interval) {
    const entry = (await loadCatalog()).intervals[interval];
    let descriptors = activeDescriptors.get(interval);
    if (interval === REFERENCE_INTERVAL) {
      descriptors = entry.shards;
      activeDescriptors.set(interval, descriptors);
    } else if (!descriptors) {
      const end = entry.last;
      await ensureCandleRange(interval, { from: end - BUFFER_BARS * entry.stepMs,
        to: end, beforeBars: 0, afterBars: 0 });
      descriptors = activeDescriptors.get(interval);
    }
    const archives = await Promise.all(descriptors.map((d) => loadShard(interval, d)));
    const window = activeWindows.get(interval);
    const bars = archives.flatMap((archive) => archive.bars).filter((bar) =>
      interval === REFERENCE_INTERVAL || (bar[0] >= window.from && bar[0] <= window.to));
    if (!bars.length && window) {
      const first = archives[0]?.bars[0];
      const last = archives.at(-1)?.bars.at(-1);
      if (first || last) bars.push(window.to < entry.first ? first : last);
    }
    pruneShardCache();
    return { schema: "paulwei.bitmex-candles.v1", symbol: CONFIG.symbol, interval, bars };
  }

  function loadCandleArchive(interval) {
    if (!CONFIG.intervals.includes(interval)) {
      throw new Error(`不支持的 K 线粒度：${interval}`);
    }
    const symbol = CONFIG.symbol;
    const key = `${symbol}|${interval}`;
    if (!candleArchives.has(key)) {
      candleArchives.set(
        key,
        (async () => {
          const started = performance.now();
          const archive = validateCandleArchive(await loadCatalogArchive(interval), interval, symbol);
          metrics.candleFetchMs[key] = mark(
            `${symbol} ${interval} K 线档案已下载解析`,
            performance.now() - started,
            { bars: archive.bars.length },
          );
          return archive;
        })().catch((error) => { candleArchives.delete(key); throw error; }),
      );
    }
    return candleArchives.get(key);
  }

  function validateInputs(raw) {
    if (!Array.isArray(raw.fills) || !Array.isArray(raw.orders) || !Array.isArray(raw.equity)) {
      throw new Error("成交、订单、权益输入必须都是数组");
    }
    if (!Array.isArray(raw.funding)) {
      throw new Error("资金费 funding.json 必须是数组");
    }
    if ((raw.eventPrices?.schema !== "paulwei.bitmex-event-minutes.v1" ||
        raw.eventPrices.symbol !== CONFIG.symbol || !Array.isArray(raw.eventPrices.prices) ||
        raw.eventPrices.prices.some(([t, p], i) => !Number.isSafeInteger(t) || !(p > 0) ||
          (i > 0 && t <= raw.eventPrices.prices[i - 1][0])))) {
      throw new Error("BTC 事件分钟价 btc-event-prices.json 不合法");
    }
    if ((raw.walletFlows?.schema !== "paulwei.bitmex-btc-wallet-flows.v2" ||
        raw.walletFlows.baselineT !== raw.manifest?.equityBaseline?.baselineT ||
        !Array.isArray(raw.walletFlows.rows) ||
        raw.walletFlows.checks?.finalWalletXBt !== Math.round(raw.equity.at(-1)?.[6] * 1e8))) {
      throw new Error("BTC 钱包流水 btc-wallet-flows.json 未通过归属或余额检查");
    }
    const m = raw.manifest;
    if (m?.schema !== "paulwei.bitmex-source.v1" || m.symbol !== CONFIG.symbol) {
      throw new Error("源数据 manifest 不合法");
    }
    if (!m.reconciliation?.ok) {
      throw new Error("源数据 manifest 自称仓位对账未通过，拒绝渲染");
    }
    if (raw.evidence?.schema !== "paulwei.bitmex-order-evidence.v1") {
      throw new Error("历史快照证据 order_evidence.json 不合法");
    }
    const events = raw.orderEvents;
    if (events?.schema !== "paulwei.bitmex-order-events.v1" || events.symbol !== CONFIG.symbol ||
        events.sourceSha256 !== "16b15e100a7c621fc09e8e7fc693d93b24008ffcc373f5f4cc6bf2069af6dbc5" ||
        events.counts?.events !== 15 || events.counts.New !== 8 || events.counts.Replaced !== 6 ||
        events.counts.TriggeredOrActivatedBySystem !== 1 || !Array.isArray(events.rows) ||
        events.rows.length !== events.counts.events ||
        events.rows.some(([t, type, px, qty, ordId, stopPx]) => !Number.isSafeInteger(t) ||
          ![1, 2, 3].includes(type) || !(qty > 0) || !ordId ||
          (type === 3 ? !(stopPx > 0) : !(px > 0)))) {
      throw new Error("订单事件 order_events.json 不合法");
    }
    if (raw.bounds?.schema !== "paulwei.bitmex-order-bounds.v2") {
      throw new Error("穿价下限 order_bounds.json 不合法");
    }
  }

  async function loadRawInputs() {
    if (inputPromise) return inputPromise;
    inputPromise = (async () => {
      const started = performance.now();
      const base = new URL("data/source/", document.baseURI);
      const [entries, referenceCandles, references] = await Promise.all([
        Promise.all(SOURCE_FILES.map(async (f) => [f, await fetchSourceJson(f, new URL(f, base))])),
        loadCandleArchive(REFERENCE_INTERVAL),
        nativeFetch(new URL("data/archive/order-market-references.json", document.baseURI),
          { signal: global.AbortSignal?.timeout?.(5000), cache: "no-cache" })
          .then(response => response.ok ? response.json() : null).catch(() => null),
      ]);
      const docs = Object.fromEntries(entries);
      const raw = {
        fills: docs["fills.json"],
        orders: docs["orders.json"],
        equity: docs["equity.json"],
        evidence: docs["order_evidence.json"],
        orderEvents: docs["order_events.json"],
        bounds: docs["order_bounds.json"],
        funding: docs["funding.json"] || null,
        eventPrices: docs["btc-event-prices.json"] || null,
        walletFlows: docs["btc-wallet-flows.json"] || null,
        manifest: docs["source-manifest.json"],
        references,
      };
      validateInputs(raw);
      metrics.inputFetchMs = mark("源数据已下载解析", performance.now() - started, {
        files: SOURCE_FILES.length,
        eagerCandleArchive: REFERENCE_INTERVAL,
      });
      metrics.counts.rawFills = raw.fills.length;
      metrics.counts.rawOrders = raw.orders.length;
      metrics.counts.rawEquity = raw.equity.length;
      return { raw, referenceCandles };
    })();
    return inputPromise;
  }

  async function loadCoreModel() {
    if (modelPromise) return modelPromise;
    modelPromise = (async () => {
      const { raw, referenceCandles } = await loadRawInputs();
      const started = performance.now();
      const model = global.PaulWeiDataTransform.buildCoreModel(CONFIG, raw);
      const intent = global.TradeVizOrderIntent;
      if (intent) {
        const archive = intent.validArchive(raw.references, "bitmex") ? raw.references : intent.emptyArchive("bitmex");
        const orders = intent.bitmexOrders(raw.orders, raw.orderEvents, raw.fills);
        model.fills = intent.applyToFills(model.fills.map((fill, i) =>
          ({ ...fill, order_id: model.fillEvents[i].ordId })), orders, archive, "order_id");
        model.fillEvents = model.fillEvents.map((event, i) =>
          ({ ...event, exchange_taker: event.taker, taker: model.fills[i].crossed }));
        metrics.orderIntent = { ...archive.coverage, venue: "bitmex", referenceKind: "bitmex-best-quote",
          overriddenFills: model.fills.filter(fill => fill.intent.overridden).length,
          overriddenOrders: new Set(model.fills.filter(fill => fill.intent.overridden).map(fill => fill.order_id)).size };
      }
      model.usdLedger = global.PaulWeiDataTransform.createUsdLedger(
        referenceCandles.bars, model.fillEvents, model.equity, model.baseline,
        raw.eventPrices.prices, raw.walletFlows);
      metrics.coreTransformMs = mark("仓位重放、订单与摘要已计算", performance.now() - started, {
        orders: model.orders.length,
        fills: model.fills.length,
      });
      metrics.counts.orders = model.orders.length;
      metrics.counts.fills = model.fills.length;
      metrics.counts.medianOrderLifeMs = model.summary.counts.median_order_life_ms;
      return model;
    })();
    return modelPromise;
  }

  function btcSize(contracts, px) {
    const size = Number(contracts);
    return Number.isFinite(size) && px > 0
      ? size * global.PaulWeiDataTransform.contractValueBtc(global.PaulWeiDataTransform.XBTUSD_SPEC, px)
      : null;
  }

  function toCoreFill(fill) {
    return { ...fill, contracts: fill.sz, sz: fill.sz_btc ?? btcSize(fill.sz, fill.px) };
  }

  function toCoreOrders(orders, fills) {
    const executed = new Map();
    for (const fill of fills) {
      if (fill.oid === null || fill.oid === undefined) continue;
      const entry = executed.get(fill.oid) || { contracts: 0, btc: 0 };
      entry.contracts += Number(fill.contracts) || 0;
      entry.btc += Number(fill.sz) || 0;
      executed.set(fill.oid, entry);
    }
    return orders.map((order) => {
      const px = order.is_trigger ? order.trigger_px : order.limit_px;
      const contracts = Number(order.orig_sz ?? order.sz ?? 0);
      const done = executed.get(order.oid);
      const complete = order.status === "filled" && !order.evidence && done
        && Math.abs(done.contracts - contracts) <= Math.max(1e-8, contracts * 1e-9);
      const core = { ...order,
        contracts,
        remaining_contracts: Number(order.sz ?? 0),
        filled_contracts: Number(order.filled_sz ?? 0),
        orig_sz: complete ? done.btc : btcSize(contracts, px),
        sz: btcSize(order.sz ?? 0, px),
      };
      delete core.filled_sz;
      if (order.event_evidence) { core.final_status = order.status; core.status = "evidence"; }
      else if (order.evidence) { core.status = "canceled"; core.final_status = "canceled"; }
      return core;
    });
  }

  function toCoreBar(bar) {
    const priced = bar.av !== null && bar.av !== undefined;
    return { ...bar,
      pos_contracts: bar.pos,
      pos: bar.pos_btc,
      dep: priced ? bar.base_usd + bar.external_usd : null,
      dep_btc: priced ? bar.base_btc + bar.external_btc : null,
      pnl_btc: priced ? bar.pnl_native_btc : null,
      twr_usd: priced ? bar.twr_usd : null,
      twr_btc: priced ? bar.twr_btc : null,
      fills: (bar.fills || []).map(toCoreFill),
    };
  }

  function buildCoreTimeline(model, interval, rawBars) {
    const timeline = global.PaulWeiDataTransform.buildTimeline(
      interval, rawBars, model.fillEvents, model.equity, model.funding, model.usdLedger);
    return { ...timeline, bars: timeline.bars.map(toCoreBar) };
  }

  async function computeExport(name) {
    const model = await loadCoreModel();
    if (name === "summary") return model.summary;
    if (name === "fills") return model.fills.map(toCoreFill);
    if (name === "orders") return toCoreOrders(model.orders.concat(model.orderVersions ?? [], model.orderEvidence),
      model.fills.map(toCoreFill));

    const match = TIMELINE_PATTERN.exec(name);
    if (!match) throw new Error(`不支持的导出：${name}`);
    const interval = match[1];
    const archive = await loadCandleArchive(interval);
    const started = performance.now();
    const timeline = buildCoreTimeline(model, interval, archive.bars);
    metrics.timelines[interval] = mark(
      `${interval} 时间轴已在浏览器内计算`,
      performance.now() - started,
      { bars: timeline.bars.length },
    );
    return timeline;
  }

  function getExport(name) {
    if (!exportsCache.has(name)) {
      exportsCache.set(name, computeExport(name).catch((error) => {
        exportsCache.delete(name);
        throw error;
      }));
    }
    return exportsCache.get(name);
  }

  async function getPnlStartAt(openT, interval = "1m") {
    if (!CONFIG.intervals.includes(interval) || !Number.isSafeInteger(openT)) return null;
    const info = (await loadCatalog()).intervals[interval];
    const aligned = interval === "1w" || openT % info?.stepMs === 0;
    if (!info || !aligned || openT < info.first || openT > info.last) return null;
    const descriptor = info.shards.find((shard) => shard.first <= openT && shard.last >= openT);
    if (!descriptor) return null;
    const anchored = interval === "1m" ? (await loadPnlAnchors()).get(openT) : null;
    const raw = anchored ?? (await loadShard(interval, descriptor)).bars.find((bar) => bar[0] === openT);
    if (!raw) return null;
    const row = buildCoreTimeline(await loadCoreModel(), interval, [raw]).bars[0];
    if (!row || !(row.av > 0) || !(row.c > 0) || !Number.isFinite(row.dep) || !Number.isFinite(row.dep_btc)) return null;
    return { ...row, interval };
  }

  let anchorPromise = null;
  function loadPnlAnchors() {
    if (!anchorPromise) {
      anchorPromise = fetchJson(new URL("data/archive/pnl-anchor-candles.json", document.baseURI))
        .then((doc) => {
          if (doc?.schema !== "paulwei.bitmex-pnl-anchor-candles.v1" || doc.symbol !== CONFIG.symbol
              || doc.interval !== "1m" || !Array.isArray(doc.bars)) throw new Error("pnl-anchor-candles.json 不合法");
          return new Map(doc.bars.map((bar) => [bar[0], bar]));
        })
        .catch(() => new Map());
    }
    return anchorPromise;
  }

  async function getDefaultPnlStart() {
    const model = await loadCoreModel();
    const at = model.baseline.baselineT;
    const origin = { kind: "first_record", time: at };
    const minute = await getPnlStartAt(Math.floor(at / 60_000) * 60_000, "1m").catch(() => null);
    if (minute) return { ...minute, origin };
    const hourly = await getExport(`timeline_${REFERENCE_INTERVAL}`);
    const bar = hourly.bars.find((row) => row.T >= at && row.av > 0 && row.c > 0
      && Number.isFinite(row.dep) && Number.isFinite(row.dep_btc));
    return bar ? { ...bar, interval: REFERENCE_INTERVAL, origin } : null;
  }

  async function getLatestCandleTime(interval) {
    if (!CONFIG.intervals.includes(interval)) return null;
    return (await loadCatalog()).intervals[interval].last;
  }

  async function getCashFlows() {
    const { raw } = await loadRawInputs();
    const deposits = (raw.walletFlows.baselineDeposits ?? [])
      .map(([time, amountXBt]) => ({ time, type: 'deposit', amount: Math.abs(amountXBt) / 1e8, asset: 'BTC' }));
    return [...deposits, ...raw.walletFlows.rows
      .filter(([, type]) => type === 1 || type === 2)
      .map(([time, type, amountXBt]) => ({ time, type: type === 1 ? 'deposit' : 'withdraw',
        amount: Math.abs(amountXBt) / 1e8, asset: 'BTC' }))]
      .sort((a, b) => a.time - b.time);
  }

  function retainActiveTimeline(interval) {
    retainedInterval = interval;
    for (const key of exportsCache.keys()) {
      if (key.startsWith('timeline_') && key !== `timeline_${interval}` &&
          key !== `timeline_${REFERENCE_INTERVAL}`) exportsCache.delete(key);
    }
    for (const key of candleArchives.keys()) {
      if (key.startsWith(`${CONFIG.symbol}|`) && key !== `${CONFIG.symbol}|${interval}` &&
          key !== `${CONFIG.symbol}|${REFERENCE_INTERVAL}`) candleArchives.delete(key);
    }
    pruneShardCache();
  }

  global.TradeVizData = global.PaulWeiBrowserData = Object.freeze({
    config: CONFIG,
    getExport,
    getCandleArchive: loadCandleArchive,
    ensureCandleRange,
    getLatestCandleTime,
    getDefaultPnlStart,
    getPnlStartAt,
    getCashFlows,
    retainActiveTimeline,
    metrics,
    rawInputs: loadRawInputs,
    sourceHash: (name) => sourceHashes[name] ?? null,
  });
})(globalThis);
