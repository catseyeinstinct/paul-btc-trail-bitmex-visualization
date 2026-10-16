(function installBitmexGuesses(global) {
  "use strict";
  const layer = global.OrderGuesses.createLayer({
    manualBegin: order => global.BitmexOrders?.assumption?.on ? global.BitmexOrders.assumedBegin(order) : Infinity,
    manualKey: () => { const a = global.BitmexOrders?.assumption; return a ? `${a.filledDays}|${a.unfilledDays}` : ""; },
  });
  const FILE = "data/llm-guesses/v3-final.json";
  const TEXT = {
    "guess.label": { zh: "AI 修复下单时间", en: "AI-restored placement times" },
    "guess.on": { zh: "显示推断", en: "Show inferred" },
    "guess.help": {
      zh: "2023 年 10 月起归档不再记录下单时刻，那之后的挂单只剩成交或撤单的那一刻。勾选后，这些单的起点改用预先算好的 AI 推断。",
      en: "From October 2023 the archive no longer records placement times, so later orders keep only the moment they filled or were canceled. When ticked, these orders start at precomputed AI-inferred times.",
    },
    "guess.error": { zh: "未启用：{0}（可重试）", en: "Not enabled: {0} (retry available)" },
    "badge.inferred": { zh: "AI推断", en: "AI inferred" },
    "t.inferred": { zh: "AI 推断：归档没有这张单的下单时刻和改价过程，这一段是推断的，不是交易所记录。", en: "AI inferred: the archive has no placement time or amendment history for this order; this part is inferred, not an exchange record." },
    "guess.row_assumed": { zh: "起点来自「假设挂单时长」：{0}。AI 推断的起点是 {1}，更晚，按取长显示假设起点；更早的这一段画成假设线，不是 AI 推断。", en: "Start from Assumed Resting Time: {0}. The AI-inferred start, {1}, is later, so the longer assumption is shown; the earlier part is drawn as an assumption, not as the AI's." },
  };
  const text = (key, ...args) => typeof t === "function" ? t(key, ...args) : TEXT[key]?.zh ?? key;
  const language = () => typeof state !== "undefined" ? state.lang : "zh";
  const $ = id => global.document?.getElementById(id);
  const when = ms => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";
  let loading = null, generation = 0, errorMessage = null;
  const verifiedSources = new Set();

  const redraw = () => {
    if (typeof state === "undefined" || !state.timeline) return;
    state._allOrderSegments = null;
    renderForSelected();
  };
  function status(message = errorMessage) {
    errorMessage = message;
    const el = $("guess-status");
    const box = $("chk-order-guesses");
    if (box) box.title = text("guess.help");
    if (!el) return;
    el.hidden = !message;
    el.textContent = message ?? "";
  }
  async function load() {
    if (layer.document) return layer.document;
    if (loading) return loading;
    loading = (async () => {
      if (typeof state === "undefined" || !state.orders?.length || !state.timeline) {
        throw new Error(language() === "en" ? "Wait for chart initialization" : "请等待图表初始化完成");
      }
      const response = await fetch(FILE, { cache: "no-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const doc = await response.json();
      for (const [name, expected] of Object.entries(doc.displaySourceHashes ?? {})) {
        if (!["orders.json", "fills.json", "order_events.json", "order_evidence.json"].includes(name)) throw new Error("Invalid source path");
        if (verifiedSources.has(`${name}:${expected}`)) continue;
        const known = global.TradeVizData?.sourceHash?.(name) ?? null;
        const hash = known ?? await (async () => {
          const r = await fetch("data/source/" + name, { cache: "no-cache" });
          if (!r.ok) throw new Error(`Source HTTP ${r.status}`);
          const bytes = await r.arrayBuffer();
          return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(n => n.toString(16).padStart(2, "0")).join("");
        })();
        if (hash !== expected) throw new Error(`Source changed: ${name}`);
        verifiedSources.add(`${name}:${expected}`);
      }
      layer.install(doc, state.orders);
      return doc;
    })().finally(() => { loading = null; });
    return loading;
  }
  async function enable() {
    const token = ++generation;
    try {
      await load();
      if (token !== generation) return;
      layer.setEnabled(true);
      status(null);
      redraw();
    } catch (error) {
      if (token !== generation) return;
      layer.setEnabled(false);
      const box = $("chk-order-guesses");
      if (box) box.checked = false;
      status(text("guess.error", error.message));
      redraw();
    }
  }
  function disable() {
    ++generation;
    layer.setEnabled(false);
    status(null);
    redraw();
  }

  const badge = (title, words, kind = "canceled") => `<span class="badge ${kind}" title="${title}">${words}</span>`;
  function decorate(tr, order, bar, base) {
    base(tr, order, bar);
    if (!order._guess) return;
    const record = order._guess;
    const start = order._guessStart ?? record.guessStart;
    const firstStart = record.segments[0]?.start ?? record.guessStart;
    const mark = order._guessAssumed
      ? badge(text("guess.row_assumed", when(start), when(firstStart)), t("badge.assumed"))
      : badge(text("t.inferred"), text("badge.inferred"), "guess");
    tr.cells[5].innerHTML = `${fmtTsShort(start)} ${mark}`;
  }
  function wrap(base) {
    return Object.freeze({ model: layer.createModel(base.model),
      drawOverlay: base.drawOverlay,
      highlightOverlay: base.highlightOverlay,
      decorateRow(tr, order, bar) { decorate(tr, order, bar, base.decorateRow); },
    });
  }
  function bind() {
    const toggle = $("chk-order-guesses");
    if (!toggle) return;
    toggle.addEventListener("change", () => { if (toggle.checked) void enable(); else disable(); });
    if (typeof MutationObserver === "function") new MutationObserver(() => status()).observe(global.document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    status();
  }
  global.BitmexGuesses = Object.freeze({ layer, i18n: TEXT, wrap, enable, disable,
    prefControls: Object.freeze([Object.freeze({ key: "orderGuesses", id: "chk-order-guesses", kind: "checkbox", event: "change" })]) });
  if (global.document) bind();
})(globalThis);
