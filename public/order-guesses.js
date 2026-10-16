(function installOrderGuesses(global) {
  "use strict";
  const CONFIDENCE = Object.freeze(["low", "medium", "high", "observed"]);
  const isReplaced = (record, index) => Boolean(record.segments[index]?.replaced) || index < record.segments.length - 1;
  const versionOid = (oid, record, index) => isReplaced(record, index) ? `${oid}~${index}` : oid;
  function createLayer({ manualBegin, manualKey } = {}) {
    let document = null, records = new Map(), enabled = false, snapshotRows = [];
    const beginOf = typeof manualBegin === "function" ? manualBegin : () => Infinity;
    const keyOf = typeof manualKey === "function" ? manualKey : null;
    function plan(order, record) {
      const end = order.status_timestamp;
      const begin = beginOf(order);
      const lead = Number.isFinite(begin) && begin < (record.segments[0]?.start ?? end) ? begin : null;
      if (record.segments.length) return { stages: record.segments, lead };
      const px = order.is_trigger ? order.trigger_px : order.limit_px;
      if (lead === null || !(px > 0)) return { stages: [], lead: null };
      return { stages: [{ start: end, end, px, qty: order.contracts }], lead };
    }
    function versions(order, record) {
      const { stages, lead } = plan(order, record);
      if (!stages.length) return [{ ...order, timestamp: order.status_timestamp, assumable: false,
        _guess: record, _guessStage: null, _guessReplaced: false, _guessStart: record.guessStart, _guessAssumed: false }];
      return stages.map((stage, index) => {
        const assumed = index === 0 && lead !== null;
        const start = assumed ? lead : stage.start;
        const replaced = isReplaced(record, index);
        const view = { ...order, assumable: false, _guess: record, _guessStage: stage, _guessReplaced: replaced,
          _guessStart: start, _guessAssumed: assumed, assumed_begin: start };
        if (order.is_trigger) view.trigger_px = stage.px;
        else view.limit_px = stage.px;
        if (replaced) {
          Object.assign(view, { oid: versionOid(order.oid, record, index), status: "canceled", final_status: "canceled",
            status_timestamp: stage.end, contracts: stage.qty, orig_sz: stage.qty / stage.px, sz: stage.qty / stage.px,
            filled_contracts: 0, fill_count: 0, timestamp: stage.end });
        } else {
          view.timestamp = Math.min(Math.max(order.timestamp, start), stage.end);
        }
        return view;
      });
    }
    function observedVersion(row, record) {
      const px = row.is_trigger ? row.trigger_px : row.limit_px;
      const index = record.segments.findIndex(stage => stage.px === px);
      if (index < 0) return { ...row, assumable: false };
      return { ...row, assumable: false, oid: versionOid(record.row - 1, record, index),
        ...(isReplaced(record, index) ? { final_status: "canceled" } : {}) };
    }
    let reshaped = { orders: null, document: null, key: null, byVariant: new Map() };
    function reshape(orders, { observed }) {
      const key = keyOf ? keyOf() : Symbol("rebuild");
      if (reshaped.orders !== orders || reshaped.document !== document || reshaped.key !== key) {
        reshaped = { orders, document, key, byVariant: new Map() };
      }
      let out = reshaped.byVariant.get(observed);
      if (out) return out;
      out = [];
      for (const o of orders) {
        const record = records.get(o.order_id);
        if (!record || o.event_evidence || o.version_of != null) out.push(o);
        else if (o.evidence) { if (observed) out.push(observedVersion(o, record)); }
        else out.push(...versions(o, record));
      }
      out = out.concat(snapshotRows);
      reshaped.byVariant.set(observed, out);
      return out;
    }
    return Object.freeze({
      get enabled() { return enabled; },
      get document() { return document; },
      install(input, orders) {
        enabled = false;
        document = null;
        records = new Map();
        snapshotRows = [];
        const native = new Map(orders.filter(o => !o.evidence && o.version_of == null).map(o => [o.order_id, o]));
        if (input?.schema !== "paulwei.llm-order-guesses.v1" || !Array.isArray(input.orders)
            || input.coveredCount !== input.orders.length || !Number.isSafeInteger(input.targetCount)
            || input.targetCount < input.coveredCount
            || (input.completeGlobal && (input.coveredCount !== input.targetCount || !input.overlapsReconciled))) {
          throw new Error("Invalid guess document");
        }
        const next = new Map();
        for (const record of input.orders) {
          const order = native.get(record.orderId);
          if (!order || !Number.isSafeInteger(record.row) || order.oid !== record.row - 1 || next.has(record.orderId)) {
            throw new Error("Guess identity mismatch");
          }
          const source = record.source;
          const px = order.is_trigger ? order.trigger_px : order.limit_px;
          if (!source || source.end !== order.status_timestamp || source.side !== order.side
              || source.status !== order.status || source.type !== order.order_type
              || source.qty !== (order.archive_contracts ?? order.contracts) || source.px !== (px || 0)
              || record.method !== "direct-llm-judgment"
              || !CONFIDENCE.includes(record.confidence)
              || (record.reason != null && (!record.reason.zh || !record.reason.en))
              || !Number.isSafeInteger(record.guessStart) || record.guessStart < 0
              || !Number.isSafeInteger(record.earliestEvidence)
              || record.guessStart > record.earliestEvidence + (record.features?.sourceClockToleranceMs || 0)
              || record.guessStart > source.end || !Array.isArray(record.segments)) {
            throw new Error(`Guess source or start mismatch: ${record.row}`);
          }
          if ((source.type === "Market" || source.status === "rejected") && record.segments.length) {
            throw new Error(`Guess has a non-resting segment: ${record.row}`);
          }
          let end = record.guessStart;
          for (const [index, segment] of record.segments.entries()) {
            if (segment.start !== end || !Number.isSafeInteger(segment.end) || segment.end < segment.start
                || segment.end > source.end || !Number.isFinite(segment.px) || segment.px <= 0
                || !Number.isFinite(segment.qty) || segment.qty <= 0
                || (segment.replaced != null && typeof segment.replaced !== "boolean")
                || (segment.replaced && index === record.segments.length - 1)) {
              throw new Error(`Guess stage mismatch: ${record.row}`);
            }
            end = segment.end;
          }
          const last = record.segments.at(-1);
          if (last && (end !== source.end || last.px !== source.px || last.qty !== source.qty)) {
            throw new Error(`Guess terminal mismatch: ${record.row}`);
          }
          next.set(record.orderId, record);
        }
        const snapshots = [];
        for (const [index, observation] of (input.snapshotObservations ?? []).entries()) {
          const parent = native.get(observation.orderId);
          if (!parent || !next.has(observation.orderId) || parent.oid !== observation.row - 1
              || !Number.isSafeInteger(observation.updated) || !Number.isSafeInteger(observation.activityWatermark)
              || observation.updated > observation.activityWatermark || observation.updated > parent.status_timestamp
              || !Number.isFinite(observation.px) || observation.px <= 0
              || !Number.isFinite(observation.qty) || observation.qty <= 0
              || !/^[0-9a-f]{64}$/.test(observation.sourceSha256)) {
            throw new Error('Guess snapshot mismatch');
          }
          snapshots.push({ ...parent, oid: `snapshot:${observation.row}:${index}`, evidence: true,
            event_evidence: true, event_type: 'SnapshotUpdate', snapshot_observation: true, _snapshot: observation,
            status: 'evidence', final_status: parent.status, timestamp: observation.updated,
            status_timestamp: observation.updated, limit_px: parent.is_trigger ? parent.limit_px : observation.px,
            trigger_px: parent.is_trigger ? observation.px : parent.trigger_px,
            contracts: observation.qty, remaining_contracts: observation.leaves, filled_contracts: 0,
            orig_sz: observation.qty / observation.px, sz: observation.leaves / observation.px,
            assumable: false, evidence_since: null, evidence_until: null });
        }
        document = input;
        records = next;
        snapshotRows = snapshots;
        enabled = false;
      },
      setEnabled(value) { enabled = Boolean(value && document); },
      recordFor(order) {
        return enabled && !order.evidence && order.version_of == null ? records.get(order.order_id) ?? null : null;
      },
      createModel(fallback) {
        return Object.freeze({
          forBar(orders, bar, recovery) {
            return fallback.forBar(enabled && bar ? reshape(orders, { observed: false }) : orders, bar, recovery);
          },
          projectOrders(orders, bars, options = {}) {
            return fallback.projectOrders(enabled ? reshape(orders, { observed: true }) : orders, bars, options);
          },
        });
      },
    });
  }
  global.OrderGuesses = Object.freeze({ createLayer, confidence: CONFIDENCE });
})(globalThis);
