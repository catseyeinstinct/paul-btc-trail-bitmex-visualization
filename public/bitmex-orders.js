(function installBitmexOrders(global) {
  "use strict";

  const DAY_MS = 86_400_000;
  const ASSUME_MAX_DAYS = 50;
  const ASSUMED_ALPHA = 0.7;
  const ASSUME_DEFAULT_DAYS = Object.freeze({ filledDays: 1, unfilledDays: 2 });
  const assume = { ...ASSUME_DEFAULT_DAYS,
    get on() { return this.filledDays > 0 || this.unfilledDays > 0; } };

  const finalStatus = (order) => order.final_status ?? order.status;
  const orderPrice = (order) => (order.is_trigger ? order.trigger_px : order.limit_px);

  function orderBegin(order) {
    if (Number.isFinite(order.assumed_begin)) return Math.min(order.assumed_begin, order.timestamp);
    if (!assume.on || !order.assumable) return order.timestamp;
    return global.PaulWeiDataTransform.assumedStart(
      order, assume.filledDays * DAY_MS, assume.unfilledDays * DAY_MS);
  }

  function forBar(orders, bar) {
    if (!bar) return [];
    const start = bar.t, end = bar.T ?? bar.t;
    return orders.filter((order) => orderBegin(order) <= end
      && (order.status === "open" || order.status_timestamp >= start));
  }

  function candleAtOrBefore(candleTimes, ts) {
    let lo = 0, hi = candleTimes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (candleTimes[mid] <= ts) lo = mid + 1;
      else hi = mid;
    }
    return lo > 0 ? candleTimes[lo - 1] : null;
  }

  let candleTimesFor = null, candleTimes = [];
  function candleSeconds(bars) {
    if (candleTimesFor !== bars) {
      candleTimes = bars.map((bar) => Math.floor(bar.t / 1000));
      candleTimesFor = bars;
    }
    return candleTimes;
  }

  function assumeBeginCandle(order, times, startCandle) {
    const begin = orderBegin(order);
    if (!(begin < order.timestamp)) return null;
    const candle = candleAtOrBefore(times, Math.floor(begin / 1000));
    return (candle === null || candle >= startCandle) ? null : candle;
  }

  function projectOrders(orders, bars, { bar = null } = {}) {
    const groups = [[], [], [], []];
    groups.overlay = { events: [] };
    if (!bars?.length) return groups;
    const times = candleSeconds(bars);
    const firstCandle = times[0];
    const lastCandleEnd = Math.floor((bars.at(-1).T ?? bars.at(-1).t) / 1000);
    for (const order of bar ? forBar(orders, bar) : orders) {
      const px = orderPrice(order);
      if (!px) continue;
      const created = Math.floor(order.timestamp / 1000);
      const open = order.status === "open";
      const ended = open ? null : Math.floor(order.status_timestamp / 1000);
      if (created > lastCandleEnd || (ended !== null && ended < firstCandle)) continue;
      const startCandle = created < firstCandle ? firstCandle : candleAtOrBefore(times, created);
      if (startCandle === null) continue;
      const group = (order.side === "B" ? 0 : 2) + (finalStatus(order) === "filled" ? 0 : 1);
      if (order.event_evidence) {
        groups.overlay.events.push({ oid: order.oid, group, t: startCandle, px });
        continue;
      }
      let endCandle = startCandle;
      if (!open) {
        endCandle = candleAtOrBefore(times, ended);
        if (endCandle === null || endCandle < startCandle) endCandle = startCandle;
      }
      groups[group].push({ oid: order.oid, t1: startCandle, t2: endCandle, open, px,
        active: false, eb: assumeBeginCandle(order, times, startCandle) });
    }
    return groups;
  }

  function clipLine(x1, x2, rightEdge, cycle) {
    if (x1 >= rightEdge || x2 <= 0) return null;
    return [x1 < 0 ? (cycle ? -((-x1) % cycle) : 0) : x1, Math.min(x2, rightEdge)];
  }

  function drawOverlay(ctx, view) {
    drawAssumed(ctx, view);
    drawEvents(ctx, view);
    const { scope, timeScale } = view;
    drawPlacementCutoff(ctx, timeScale, scope, scope.horizontalPixelRatio, scope.verticalPixelRatio);
  }

  function highlightOverlay(ctx, view) {
    const oids = view.oids ?? new Set([view.oid]);
    const hovered = (item) => oids.has(String(item.oid));
    return drawAssumed(ctx, view, hovered) + drawEvents(ctx, view, hovered);
  }

  function rowY(series, scope, px, pad) {
    const y = series.priceToCoordinate(px);
    if (y == null) return null;
    const by = y * scope.verticalPixelRatio;
    return by < -pad || by > scope.mediaSize.height * scope.verticalPixelRatio + pad ? null : by;
  }

  function drawAssumed(ctx, { scope, timeScale, series, groups, nowSec, refSec, fullLineMode, hit }, keep = null) {
    const hpr = scope.horizontalPixelRatio, vpr = scope.verticalPixelRatio;
    const rightEdge = scope.mediaSize.width * hpr;
    let drawn = 0;
    for (let g = 0; g < 4; g += 1) {
      const segments = groups[g];
      if (!segments?.length) continue;
      const cycle = applyOrderLineStyle(ctx, g, hpr, vpr, ASSUMED_ALPHA);
      const pad = ctx.lineWidth / 2;
      ctx.beginPath();
      const add = makeDashBatcher(ctx, cycle);
      for (const seg of segments) {
        if (seg.eb == null || (keep && !keep(seg))) continue;
        const by = rowY(series, scope, seg.px, pad);
        if (by === null) continue;
        if (fullLineMode) {
          if (refSec == null) continue;
          const endsAfter = seg.open || seg.t2 > refSec;
          const evidenced = seg.t1 <= refSec && endsAfter;
          if (!evidenced && seg.eb <= refSec && endsAfter) {
            add(0, rightEdge, by);
            hit?.(seg.oid, 0, rightEdge, by);
            drawn += 1;
          }
          continue;
        }
        if (nowSec != null && seg.eb > nowSec) continue;
        const x1 = timeScale.timeToCoordinate(seg.eb);
        const x2 = timeScale.timeToCoordinate(seg.t1);
        if (x1 == null || x2 == null) continue;
        const clipped = clipLine(x1 * hpr, x2 * hpr, rightEdge, cycle);
        if (!clipped) continue;
        add(clipped[0], clipped[1], by);
        hit?.(seg.oid, clipped[0], clipped[1], by);
        drawn += 1;
      }
      ctx.stroke();
    }
    return drawn;
  }

  function drawEvents(ctx, { scope, timeScale, series, groups, nowSec, refSec, fullLineMode, hit }, keep = null) {
    const hpr = scope.horizontalPixelRatio, vpr = scope.verticalPixelRatio;
    const rightEdge = scope.mediaSize.width * hpr;
    let drawn = 0;
    for (const event of groups.overlay?.events ?? []) {
      if (keep && !keep(event)) continue;
      if (fullLineMode && event.t !== refSec) continue;
      if (nowSec != null && event.t > nowSec) continue;
      const cycle = applyOrderLineStyle(ctx, event.group, hpr, vpr);
      const by = rowY(series, scope, event.px, ctx.lineWidth / 2);
      const x = timeScale.timeToCoordinate(event.t);
      if (by === null || x == null) continue;
      const clipped = clipLine(x * hpr, x * hpr + 3 * hpr, rightEdge, cycle);
      if (!clipped) continue;
      ctx.beginPath();
      ctx.moveTo(clipped[0], by);
      ctx.lineTo(clipped[1], by);
      ctx.stroke();
      hit?.(event.oid, clipped[0], clipped[1], by);
      drawn += 1;
    }
    return drawn;
  }

  function drawPlacementCutoff(ctx, timeScale, scope, hpr, vpr) {
    const at = state.summary?.placement_cutoff;
    if (!at || !state.timeline?.bars?.length) return;
    const index = bisectLeq(state.timeline.bars, at, "t");
    if (index < 0) return;
    const x = timeScale.timeToCoordinate(Math.floor(state.timeline.bars[index].t / 1000));
    if (x == null) return;
    const bx = Math.round(x * hpr);
    const rightEdge = scope.mediaSize.width * hpr;
    if (bx < 0 || bx > rightEdge) return;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(255,167,38,0.55)";
    ctx.lineWidth = Math.max(1, Math.round(hpr));
    ctx.setLineDash([Math.round(4 * vpr), Math.round(4 * vpr)]);
    ctx.beginPath();
    ctx.moveTo(bx, 0);
    ctx.lineTo(bx, scope.mediaSize.height * vpr);
    ctx.stroke();
    ctx.setLineDash([]);
    const label = t("chart.placement_cutoff");
    ctx.font = `${Math.round(10 * vpr)}px system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const pad = Math.round(4 * hpr);
    const width = ctx.measureText(label).width;
    const box = bx + width + pad * 2 <= rightEdge ? bx : bx - width - pad * 2;
    const top = cutoffLabelTop(box / hpr, (box + width + pad * 2) / hpr, vpr);
    ctx.fillStyle = "rgba(20,22,28,0.82)";
    ctx.fillRect(box, top - Math.round(2 * vpr), width + pad * 2, Math.round(14 * vpr));
    ctx.fillStyle = "rgba(255,167,38,0.95)";
    ctx.fillText(label, box + pad, top);
    ctx.restore();
  }

  function cutoffLabelTop(left, right, vpr) {
    const doc = global.document;
    const pane = doc?.getElementById?.("chart-price")?.getBoundingClientRect?.();
    let top = 4;
    if (pane) {
      for (const el of [doc.querySelector?.(".price-chart-head"), doc.getElementById?.("chart-legend")]) {
        const r = el?.getBoundingClientRect?.();
        if (!r || !(r.width > 0 && r.height > 0)) continue;
        if (r.right - pane.left < left || r.left - pane.left > right) continue;
        top = Math.max(top, r.bottom - pane.top + 4);
      }
    }
    return Math.round(top * vpr);
  }

  const badge = (kind, title, text) => `<span class="badge ${kind}"${title ? ` title="${title}"` : ""}>${text}</span>`;

  function partialCancelValues(order, bar) {
    let contracts = 0, btc = 0;
    for (const fill of state.fills || []) {
      if (fill.oid !== order.oid) continue;
      contracts += Number(fill.contracts) || 0;
      btc += Number(fill.sz) || 0;
    }
    const filled = order.filled_contracts;
    const complete = btc > 0 && Math.abs(contracts - filled) <= Math.max(1e-8, filled * 1e-9);
    const px = orderPrice(order);
    const valueBtc = (size) => (px > 0 ? size * global.PaulWeiDataTransform.contractValueBtc(
      global.PaulWeiDataTransform.XBTUSD_SPEC, px) : null);
    return {
      price: complete ? contracts / btc : px,
      executedBtc: complete ? btc : valueBtc(filled),
      remainderBtc: valueBtc(order.remaining_contracts),
      notional: complete ? contracts : null,
      pct: complete && bar.av > 0 ? contracts / bar.av : null,
      complete,
    };
  }

  function decorateRow(tr, order, bar) {
    const cells = tr.cells;
    const sideText = order.side === "B" ? t("tbl.buy") : t("tbl.sell");
    const taker = order._liquidity === "taker" ? badge("taker", "", t("badge.taker")) : "";
    if (order.event_evidence) {
      tr.classList.remove("order-canceled");
      const label = badge("open", t("t.event"), t(order.event_type === "New" ? "badge.new"
        : order.event_type === "Replaced" ? "badge.replaced" : "badge.triggered"));
      cells[0].innerHTML = `${sideText} ${label}${taker}`;
    } else if (order.status === "canceled" && order.filled_contracts > 0) {
      const values = partialCancelValues(order, bar);
      cells[0].innerHTML = `${sideText} ${badge("canceled", "", t("badge.partial_canceled"))}${taker}`;
      cells[2].innerHTML = `<span title="${t("tbl.executed_size")}">${t("tbl.executed_size")} ${fmtBtc(values.executedBtc, 5)}</span>`
        + `<br><span class="muted" title="${t("tbl.canceled_remainder")}">${t("tbl.canceled_remainder")} ${fmtBtc(values.remainderBtc, 5)}</span>`;
      cells[3].textContent = fmtUsd(values.notional, 0);
      cells[4].textContent = values.pct === null ? "—" : `${(values.pct * 100).toFixed(2)}%`;
    }
    if (order.evidence && order._priceKind === "order") {
      cells[1].textContent = fmtUsd(order._px, 1);
      cells[1].title = `${t(order.is_trigger ? "tbl.trigger_price" : "tbl.limit_price")}: ${fmtUsd(order._px, 1)}`;
    }
    const assumedOnly = !order.evidence && (bar.T ?? bar.t) < order.timestamp;
    const observedStart = !order.evidence && order.event_observations?.some(([eventT, type, eventPx, , eventStop]) =>
      eventT === order.timestamp && (type === 3 || (eventStop || eventPx) === orderPrice(order)));
    const startMark = order.event_evidence ? badge("open", t("t.event"), t("badge.event"))
      : order.evidence ? badge("open", t("t.evidence"), t("badge.evidence"))
        : assumedOnly ? badge("canceled", t("t.assumed"), t("badge.assumed"))
          : observedStart ? badge("open", t("t.event_start"), t("badge.event"))
            : order.life_lower_bound ? badge("canceled", t("t.orders_inferred"), "≥") : "";
    cells[5].innerHTML = `${fmtTsShort(assumedOnly ? orderBegin(order) : order.timestamp)}${startMark ? " " + startMark : ""}`;
  }

  const MIGRATED_KEY = "bitmex_assume_defaults";
  function migrateOffSwitch(storage) {
    try {
      const stored = JSON.parse(storage?.getItem("ui_prefs") || "{}");
      if (!stored || typeof stored !== "object" || !("assume" in stored)) return;
      if (stored.assume === "off") {
        Object.assign(stored, { assumeFilledDays: "0", assumeUnfilledDays: "0" });
        storage.setItem(MIGRATED_KEY, "1-2");
      }
      delete stored.assume;
      storage.setItem("ui_prefs", JSON.stringify(stored));
    } catch { }
  }
  try { migrateOffSwitch(global.localStorage); } catch { }

  function migrateAssumeDefaults(storage) {
    try {
      if (!storage || storage.getItem(MIGRATED_KEY) === "1-2") return;
      const stored = JSON.parse(storage.getItem("ui_prefs") || "{}");
      if (stored && typeof stored === "object" && String(stored.assumeFilledDays) === "0"
          && String(stored.assumeUnfilledDays) === "0") {
        stored.assumeFilledDays = String(ASSUME_DEFAULT_DAYS.filledDays);
        stored.assumeUnfilledDays = String(ASSUME_DEFAULT_DAYS.unfilledDays);
        storage.setItem("ui_prefs", JSON.stringify(stored));
      }
      storage.setItem(MIGRATED_KEY, "1-2");
    } catch { }
  }
  try { migrateAssumeDefaults(global.localStorage); } catch { }

  function bindControls(document) {
    const redraw = () => {
      if (typeof state === "undefined" || !state.timeline) return;
      state._allOrderSegments = null;
      renderForSelected();
    };
    for (const [id, key] of [["assume-filled-days", "filledDays"], ["assume-unfilled-days", "unfilledDays"]]) {
      const input = document.getElementById(id);
      if (!input) continue;
      input.max = String(ASSUME_MAX_DAYS);
      input.value = String(assume[key]);
      input.addEventListener("change", () => {
        const value = Number(input.value);
        const next = input.value !== "" && Number.isFinite(value) && value >= 0
          ? Math.min(value, ASSUME_MAX_DAYS) : assume[key];
        input.value = String(next);
        input._syncFormControl?.();
        if (next === assume[key]) return;
        assume[key] = next;
        redraw();
      });
    }
  }
  if (global.document) bindControls(global.document);

  global.BitmexOrders = Object.freeze({
    model: Object.freeze({ forBar, projectOrders }),
    drawOverlay,
    highlightOverlay,
    decorateRow,
    assumedBegin: orderBegin,
    prefControls: Object.freeze([
      Object.freeze({ key: "assumeFilledDays", id: "assume-filled-days", kind: "number", event: "change" }),
      Object.freeze({ key: "assumeUnfilledDays", id: "assume-unfilled-days", kind: "number", event: "change" }),
    ]),
    assumption: assume,
    assumeDefaults: ASSUME_DEFAULT_DAYS,
    migrateOffSwitch,
    migrateAssumeDefaults,
  });
})(globalThis);
