(function installPaulWeiDataTransform(global) {
  "use strict";

  const SATOSHI = 1e8;
  const XBTUSD_SPEC = Object.freeze({ symbol: "XBTUSD", kind: "inverse", k: SATOSHI });
  const ORDER_STATUS = ["filled", "canceled", "rejected", "open", "partial"];
  const RESTING_TYPES = new Set(["Limit", "Stop", "StopLimit", "MarketIfTouched", "LimitIfTouched"]);
  const INTERVAL_MS = {
    "1m": 60_000,
    "3m": 3 * 60_000,
    "5m": 5 * 60_000,
    "15m": 15 * 60_000,
    "1h": 60 * 60_000,
    "4h": 4 * 60 * 60_000,
    "1d": 24 * 60 * 60_000,
    "1w": 7 * 24 * 60 * 60_000,
  };

  function intervalMilliseconds(interval) {
    const ms = INTERVAL_MS[interval];
    if (!ms) throw new Error(`Unsupported interval: ${interval}`);
    return ms;
  }

  function normalizeCandles(bars, interval) {
    const span = intervalMilliseconds(interval);
    const out = new Array(bars.length);
    for (let i = 0; i < bars.length; i += 1) {
      const b = bars[i];
      out[i] = { t: b[0], T: b[0] + span - 1, o: b[1], h: b[2], l: b[3], c: b[4], v: b[5] };
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  function replayFills(rawFills, spec = XBTUSD_SPEC) {
    const unit = spec.k > 0 ? spec.k / SATOSHI : 0;
    const sorted = rawFills.slice().sort((a, b) => a[0] - b[0]);
    const events = new Array(sorted.length);
    let Q = 0;
    let C = 0;
    let comm = 0;
    let rpnl = 0;
    let closed = 0;

    for (let i = 0; i < sorted.length; i += 1) {
      const [t, q, px, commXBt, rpnlXBt, taker, ordId] = sorted[i];
      comm += commXBt;
      rpnl += rpnlXBt;

      if (px > 0) {
        const inverse = spec.kind === "inverse";
        const opening = Q === 0 || Math.sign(q) === Math.sign(Q);
        if (opening) {
          C += inverse ? (q * unit) / px : q * unit * px;
        } else if (Math.abs(q) <= Math.abs(Q)) {
          if (inverse) closed += C * (-q / Q) + (q * unit) / px;
          C -= C * (Math.abs(q) / Math.abs(Q));
        } else {
          if (inverse) closed += C - (Q * unit) / px;
          const excess = q + Q;
          C = inverse ? (excess * unit) / px : excess * unit * px;
        }
      }
      Q += q;
      if (Q === 0) C = 0;

      events[i] = {
        t, qty: q, px, taker: taker === 1, ordId,
        commXBt, rpnlXBt,
        pos: Q, cost: C,
        commCumXBt: comm, rpnlCumXBt: rpnl,
        closedCum: closed,
      };
    }
    return events;
  }

  function unrealisedBtc(pos, cost, mark) {
    if (!pos || !(mark > 0)) return 0;
    return cost - pos / mark;
  }

  function contractValueBtc(spec, px) {
    if (!spec || !(spec.k > 0) || !(px > 0)) return 0;
    const unit = spec.k / SATOSHI;
    return spec.kind === "inverse" ? unit / px : unit * px;
  }

  function avgEntryFor(spec, pos, cost) {
    if (!pos || !cost || !spec || !(spec.k > 0)) return null;
    const unit = spec.k / SATOSHI;
    return spec.kind === "inverse" ? (pos * unit) / cost : cost / (pos * unit);
  }

  function normalizeEquity(rawEquity) {
    return rawEquity
      .slice()
      .sort((a, b) => a[0] - b[0])
      .map((e) => ({
        t: e[0], type: e[1], wallet: e[2], cumDep: e[3], cumWd: e[4], adjWealth: e[5],
        walletXbt: e[6],
      }));
  }

  function normalizeFunding(rawFunding) {
    return (rawFunding || []).map((r) => ({ t: r[0], paidXBt: r[3] })).sort((a, b) => a.t - b.t);
  }

  function bisectLeq(arr, t, key = "t") {
    let lo = 0;
    let hi = arr.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid][key] <= t) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    return ans;
  }

  function buildOrders(rawOrders, fillEvents, evidence, bounds, boundaryOverride, orderEvents) {
    const evidenceByOrder = (evidence && evidence.orders) || {};
    const priceFloors = (bounds && bounds.floors) || {};
    const eventsByOrder = new Map();
    for (const [t, type, px, qty, ordId, stopPx] of orderEvents?.rows || []) {
      const events = eventsByOrder.get(ordId) || [];
      events.push([t, type, px, qty, stopPx]);
      eventsByOrder.set(ordId, events);
    }
    for (const events of eventsByOrder.values()) events.sort((a, b) => a[0] - b[0]);
    const byOrder = new Map();
    for (const f of fillEvents) {
      if (!f.ordId) continue;
      const cur = byOrder.get(f.ordId);
      if (cur) {
        if (f.t < cur.first) { cur.first = f.t; cur.firstTaker = f.taker; }
        else if (f.t === cur.first && f.taker) cur.firstTaker = true;
        cur.last = Math.max(cur.last, f.t);
        cur.n += 1;
      } else {
        byOrder.set(f.ordId, { first: f.t, last: f.t, n: 1, firstTaker: f.taker });
      }
    }

    const orders = rawOrders
      .map((o, index) => {
        const [t, transactT, status, qty, px, cumQty, avgPx, ordType, ordId, stopPx] = o;
        const seen = byOrder.get(ordId);
        const ev = evidenceByOrder[ordId];
        const observed = eventsByOrder.get(ordId) || [];
        const placementKnown = transactT > 0 && t - transactT >= 1000;
        const placed = transactT || t;
        let started = seen ? Math.min(placed, seen.first) : placed;
        const since = ev ? ev.sinceAtFinalPx : null;
        if (since && since < started) started = since;
        const ended = seen ? Math.max(t, seen.last) : t;
        return {
          oid: index,
          order_id: ordId,
          side: qty >= 0 ? "B" : "A",
          limit_px: px || null,
          is_trigger: Boolean(stopPx),
          trigger_px: stopPx || null,
          sz: Math.abs(qty) - cumQty,
          orig_sz: Math.abs(qty),
          filled_sz: cumQty,
          avg_px: avgPx || null,
          order_type: ordType || null,
          status: ORDER_STATUS[status] || "unknown",
          timestamp: started,
          status_timestamp: ended,
          placement_known: placementKnown,
          life_lower_bound: !placementKnown || Boolean(seen && placed > seen.first),
          evidence_since: since || null,
          evidence_until: (ev && ev.untilAtFinalPx) || null,
          event_observations: observed,
          price_floor: priceFloors[ordId] || null,
          assume_floor: Math.max((ev && ev.floor) || 0, priceFloors[ordId] || 0) || null,
          first_fill_taker: Boolean(seen && seen.firstTaker),
          fill_count: seen ? seen.n : 0,
          assumable: false,
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp || a.oid - b.oid);

    const boundary = boundaryOverride !== undefined ? boundaryOverride : placementCutoff(orders);
    for (const o of orders) {
      if (o.placement_known || o.status === "rejected" || !RESTING_TYPES.has(o.order_type)) continue;
      if (o.event_observations.length) continue;
      if (o.is_trigger) {
        o.assumable = true;
      } else if (o.order_type === "Limit") {
        o.assumable = boundary !== null && o.status_timestamp > boundary && !o.first_fill_taker;
      }
    }
    return orders;
  }

  function assumedStart(order, filledMs, unfilledMs) {
    if (!order.assumable) return order.timestamp;
    const span = order.status === "filled" ? filledMs : unfilledMs;
    if (!(span > 0)) return order.timestamp;
    let start = order.status_timestamp - span;
    if (order.assume_floor && start < order.assume_floor) start = order.assume_floor;
    return Math.min(start, order.timestamp);
  }

  function buildOrderEvidence(orders, evidence, orderEvents) {
    const segsByOrder = (evidence && evidence.orders) || {};
    const byId = new Map(orders.map((o) => [o.order_id, o]));
    const out = [];
    for (const [ordId, ev] of Object.entries(segsByOrder)) {
      const parent = byId.get(ordId);
      if (!parent || !Array.isArray(ev.segs)) continue;
      ev.segs.forEach(([t0, t1, px, qty], k) => {
        out.push({
          ...parent,
          oid: parent.oid + (k + 1) / 1000,
          evidence: true,
          limit_px: parent.is_trigger ? parent.limit_px : px,
          trigger_px: parent.is_trigger ? px : parent.trigger_px,
          sz: qty,
          orig_sz: qty,
          filled_sz: 0,
          timestamp: t0,
          status_timestamp: t1,
          life_lower_bound: false,
          evidence_since: null,
          evidence_until: null,
          assumable: false,
        });
      });
    }
    for (const parent of orders) {
      if (!parent.event_observations?.length) continue;
      parent.event_observations.forEach(([t, type, px, qty, stopPx], k) => {
        out.push({
          ...parent,
          oid: parent.oid + (k + 1) / 10000,
          evidence: true,
          event_evidence: true,
          event_type: type === 1 ? "New" : type === 2 ? "Replaced" : "TriggeredOrActivatedBySystem",
          limit_px: px || null,
          trigger_px: stopPx || null,
          is_trigger: Boolean(stopPx),
          sz: qty,
          orig_sz: qty,
          filled_sz: 0,
          timestamp: t,
          status_timestamp: t,
          life_lower_bound: false,
          evidence_since: null,
          evidence_until: null,
          assumable: false,
        });
      });
    }
    return out.sort((a, b) => a.timestamp - b.timestamp || a.oid - b.oid);
  }

  function splitAmendedOrders(orders, fillEvents, rawOrders = []) {
    const fillsByOrder = new Map();
    for (const f of fillEvents) {
      if (!f.ordId) continue;
      const list = fillsByOrder.get(f.ordId);
      if (list) list.push(f);
      else fillsByOrder.set(f.ordId, [f]);
    }
    const filledOf = (fills) => fills.reduce((sum, f) => sum + Math.abs(f.qty), 0);
    const vwapOf = (fills) => filledOf(fills) / fills.reduce((sum, f) => sum + Math.abs(f.qty) / f.px, 0);
    const versions = [];
    for (const order of orders) {
      if (order.order_type !== "Limit" || order.is_trigger || !(order.limit_px > 0)) continue;
      const fills = fillsByOrder.get(order.order_id);
      if (!fills?.some((f) => !f.taker && f.px !== order.limit_px)) continue;
      fills.sort((a, b) => a.t - b.t);
      const fits = (px, stagePx) => (order.side === "B" ? px <= stagePx : px >= stagePx);
      const stages = [];
      let pending = [];
      for (const f of fills) {
        const current = stages.at(-1);
        if (f.taker) {
          if (current && fits(f.px, current.px)) current.fills.push(f);
          else pending.push(f);
        } else if (current && current.px === f.px) {
          current.fills.push(f);
        } else {
          stages.push({ px: f.px, fills: [...pending, f] });
          pending = [];
        }
      }
      if (stages.at(-1).px !== order.limit_px) stages.push({ px: order.limit_px, fills: [] });
      stages.at(-1).fills.push(...pending);
      const final = stages.at(-1);
      const transactT = rawOrders[order.oid]?.[1] || null;
      const finalStart = order.placement_known && transactT ? transactT
        : (final.fills[0]?.t ?? order.status_timestamp);
      const total = order.orig_sz;
      let carried = 0;
      stages.slice(0, -1).forEach((stage, k) => {
        const filled = filledOf(stage.fills);
        const size = total - carried;
        const last = stage.fills.at(-1).t;
        const oid = `${order.oid}~p${k}`;
        for (const f of stage.fills) f.versionOid = oid;
        versions.push({ ...order, oid, version_of: order.oid,
          limit_px: stage.px, status: "canceled",
          orig_sz: size, filled_sz: filled, sz: size - filled, avg_px: vwapOf(stage.fills),
          timestamp: stage.fills[0].t,
          status_timestamp: k === stages.length - 2 && order.placement_known ? Math.max(finalStart, last) : last,
          placement_known: false, life_lower_bound: true,
          evidence_since: null, evidence_until: null, event_observations: [], price_floor: null, assume_floor: null,
          first_fill_taker: Boolean(stage.fills[0].taker), fill_count: stage.fills.length, assumable: false });
        carried += filled;
      });
      const finalFilled = filledOf(final.fills);
      Object.assign(order, {
        archive_contracts: total,
        orig_sz: total - carried,
        filled_sz: finalFilled,
        sz: total - carried - finalFilled,
        avg_px: final.fills.length ? vwapOf(final.fills) : null,
        timestamp: Math.min(order.evidence_since ?? Infinity, finalStart),
        life_lower_bound: !order.placement_known,
        fill_count: final.fills.length,
        first_fill_taker: Boolean(final.fills[0]?.taker),
        assumable: order.assumable && !final.fills[0]?.taker,
      });
    }
    return versions;
  }

  function buildFills(fillEvents, spec = XBTUSD_SPEC, orders = []) {
    const oidByOrderId = new Map(orders.filter((o) => !o.evidence && o.version_of == null).map((o) => [o.order_id, o.oid]));
    return fillEvents.map((f, i) => ({
      tid: i,
      oid: f.versionOid ?? oidByOrderId.get(f.ordId) ?? null,
      time: f.t,
      side: f.qty >= 0 ? "B" : "A",
      px: f.px,
      sz: Math.abs(f.qty),
      sz_btc: Math.abs(f.qty) * contractValueBtc(spec, f.px),
      crossed: f.taker,
      dir: f.qty >= 0 ? "Buy" : "Sell",
      closed_pnl: f.rpnlXBt / SATOSHI,
      fee: f.commXBt / SATOSHI,
      pos_after: f.pos,
    }));
  }

  function createUsdLedger(referenceBars, fillEvents, equity, baseline, eventMinutePrices, walletFlows) {
    const reference = normalizeCandles(referenceBars, "1h");
    if (!reference.length) throw new Error("USD conversion requires historical 1h candles");
    const eventPrices = eventMinutePrices && new Map(eventMinutePrices);
    function priceAt(t) {
      if (eventPrices) {
        const price = eventPrices.get(Math.floor(t / 60_000) * 60_000);
        if (!(price > 0)) throw new Error(`Missing BitMEX event-minute price at ${t}`);
        return price;
      }
      const i = bisectLeq(reference, t, "T");
      return reference[Math.min(reference.length - 1, i + 1)].c;
    }
    if (walletFlows?.schema !== "paulwei.bitmex-btc-wallet-flows.v2" ||
        walletFlows.baselineT !== baseline.baselineT || !Array.isArray(walletFlows.rows)) {
      throw new Error("BTC wallet flows with contract ownership are required");
    }
    let externalUsd = 0, externalBtc = 0;
    let priorWalletTime = baseline.baselineT;
    const walletCash = walletFlows.rows.map(([t, type, amountXBt, symbol, swapCost]) => {
      if (t < priorWalletTime || !Number.isSafeInteger(amountXBt) ||
          ![1, 2, 3, 4, 5, 6, 7].includes(type) ||
          ((type === 6 || type === 7) && !symbol) ||
          ((type === 4 || type === 5) && !Number.isFinite(swapCost))) {
        throw new Error(`Invalid ordered BTC wallet flow at ${t}`);
      }
      priorWalletTime = t;
      if (type !== 6 && type !== 7 || symbol !== "XBTUSD") {
        externalBtc += amountXBt / SATOSHI;
        externalUsd += type === 4 || type === 5 ? swapCost : amountXBt / SATOSHI * priceAt(t);
      }
      return { t, externalUsd, externalBtc };
    });
    const initialFill = bisectLeq(fillEvents, baseline.baselineT);
    const initial = initialFill < 0 ? null : fillEvents[initialFill];
    const baselinePrice = priceAt(baseline.baselineT);
    const baselineUpnlUsd = unrealisedBtc(initial?.pos || 0, initial?.cost || 0, baselinePrice) * baselinePrice;
    const baselineBtcNavUsd = (equity[0].walletXbt + baselineUpnlUsd / baselinePrice) * baselinePrice;
    const baselineBtcNav = baselineBtcNavUsd / baselinePrice;
    const twrSteps = timeWeightedSteps(walletFlows.rows, equity[0].walletXbt, fillEvents, priceAt,
      baseline.baselineT, baselineBtcNav, baselineBtcNavUsd);
    return { at(t) {
      const w = bisectLeq(walletCash, t);
      const s = bisectLeq(twrSteps, t);
      return { baselineUsd: baselineBtcNavUsd,
        baselineBtcNav,
        externalUsd: w < 0 ? 0 : walletCash[w].externalUsd,
        externalBtc: w < 0 ? 0 : walletCash[w].externalBtc,
        twr: s < 0 ? null : twrSteps[s] };
    } };
  }

  function timeWeightedSteps(flowRows, baselineWalletBtc, fillEvents, priceAt, baselineT, baselineBtc, baselineUsd) {
    const ok = baselineBtc > 0 && baselineUsd > 0;
    const steps = [{ t: baselineT, growthUsd: 1, growthBtc: 1,
      basisUsd: ok ? baselineUsd : null, basisBtc: ok ? baselineBtc : null, invalid: !ok }];
    let { growthUsd, growthBtc, basisUsd, basisBtc, invalid } = steps[0];
    let walletXBt = Math.round(baselineWalletBtc * SATOSHI);
    for (let i = 0; i < flowRows.length;) {
      const t = flowRows[i][0];
      const walletBefore = walletXBt / SATOSHI;
      let flowBtc = 0, flowUsd = 0, external = false;
      for (; i < flowRows.length && flowRows[i][0] === t; i += 1) {
        const [, type, amountXBt, symbol, swapCost] = flowRows[i];
        walletXBt += amountXBt;
        if ((type === 6 || type === 7) && symbol === "XBTUSD") continue;
        external = true;
        flowBtc += amountXBt / SATOSHI;
        flowUsd += type === 4 || type === 5 ? swapCost : amountXBt / SATOSHI * priceAt(t);
      }
      if (!external) continue;
      if (!invalid) {
        const f = bisectLeq(fillEvents, t);
        const price = priceAt(t);
        const beforeBtc = walletBefore
          + unrealisedBtc(f < 0 ? 0 : fillEvents[f].pos, f < 0 ? 0 : fillEvents[f].cost, price);
        const beforeUsd = beforeBtc * price;
        const afterBtc = beforeBtc + flowBtc;
        const afterUsd = beforeUsd + flowUsd;
        const tolerance = 1e-9 * Math.max(1, Math.abs(beforeBtc), Math.abs(flowBtc));
        if (!Number.isFinite(afterBtc) || !Number.isFinite(afterUsd) || afterBtc < -tolerance
            || (basisBtc !== null && (beforeBtc <= 0 || beforeUsd <= 0))) {
          invalid = true;
        } else {
          if (basisBtc !== null) {
            growthBtc *= beforeBtc / basisBtc;
            growthUsd *= beforeUsd / basisUsd;
          } else if (beforeBtc < -tolerance) {
            invalid = true;
          }
          basisBtc = afterBtc > tolerance ? afterBtc : null;
          basisUsd = afterBtc > tolerance && afterUsd > 0 ? afterUsd : null;
          if ((basisBtc === null) !== (basisUsd === null)) invalid = true;
        }
      }
      steps.push({ t, growthUsd, growthBtc, basisUsd, basisBtc, invalid });
    }
    return steps;
  }

  function buildTimeline(interval, candleBars, fillEvents, equity, funding, usdLedger) {
    if (!usdLedger) throw new Error("BTC combined PnL requires the raw BTC wallet ledger");
    const bars = normalizeCandles(candleBars, interval);
    let fi = 0;
    let ei = 0;
    let fui = 0;
    let pos = 0;
    let cost = 0;
    let commCum = 0;
    let rpnlCum = 0;
    let closedCum = 0;
    let fundingCum = 0;
    let wallet = null;
    let walletXbt = null;

    const out = [];
    for (let i = 0; i < bars.length; i += 1) {
      const bar = bars[i];
      const barFills = [];

      while (fi < fillEvents.length && fillEvents[fi].t <= bar.T) {
        const f = fillEvents[fi];
        if (f.t >= bar.t) {
          barFills.push({
            tid: fi, time: f.t,
            side: f.qty >= 0 ? "B" : "A",
            px: f.px, sz: Math.abs(f.qty),
            notional: Math.abs(f.qty),
            crossed: f.taker,
            dir: f.qty >= 0 ? "Buy" : "Sell",
            closed_pnl: f.rpnlXBt / SATOSHI,
          });
        }
        pos = f.pos; cost = f.cost;
        commCum = f.commCumXBt; rpnlCum = f.rpnlCumXBt;
        closedCum = f.closedCum;
        fi += 1;
      }

      while (ei < equity.length && equity[ei].t <= bar.T) {
        wallet = equity[ei].wallet;
        walletXbt = equity[ei].walletXbt;
        ei += 1;
      }

      while (fui < funding.length && funding[fui].t <= bar.T) {
        fundingCum += funding[fui].paidXBt / SATOSHI;
        fui += 1;
      }

      const position = {
        pos,
        avg_entry: avgEntryFor(XBTUSD_SPEC, pos, cost),
        pos_btc: bar.c > 0 ? pos * contractValueBtc(XBTUSD_SPEC, bar.c) : 0,
        notional: pos,
        btc_c: bar.c,
      };

      if (wallet === null) {
        out.push({ ...bar, ...position, av: null, av_btc: null, lev: null,
                   lev_spot: null, lev_xbtusd: null,
                   pnl: null, pnl_btc: null, mult: null, upnl_btc: null,
                   fee_btc: null, rpnl_btc: null, fills: barFills });
        continue;
      }

      const upnl = unrealisedBtc(pos, cost, bar.c);
      const usd = usdLedger.at(bar.T);
      const dollarBaseline = usd.baselineUsd;
      const holdBtc = walletXbt + upnl;
      const holdUsd = holdBtc * bar.c;
      const ok = holdUsd > 0;
      const pnlUsd = holdUsd - usd.baselineUsd - usd.externalUsd;
      const pnlBtc = pnlUsd / bar.c;
      const twr = usd.twr;
      const twrOk = Boolean(twr) && !twr.invalid && twr.basisBtc > 0 && twr.basisUsd > 0;
      out.push({
        ...bar,
        ...position,
        av: holdUsd,
        av_btc: holdBtc,
        lev: ok ? (holdUsd + pos) / holdUsd : null,
        lev_spot: ok ? 1 : null,
        lev_xbtusd: ok ? pos / holdUsd : null,
        upnl_btc: upnl,
        dep: 0,
        pnl: pnlUsd,
        external_usd: usd.externalUsd,
        external_btc: usd.externalBtc,
        dep_btc: 0,
        pnl_btc: pnlBtc,
        pnl_native_btc: holdBtc - usd.baselineBtcNav - usd.externalBtc,
        twr_usd: twrOk ? twr.growthUsd * holdUsd / twr.basisUsd : null,
        twr_btc: twrOk ? twr.growthBtc * holdBtc / twr.basisBtc : null,
        base_btc: usd.baselineBtcNav,
        base_usd: dollarBaseline,
        mult: dollarBaseline > 0 ? 1 + pnlUsd / dollarBaseline : null,
        fee_btc: commCum / SATOSHI,
        rpnl_btc: rpnlCum / SATOSHI,
        closing_pnl_btc: closedCum,
        funding_btc: fundingCum,
        fills: barFills,
      });
    }

    return {
      interval,
      symbol: XBTUSD_SPEC.symbol,
      source: "BitMEX 自家 K 线，叠加浏览器端重放的成交、仓位与权益曲线",
      bars: out,
    };
  }

  function placementCutoff(orders) {
    const informative = orders
      .filter((o) => o.order_type === "Limit" && !o.is_trigger && o.status !== "rejected" && !o.first_fill_taker)
      .sort((a, b) => a.timestamp - b.timestamp || a.oid - b.oid);
    let walk = 0;
    let low = 0;
    let cutoff = null;
    for (const o of informative) {
      walk += o.placement_known ? -1 : 1;
      if (walk <= low) {
        low = walk;
        cutoff = o.timestamp;
      }
    }
    return walk > low ? cutoff : null;
  }

  function medianOrderLife(orders) {
    if (!orders.length) return null;
    const lives = orders
      .map((o) => o.status_timestamp - o.timestamp)
      .sort((a, b) => a - b);
    return lives[lives.length >> 1];
  }

  function finalLeverage(anchors, qty, lastEq) {
    if (!lastEq || !(lastEq.wallet > 0)) return null;
    if (qty === 0 && lastEq.walletXbt === 0) return 0;
    const mark = anchors.position ? anchors.position.markPrice : null;
    return mark ? (lastEq.walletXbt * mark + qty) / (lastEq.wallet * mark) : null;
  }

  function buildSummary(config, manifest, fillEvents, equity, orders) {
    const anchors = manifest.anchors;
    const baseline = manifest.equityBaseline;
    const last = fillEvents.length ? fillEvents[fillEvents.length - 1] : null;
    const lastEq = equity.length ? equity[equity.length - 1] : null;
    const snapQty = anchors.position ? anchors.position.currentQty
      : (anchors.positionFlat ? 0 : null);
    const replayQty = last ? last.pos : 0;

    return {
      symbol: config.symbol,
      account: config.account,
      trader: config.trader,
      source_url: config.sourceUrl,
      dataset_window: manifest.datasetWindow,
      exchange_status: config.exchangeStatus,
      position: {
        qty: replayQty,
        qty_btc: anchors.position ? anchors.position.homeNotional : (anchors.positionFlat ? 0 : null),
        avg_entry: last && last.cost ? last.pos / last.cost : null,
        mark: anchors.position ? anchors.position.markPrice : null,
      },
      account_value_btc: lastEq ? lastEq.wallet : null,
      leverage: finalLeverage(anchors, replayQty, lastEq),
      adjusted_wealth_btc: lastEq ? lastEq.adjWealth : null,
      multiple: lastEq ? lastEq.adjWealth / baseline.baselineBalanceXBT : null,
      baseline_btc: baseline.baselineBalanceXBT,
      deposits_btc: baseline.depositsTotalXBT,
      withdrawals_btc: baseline.withdrawalsTotalXBT,
      counts: {
        fills: fillEvents.length,
        orders: orders.length,
        orders_with_placement: orders.filter((o) => o.placement_known).length,
        orders_life_lower_bound: orders.filter((o) => o.life_lower_bound).length,
        median_order_life_ms: medianOrderLife(orders),
        orders_assumable: orders.filter((o) => o.assumable).length,
        orders_with_snapshot_evidence: orders.filter((o) => o.evidence_since).length,
      },
      placement_cutoff: placementCutoff(orders),
      fees_btc: last ? last.commCumXBt / SATOSHI : 0,
      realised_pnl_btc: last ? last.rpnlCumXBt / SATOSHI : 0,
      reconstruction: {
        replayed_qty: replayQty,
        snapshot_qty: snapQty,
        matches_snapshot: snapQty !== null && Math.abs(replayQty - snapQty) < 1e-9,
      },
    };
  }

  function btcSummary(summary, fillEvents, funding, equity, baseline, anchors) {
    const last = fillEvents.length ? fillEvents[fillEvents.length - 1] : null;
    const lastEq = equity.length ? equity[equity.length - 1] : null;
    const qty = last ? last.pos : 0;
    const mark = anchors.position ? anchors.position.markPrice : null;
    const upnl = last && mark ? unrealisedBtc(qty, last.cost, mark) : 0;
    const closing = last ? last.closedCum : 0;
    const fees = last ? last.commCumXBt / SATOSHI : 0;
    const fundingBtc = funding.reduce((sum, r) => sum + r.paidXBt, 0) / SATOSHI;
    const pnl = closing - fees - fundingBtc + upnl;
    const hold = lastEq ? lastEq.walletXbt + upnl : null;
    let leverage = null;
    if (qty === 0) leverage = hold > 0 ? 1 : 0;
    else if (hold > 0 && mark) leverage = (hold * mark + qty) / (hold * mark);
    return {
      ...summary,
      account_value_btc: hold,
      leverage,
      xbtusd_pnl: { closing_btc: closing, fees_btc: fees, funding_btc: fundingBtc, unrealised_btc: upnl, total_btc: pnl },
    };
  }

  function buildCoreModel(config, raw) {
    const fillEvents = replayFills(raw.fills);
    const equity = normalizeEquity(raw.equity);
    const orders = buildOrders(raw.orders, fillEvents, raw.evidence, raw.bounds, undefined, raw.orderEvents);
    const orderVersions = splitAmendedOrders(orders, fillEvents, raw.orders);
    const funding = normalizeFunding(raw.funding);
    const summary = btcSummary(buildSummary(config, raw.manifest, fillEvents, equity, orders),
      fillEvents, funding, equity, raw.manifest.equityBaseline, raw.manifest.anchors);
    if (!summary.reconstruction.matches_snapshot) {
      throw new Error(
        `重放仓位 ${summary.reconstruction.replayed_qty} 与终态快照 ` +
        `${summary.reconstruction.snapshot_qty} 不一致，拒绝渲染`,
      );
    }
    return {
      fillEvents,
      equity,
      funding,
      orders,
      orderVersions,
      orderEvidence: buildOrderEvidence(orders, raw.evidence, raw.orderEvents),
      fills: buildFills(fillEvents, XBTUSD_SPEC, orders),
      summary,
      baseline: raw.manifest.equityBaseline,
    };
  }

  global.PaulWeiDataTransform = Object.freeze({
    XBTUSD_SPEC,
    intervalMilliseconds,
    normalizeCandles,
    replayFills,
    unrealisedBtc,
    contractValueBtc,
    avgEntryFor,
    normalizeEquity,
    normalizeFunding,
    bisectLeq,
    buildOrders,
    placementCutoff,
    assumedStart,
    buildOrderEvidence,
    splitAmendedOrders,
    buildFills,
    buildTimeline,
    createUsdLedger,
    buildSummary,
    buildCoreModel,
  });
})(globalThis);
