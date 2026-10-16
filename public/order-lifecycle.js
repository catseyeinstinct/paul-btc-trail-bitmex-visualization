(function installOrderLifecycle(global) {
  function activeAt(orders, time, recovery = null) {
    if (recovery && time >= recovery.as_of) return recovery.current_orders;
    if (recovery && !recovery.complete && time > recovery.from) return [];
    return orders.filter(order => order.timestamp <= time
      && (order.known_until == null || time <= order.known_until)
      && (order.status === "open" || order.status_timestamp > time));
  }

  function forBar(orders, bar, recovery = null) {
    if (!bar) return [];
    const end = bar.T ?? bar.t;
    const result = activeAt(orders, end, recovery).slice();
    const seen = new Set(result.map(order => order.oid));
    for (const order of orders) {
      if (order.status === "filled" && !seen.has(order.oid)
          && order.status_timestamp >= bar.t && order.status_timestamp <= end) {
        result.push(order);
        seen.add(order.oid);
      }
    }
    return result;
  }

  function atOrBefore(bars, time) {
    let lo = 0, hi = bars.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (bars[mid].t <= time) lo = mid + 1;
      else hi = mid;
    }
    return lo - 1;
  }

  function projectOrders(orders, bars, { recovery = null, atMs = null } = {}) {
    const groups = [[], [], [], []];
    if (!bars?.length) return groups;
    const windowStart = bars[0].t;
    const windowEnd = bars.at(-1).T ?? bars.at(-1).t;
    const checkpoint = recovery
      ? (recovery.complete ? recovery.as_of : recovery.from) : Infinity;
    const continuing = new Set();
    if (recovery?.complete) {
      const current = new Map(recovery.current_orders.map(order => [order.oid, order]));
      for (const order of orders) {
        const snapshot = current.get(order.oid);
        if (snapshot && order.status === "open" && snapshot.status === "open"
            && order.known_until == null && snapshot.known_until == null
            && order.timestamp === snapshot.timestamp && order.side === snapshot.side
            && Boolean(order.is_trigger) === Boolean(snapshot.is_trigger)
            && Number(order.is_trigger ? order.trigger_px : order.limit_px)
              === Number(snapshot.is_trigger ? snapshot.trigger_px : snapshot.limit_px)) {
          continuing.add(order.oid);
        }
      }
    }
    const slices = atMs === null
      ? [
          ...orders.map(order => ({ order, from: -Infinity,
            until: continuing.has(order.oid) ? Infinity : checkpoint })),
          ...(recovery?.current_orders ?? []).filter(order => !continuing.has(order.oid))
            .map(order => ({ order, from: recovery.as_of, until: Infinity })),
        ]
      : activeAt(orders, atMs, recovery).map(order => ({ order,
          from: recovery && atMs >= recovery.as_of && !continuing.has(order.oid)
            ? recovery.as_of : -Infinity,
          until: continuing.has(order.oid) || (recovery && atMs >= recovery.as_of)
            ? Infinity : checkpoint,
        }));
    for (const { order, from, until } of slices) {
      const px = Number(order.is_trigger ? order.trigger_px : order.limit_px);
      if (!Number.isFinite(px) || px <= 0 || !Number.isFinite(order.timestamp)) continue;
      let end = order.status === "open" ? Infinity : order.status_timestamp;
      if (order.known_until != null) end = Math.min(end, order.known_until);
      end = Math.min(end, until);
      const start = Math.max(order.timestamp, from);
      if (Number.isNaN(end) || start > end || end < windowStart || start > windowEnd) continue;
      let first = Math.max(0, atOrBefore(bars, Math.max(start, windowStart)));
      if (start > (bars[first].T ?? bars[first].t)) first++;
      const last = atOrBefore(bars, Math.min(end, windowEnd));
      if (first >= bars.length || last < first) continue;
      const group = (order.side === "B" ? 0 : 2) + (order.status === "filled" ? 0 : 1);
      groups[group].push({ oid: order.oid, createdMs: order.timestamp,
        fromMs: start, untilMs: end, active: atMs !== null,
        t1: Math.floor(bars[first].t / 1000), t2: Math.floor(bars[last].t / 1000),
        open: end === Infinity, px });
    }
    return groups;
  }

  global.OrderLifecycle = Object.freeze({ activeAt, forBar, projectOrders });
})(globalThis);
