(function installOrderIntent(global) {
  "use strict";

  const SCHEMA = "tradeviz.order-market-reference.v1";
  const THRESHOLD = 0.002;
  const MAX_AGE_MS = Object.freeze({ hyperliquid: 60000, bitmex: 6000 });
  const number = value => (typeof value === "number" || (typeof value === "string" && value.trim() !== ""))
    && Number.isFinite(Number(value)) ? Number(value) : null;
  const positive = value => { const n = number(value); return n > 0 ? n : null; };
  const timestamp = value => Number.isSafeInteger(value) && value > 0;
  const orderKey = order => JSON.stringify([order.venue, String(order.oid), order.timestamp, Number(order.limit_px), order.side]);

  function validOrder(order) {
    return order && Object.hasOwn(MAX_AGE_MS, order.venue) && /^(?:\d+|[a-f0-9-]{36})$/i.test(String(order.oid))
      && timestamp(order.timestamp) && positive(order.limit_px) !== null
      && ["B", "A"].includes(order.side) && order.creation_known === true;
  }

  function normalizeThreshold(value) {
    const n = number(value);
    return n !== null && n >= 0 ? n : THRESHOLD;
  }

  function classify(baseActive, order, reference, threshold = THRESHOLD) {
    const base = baseActive === true;
    if (!validOrder(order) || reference?.venue !== order.venue || !timestamp(reference?.time)
        || reference.time >= order.timestamp || order.timestamp - reference.time > MAX_AGE_MS[order.venue]
        || !Array.isArray(reference.prices) || !reference.prices.length || reference.prices.some(p => positive(p) === null)) {
      return { active: base, overridden: false, reason: "no-valid-reference" };
    }
    const distances = reference.prices.map(price => Math.abs(Number(order.limit_px) - price) / price);
    const limit = normalizeThreshold(threshold);
    const within = distances.map(distance => limit === 0 ? distance === 0 : distance <= limit + Number.EPSILON * 4);
    const all = within.every(Boolean), any = within.some(Boolean);
    return { active: base || all, overridden: !base && all,
      reason: all ? "placement-distance" : any ? "ambiguous-reference" : "outside-threshold",
      distanceMin: Math.min(...distances), distanceMax: Math.max(...distances), reference };
  }

  function hyperliquidOrders(records, fills = []) {
    const filled = new Map();
    for (const fill of fills) {
      if (fill?.coin === "BTC" && timestamp(fill.time) && positive(fill.sz) !== null) {
        filled.set(String(fill.oid), Math.max(filled.get(String(fill.oid)) || 0, fill.time));
      }
    }
    const groups = new Map();
    for (const record of records || []) {
      const raw = record?.order;
      if (raw?.coin !== "BTC") continue;
      const order = { venue: "hyperliquid", oid: raw.oid, timestamp: raw.timestamp,
        limit_px: positive(raw.limitPx), side: raw.side, creation_known: true,
        last_fill_time: filled.get(String(raw.oid)) || null };
      const key = String(raw.oid), prior = groups.get(key);
      if (!prior) groups.set(key, order);
      else if (orderKey(prior) !== orderKey(order)) prior.creation_known = false;
    }
    return [...groups.values()].sort((a, b) => a.timestamp - b.timestamp);
  }

  function emptyArchive(venue = "hyperliquid") {
    return { schema: SCHEMA, venue, timeBasis: "order-created", coverageThrough: 0, entries: {}, queries: {} };
  }

  function bitmexOrders(records, events, fills = []) {
    const created = new Map(), filled = new Map();
    for (const [time, , , , , , id] of fills) filled.set(String(id), Math.max(time, filled.get(String(id)) || 0));
    for (const [time, type, price, , id, stop] of events?.rows || []) {
      if (type !== 1 || stop > 0) continue;
      const key = String(id), prior = created.get(key);
      if (!prior) created.set(key, { time, price, conflict: false });
      else if (prior.time !== time || prior.price !== price) prior.conflict = true;
    }
    return records.map(row => {
      const id = String(row[8]), start = created.get(id);
      return { venue: "bitmex", oid: id, timestamp: start?.time || 0,
        limit_px: positive(start?.price), side: row[3] >= 0 ? "B" : "A",
        creation_known: Boolean(start && !start.conflict), last_fill_time: filled.get(id) || null };
    });
  }

  function validArchive(archive, venue) {
    return archive?.schema === SCHEMA && archive.venue === venue && archive.timeBasis === "order-created"
      && archive.entries && typeof archive.entries === "object" && !Array.isArray(archive.entries)
      && archive.queries && typeof archive.queries === "object" && !Array.isArray(archive.queries);
  }

  function referenceFor(order, archive) {
    if (!validOrder(order) || !validArchive(archive, order.venue)) return null;
    const entry = archive.entries[orderKey(order)];
    if (entry?.status !== "available" || !Array.isArray(entry.queryIds)) return null;
    let latest = null;
    const prices = new Set(), evidence = [];
    const consider = (time, price, source) => {
      price = positive(price);
      if (!timestamp(time) || time >= order.timestamp || price === null || order.timestamp - time > MAX_AGE_MS[order.venue]) return;
      if (latest === null || time > latest) { latest = time; prices.clear(); evidence.length = 0; }
      if (time === latest) { prices.add(price); evidence.push(source); }
    };
    for (const id of entry.queryIds) {
      const query = archive.queries[id];
      if (query?.venue !== order.venue || !Array.isArray(query.response)) continue;
      if (order.venue === "hyperliquid") {
        for (const block of query.response) for (const fill of block?.fills || []) {
          if (fill.coin === "BTC" && fill.crossed === true) consider(fill.time, fill.px, { query: id, block: block.header?.number, tid: fill.tid });
        }
      } else {
        for (const quote of query.response) {
          const bid = positive(quote.bidPrice), ask = positive(quote.askPrice);
          if (quote.symbol !== "XBTUSD" || bid === null || ask === null || bid > ask) continue;
          consider(Date.parse(quote.timestamp), order.side === "B" ? ask : bid, { query: id, bid, ask });
        }
      }
    }
    return latest === null ? null : { venue: order.venue, time: latest, ageMs: order.timestamp - latest,
      kind: order.venue === "hyperliquid" ? "sqd-market-trade" : "bitmex-best-quote",
      prices: [...prices].sort((a, b) => a - b), evidence };
  }

  function applyToFills(fills, orders, archive, identity = "oid") {
    const byId = new Map(orders.map(order => [String(order.oid), order]));
    const decisions = new Map();
    return fills.map(fill => {
      const base = fill.exchange_crossed ?? fill.crossed;
      const order = byId.get(String(fill[identity]));
      const key = String(fill[identity]);
      if (!decisions.has(key)) decisions.set(key, referenceFor(order, archive));
      const intent = classify(base, order, decisions.get(key));
      return { ...fill, exchange_crossed: base, crossed: intent.active, intent: { ...intent, order } };
    });
  }

  function reclassifyFills(fills, threshold) {
    return fills.map(fill => {
      if (!fill.intent) return fill;
      const intent = classify(fill.exchange_crossed, fill.intent.order, fill.intent.reference, threshold);
      return { ...fill, crossed: intent.active, intent: { ...intent, order: fill.intent.order } };
    });
  }

  function missingRecent(orders, archive, cutoff, now, attempted = new Set()) {
    if (!timestamp(cutoff) || !timestamp(now)) return [];
    return orders.filter(order => validOrder(order) && timestamp(order.last_fill_time)
      && order.last_fill_time > cutoff && order.last_fill_time <= now
      && order.timestamp <= order.last_fill_time && !archive.entries[orderKey(order)] && !attempted.has(orderKey(order)));
  }

  function createOnlineSource({ fetchReference, onChange = () => {} }) {
    const attempted = new Set();
    let running = null;
    function update(orders, archive, cutoff, now) {
      if (running) return running;
      const missing = missingRecent(orders, archive, cutoff, now, attempted);
      missing.forEach(order => attempted.add(orderKey(order)));
      running = (async () => {
        let changed = false;
        for (const order of missing) {
          try {
            const result = await fetchReference(order), key = orderKey(order);
            if (!validArchive(result, archive.venue) || !result.entries[key]) continue;
            archive.entries[key] = result.entries[key];
            Object.assign(archive.queries, result.queries);
            changed = true;
          } catch { }
        }
        if (changed) onChange();
        return changed;
      })().finally(() => { running = null; });
      return running;
    }
    return { update, attempted };
  }

  global.TradeVizOrderIntent = Object.freeze({ SCHEMA, MAX_AGE_MS, THRESHOLD, orderKey, validOrder,
    normalizeThreshold, classify, hyperliquidOrders, bitmexOrders, referenceFor, emptyArchive, validArchive,
    applyToFills, reclassifyFills, missingRecent, createOnlineSource });
})(globalThis);
