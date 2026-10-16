function installCompactToolbar(global) {
  "use strict";

  const bar = document.querySelector("section.controls");
  if (!bar || typeof I18N === "undefined" || typeof applyStaticI18n !== "function") return;

  const TEXT = {
    "tb.fills": { zh: "成交显示", en: "Fill display" },
    "tb.scope": { zh: "显示范围", en: "Display range" },
    "tb.labels": { zh: "标签", en: "Labels" },
    "tb.style": { zh: "成交画法", en: "Fill markers" },
    "t.tb_style": { zh: "成交显示：范围、主动判定阈值和画法", en: "Fill display: scope, active threshold and markers" },
    "tb.radius": { zh: "半径", en: "Radius" },
    "tb.radius_unit": { zh: "px", en: "px" },
    "tb.overlap": { zh: "重叠", en: "Overlap" },
    "tb.no_merge": { zh: "不合并", en: "Keep apart" },
    "tb.merge": { zh: "合并", en: "Merge" },
    "tb.colors": { zh: "颜色", en: "Color" },
    "tb.taker_buy": { zh: "主动买", en: "Taker buy" },
    "tb.maker_buy": { zh: "被动买", en: "Maker buy" },
    "tb.taker_sell": { zh: "主动卖", en: "Taker sell" },
    "tb.maker_sell": { zh: "被动卖", en: "Maker sell" },
    "tb.order_settings": { zh: "挂单显示", en: "Order display" },
    "t.tb_order_settings": { zh: "挂单显示：全部历史挂单、画法、成交和未成交挂单不透明度、颜色", en: "Order display: all historical orders, style, filled and unfilled order opacity, colors" },
    "tb.line_mode": { zh: "画法", en: "Style" },
    "tb.unfilled": { zh: "未成交挂单不透明度", en: "Unfilled order opacity" },
    "tb.ind": { zh: "指标", en: "Indicators" },
    "tb.ind_title": { zh: "指标", en: "Indicators" },
    "t.tb_replay": { zh: "回放：单步、播放、速度、显示未来（空格 播放 / 暂停，← → 单步）",
      en: "Replay: step, play, speed, show future (Space play / pause, ← → step)" },
    "tb.snapshot": { zh: "历史快照", en: "Snapshot" },
    "t.tb_pin_on": { zh: "点任一张图钉住那根 K 线，或点这里钉住当前这根；钉住后侧栏和挂单不再跟着鼠标走",
      en: "Click any chart to pin that candle, or click here to pin the current one; the side panel and orders then stop following the cursor" },
    "t.tb_pin_off": { zh: "点这里（或双击任一张图）解除钉住，回到跟随鼠标", en: "Click here (or double-click any chart) to unpin and follow the cursor again" },
    "tb.cs_body": { zh: "实体", en: "Body" },
    "tb.cs_wick": { zh: "影线", en: "Wick" },
    "tb.cs_up": { zh: "涨", en: "Up" },
    "tb.cs_down": { zh: "跌", en: "Down" },
    "tb.cs_color": { zh: "颜色", en: "Color" },
    "tb.cs_width": { zh: "粗细", en: "Width" },
    "tb.cs_width_unit": { zh: "px", en: "px" },
    "t.tb_label_side": { zh: "买卖标记（B / S）：点一下显示或隐藏", en: "Side (B / S): click to show or hide" },
    "t.tb_label_pct": { zh: "仓位百分比（占成交当时账户价值）：点一下显示或隐藏", en: "Share of the account at the time: click to show or hide" },
    "t.tb_label_price": { zh: "成交价（成交均价）：点一下显示或隐藏", en: "Fill price (average): click to show or hide" },
  };
  for (const [key, value] of Object.entries(TEXT)) if (!(key in I18N)) I18N[key] = value;
  const touchFirst = global.matchMedia?.("(pointer: coarse)").matches ?? false;
  I18N["pin.pinned"] = I18N["pin.pinned_click"] = { zh: "📌 {0} ✕", en: "📌 {0} ✕" };
  I18N["pin.playing"] = { zh: "▶ {0}", en: "▶ {0}" };
  I18N["pin.off"] = { zh: "📌 点 K 线钉住", en: "📌 Click a candle to pin" };

  const PREFS_KEY = "tb_prefs";
  const prefs = (() => {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
  })();
  const savePrefs = () => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { }
  };

  const ICONS = {
    fills: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
      + '<path d="m16 3 4 4-4 4M20 7H4m4 14-4-4 4-4M4 17h16"/></svg>',
    arrow: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">'
      + '<path class="tb-ico-buy" d="M4.5 1.5 8 6.2H5.8V13H3.2V6.2H1z"/>'
      + '<path class="tb-ico-sell" d="M11.5 14.5 15 9.8h-2.2V3h-2.6v6.8H8z"/></svg>',
    bubble: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">'
      + '<circle class="tb-ico-bubble-buy tb-ico-ring" cx="6" cy="9.6" r="4.6"/>'
      + '<circle class="tb-ico-bubble-sell tb-ico-ring" cx="12.2" cy="4.6" r="2.7"/></svg>',
    sliders: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">'
      + '<path class="tb-ico-line" d="M2 4h12M2 8h12M2 12h12"/>'
      + '<circle class="tb-ico-knob" cx="5" cy="4" r="1.8"/><circle class="tb-ico-knob" cx="10.8" cy="8" r="1.8"/>'
      + '<circle class="tb-ico-knob" cx="6.4" cy="12" r="1.8"/></svg>',
    replay: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">'
      + '<path class="tb-ico-line" d="M7.5 4v8L2 8l5.5-4ZM14 4v8L8.5 8 14 4Z"/></svg>',
    indicator: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + '<path d="M12 16v5M16 14.639V21M20 10.656V21M4 18.463V21M8 14.656V21"/>'
      + '<path d="m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15"/></svg>',
  };

  const CSS = `
/* 菜单与菜单之间的横向间距 5 px（2026-10-05 从 10 px 收紧一半），全屏层相同 */
.tb-compact .controls { --controls-padding-y: 3.5px; gap: 8px 5px; }
.tb-compact .chart-wrap.maximized > .maximized-controls { column-gap: 5px; }
.tb-compact .tb-g-interval > .label, .tb-compact .tb-g-chart-type > .label, .tb-compact .tb-g-replay > .label, .tb-compact .tb-g-pin > .label,
.tb-compact .tb-g-orders > .label, .tb-compact .tb-g-ind > .label, .tb-compact .tb-hide, .tb-compact .tb-empty { display: none; }
.tb-compact .tb-g-side { margin-left: auto; }
.tb-compact #tb-interval-btn { display: none; }
.tb-compact .tb-measuring { flex-wrap: nowrap; }
.tb-compact .tb-measuring > .control-group { flex-shrink: 0; }
.tb-compact[data-tb-density="indicator"] #tb-ind-btn .tb-trigger-text,
.tb-compact[data-tb-density="compact"] .tb-trigger > .tb-trigger-text { display: none; }
.tb-compact[data-tb-density="compact"] #tb-interval-btn { display: inline-flex; }
/* 一级菜单顺序（2026-10-05）：粒度、K 线类型、指标、成交显示、挂单显示、回放、钉住 / 最新，历史快照靠右。
   全屏层里也一样（app.js 和下面把这些组搬进去，order 跟着组走）。 */
.tb-compact .tb-g-interval { order: 0; }
.tb-compact .tb-g-chart-type { order: 1; }
.tb-compact .tb-g-ind { order: 2; }
.tb-compact .tb-g-fills, .tb-compact #tb-style-btn { order: 3; }
.tb-compact .tb-g-orders { order: 4; }
.tb-compact .tb-g-replay { order: 5; }
.tb-compact .tb-g-pin { order: 6; }
.tb-compact .tb-g-side { order: 7; }
.tb-compact[data-tb-density="compact"] .tb-g-fills { display: contents; }
/* 收起文字后六个菜单按钮在 320 px 宽也要排成一行：间距和按钮内边距收紧一点 */
.tb-compact[data-tb-density="compact"] .controls { column-gap: 3px; }
.tb-compact[data-tb-density="compact"] .tb-trigger { gap: 4px; padding-inline: 6px; }
.tb-compact[data-tb-density="compact"] .tb-g-fills > .label { display: none; }
#tb-interval-pop #seg-interval { display: flex; flex-direction: column; border: 0; min-width: 72px; }
#tb-interval-pop #seg-interval > button { text-align: left; min-height: 28px; }
/* K 线类型：触发按钮只显示当前类型的图标；菜单里两种类型各一行，选中的那种下面缩进列出它的样式
   （和成交画法的箭头 / 气泡一样，样式放在 #seg-chart-type 外面，用 order 排到对应的类型下面） */
#tb-chart-type-btn { padding-inline: 6px; }
#tb-chart-type-pop { min-width: 0; }
.tb-compact .tb-chart-type-list > #seg-chart-type { display: contents; }
.tb-compact #seg-chart-type > button[data-val="candles"] { order: 1; }
.tb-compact .tb-chart-type-list > #tb-candle-options { order: 2; }
.tb-compact #seg-chart-type > button[data-val="line"] { order: 3; }
.tb-compact .tb-chart-type-list > #tb-line-options { order: 4; }
.tb-compact #seg-chart-type.tb-radio-list > button {
  display: flex; align-items: center; gap: 12px; text-align: left; padding: 6px 8px; border-radius: 6px; color: var(--text); font-size: 13px;
}
.tb-compact #seg-chart-type.tb-radio-list > button:hover { background: var(--hover); }
.tb-compact #seg-chart-type.tb-radio-list > button.active { background: var(--accent-tint); color: var(--text); }
.tb-compact #seg-chart-type.tb-radio-list > button.active .tb-check { visibility: visible; }
#tb-chart-type-pop .chart-type-name { display: inline; }
#tb-chart-type-pop .chart-type-icon { width: 20px; height: 20px; }
#tb-chart-type-pop .tb-sub > .chk { white-space: nowrap; }
.tb-color.tb-color-solo { grid-template-columns: 16px; }
/* 「实体」没有开关：文字与「影线」对齐（让开复选框的宽度），颜色也一样 */
#tb-candle-options > .tb-cs-body { padding-left: 25px; color: var(--text); font-size: 12px; }
.tb-line-width { display: inline-flex; align-items: center; gap: 4px; }
.tb-line-width .form-select-trigger { width: 48px; padding: 2px 15px 2px 5px; }
.tb-line-width .form-select-trigger::after { right: 5px; width: 4px; height: 4px; }
/* 钉住按钮不占工具栏，读数行的图钉标签常驻并可点：没钉住时是淡色的提示，钉住后是正常颜色的时间和 ✕ */
.tb-compact #btn-pin { display: none; }
.tb-compact .price-chart-head > #pin-state {
  display: inline; flex: 0 0 auto; padding: 1px 6px; border-radius: 4px; background: var(--overlay);
  color: var(--muted); font-size: 10px; font-variant-numeric: tabular-nums; cursor: pointer; pointer-events: auto;
}
.tb-compact .price-chart-head > #pin-state:hover, .tb-compact .price-chart-head > #pin-state:focus-visible {
  color: var(--text); background: rgba(43, 51, 62, 0.92); outline: none;
}
.tb-compact:has(#btn-pin.active) .price-chart-head > #pin-state { color: var(--text); }
.tb-compact .price-chart-head > #pin-state[hidden] { display: none; }
/* 全屏时控件多了一些，行高按实际量出来的控件行高度往下让 */
.tb-compact .chart-wrap.maximized .price-chart-head { top: calc(var(--tb-max-bar, 30px) + 18px); }
.tb-compact .chart-wrap.maximized .chart-legend { top: calc(var(--tb-max-bar, 30px) + 38px); }
/* 「显示全部订单」在铺满横屏下也点得动：点「开」先切到生命周期 */
.tb-compact #seg-show-all.disabled { opacity: 1; pointer-events: auto; }

/* 菜单的触发按钮 */
.tb-compact .tb-trigger { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; white-space: nowrap; }
.tb-compact .tb-trigger.open { border-color: var(--blue); }
.tb-compact .tb-trigger.tb-active { border-color: var(--blue); color: var(--blue); }
.tb-compact .tb-caret { width: 5px; height: 5px; margin: 0 1px; border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor; transform: translateY(-2px) rotate(45deg); opacity: 0.8; }
.tb-compact .tb-ico, .tb-compact .tb-ico svg { display: block; width: 16px; height: 16px; flex: 0 0 auto; }
.tb-compact .tb-ico-buy { fill: var(--tb-arrow-buy, #ffa726); stroke: var(--tb-arrow-buy, #ffa726); }
.tb-compact .tb-ico-sell { fill: var(--tb-arrow-sell, #ec407a); stroke: var(--tb-arrow-sell, #ec407a); }
.tb-compact .tb-ico-bubble-buy { fill: var(--tb-bubble-buy, #26a69a); stroke: var(--tb-bubble-buy, #26a69a); }
.tb-compact .tb-ico-bubble-sell { fill: var(--tb-bubble-sell, #ef5350); stroke: var(--tb-bubble-sell, #ef5350); }
.tb-compact .tb-ico-ring { fill-opacity: 0.32; stroke-width: 1.2; }
.tb-compact .tb-ico-line { fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.tb-compact .tb-ico-knob { fill: var(--panel-2); stroke: currentColor; stroke-width: 1.4; }

/* 菜单 */
.tb-pop {
  position: fixed; z-index: 1050; box-sizing: border-box;
  max-height: calc(100dvh - 8px); overflow-y: auto;
  padding: 8px; background: var(--panel-2); color: var(--text); font-size: 12px;
  border: 1px solid var(--pop-border); border-radius: 9px; box-shadow: 0 8px 22px rgba(0, 0, 0, 0.45);
}
.tb-pop[hidden] { display: none; }
.tb-pop-title { color: var(--muted); font-size: 11px; margin: 0 4px 6px; }
.tb-pop-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; padding: 6px 4px; }
.tb-pop-row + .tb-pop-row { border-top: 1px solid var(--line); }
.tb-pop .label, .tb-row-label { color: var(--muted); font-size: 11px; }
.tb-row-label { min-width: 72px; }
.tb-section-label { display: block; color: var(--muted); font-size: 11px; font-weight: normal; line-height: 1.4; }
.tb-order-controls { display: grid; grid-template-columns: max-content minmax(0, 1fr); column-gap: 10px; }
.tb-order-row { display: grid; grid-column: 1 / -1; grid-template-columns: subgrid;
  align-items: center; padding: 7px 4px; }
.tb-order-row + .tb-order-row { border-top: 1px solid var(--line); }
.tb-order-row > .tb-row-label { min-width: 0; max-width: 126px; }
.tb-order-value { display: flex; align-items: center; gap: 8px; min-width: 0; }
.tb-order-value > .seg { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; }
.tb-order-value > .seg > button { min-width: 0; white-space: normal; text-align: center; }
.tb-order-value input[type="range"] { flex: 1; width: 0; min-width: 48px; margin: 0; }
.tb-order-value [id$="-alpha-val"] { flex: 0 0 36px; }
.tb-order-controls + .tb-pop-row { border-top: 1px solid var(--line); }
.tb-hint { color: var(--muted); font-size: 11px; }
.tb-pop .ind-sub { font-size: 11px; }
.tb-pop .control-group { flex-wrap: wrap; }
#tb-replay-pop .tb-pop-row { gap: 6px; }

/* 成交画法：箭头 / 气泡两行，选中的那种下面缩进列出它的选项 */
.tb-style-list { display: flex; flex-direction: column; gap: 2px; }
.tb-compact .tb-style-list > #seg-fill-style { display: contents; }
.tb-compact #seg-fill-style > button[data-val="arrow"] { order: 1; }
.tb-compact .tb-style-list > #tb-arrow-options { order: 2; }
.tb-compact #seg-fill-style > button[data-val="bubble"] { order: 3; }
.tb-compact .tb-style-list > #bubble-options { order: 4; }
.tb-compact #seg-fill-style.tb-radio-list > button {
  display: flex; align-items: center; gap: 10px; text-align: left; padding: 6px 8px; border-radius: 6px; color: var(--text);
}
.tb-compact #seg-fill-style.tb-radio-list > button:hover { background: var(--hover); }
.tb-compact #seg-fill-style.tb-radio-list > button.active { background: var(--accent-tint); color: var(--text); }
.tb-opt { display: flex; flex-direction: column; gap: 1px; }
.tb-opt-name { font-size: 13px; }
.tb-check { margin-left: auto; padding-left: 10px; color: var(--blue); visibility: hidden; }
.tb-compact #seg-fill-style.tb-radio-list > button.active .tb-check { visibility: visible; }
.tb-compact .tb-pop .tb-sub {
  display: grid; grid-template-columns: auto auto; justify-content: start; justify-items: start; align-items: center; gap: 6px 10px;
  margin: 2px 16px 6px 18px; padding: 6px 0 4px 10px; border-left: 2px solid var(--accent-line);
}
.tb-compact .tb-pop .tb-sub[hidden] { display: none; }
.tb-compact .tb-pop .tb-sub > .label { white-space: nowrap; }
.tb-compact #tb-style-pop { min-width: 0; }
/* 分隔线上下与指标菜单的行距相同（.tb-pop-row 上下各 6px）：阈值一行到线 6px，线到「成交画法」6px */
.tb-compact .tb-fill-settings { display: grid; gap: 10px; padding: 2px 4px 6px; border-bottom: 1px solid var(--line); }
.tb-compact #seg-fills-filter { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; }
.tb-compact #fill-intent-control { display: flex; gap: 6px; align-items: center; width: 100%; }
.tb-compact #fill-intent-control > .label { margin-right: auto; }
.tb-compact #fill-intent-threshold { width: 76px; min-width: 0; box-sizing: border-box; }
.tb-compact .tb-pop #bubble-options .control-pair { display: contents; }
/* 两行分段按钮等宽，上下对齐 */
.tb-compact .tb-pop .tb-sub .seg > button { min-width: 56px; text-align: center; }
.tb-compact .tb-pop #seg-bubble-group, .tb-compact .tb-pop #seg-bubble-size {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); justify-self: stretch;
}
/* 标签示例与关闭的指标共用横向删除线。 */
.tb-sample { display: inline-flex; align-items: center; gap: 4px; }
.tb-sample > button { position: relative; padding: 2px 4px; border: 0; border-radius: 3px; background: transparent;
  color: var(--text); font: inherit; cursor: pointer; }
.tb-sample > button:hover { background: rgba(255, 255, 255, 0.08); }
.tb-sample > button[aria-pressed="false"] { color: var(--muted); text-decoration: line-through; }
/* 颜色：和挂单设置里的「买 ■ 卖 ■」一样，小字在前、色块在后 */
.tb-colors { display: grid; grid-template-columns: auto auto; gap: 6px 12px; align-items: center; }
.tb-color { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 16px; align-items: center; gap: 6px; cursor: pointer; }
.tb-swatch { width: 16px; height: 16px; box-sizing: border-box; border: 1px solid var(--line); border-radius: 3px; background: var(--swatch); }
.tb-color .tb-swatch { padding: 0; cursor: pointer; }
.tb-color .tb-swatch:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }
.tb-radius { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.tb-radius .form-select-trigger { width: 48px; padding: 2px 15px 2px 5px; }
.tb-radius .form-select-trigger::after { right: 5px; width: 4px; height: 4px; }
#tb-radius-max-trigger-options [role="option"] { line-height: 16.8px; }
/* 半径上限的「∞」画成 SVG（app.js 的 FORM_SELECT_SYMBOLS），大小和上面的选项差不多：宽约等于「50」
   （1.1em），高 0.5em，笔画粗细与数字相当；中心仍在基线以上 0.375em，与数字齐平。原来是把这一格的字号
   放到 20px，字体里的 ∞ 放大后更靠下，下拉菜单里它和 50 之间也空得多。 */
#tb-radius-max-trigger svg.form-select-symbol, #tb-radius-max-trigger-options svg.form-select-symbol {
  width: 1.1em; height: 0.5em; vertical-align: 0.125em;
}
`;

  const $id = (id) => document.getElementById(id);
  const groupOf = (id) => $id(id)?.closest(".control-group");
  const el = (tag, className, attrs = {}) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };
  const text = (key, className = "") => {
    const span = el("span", className);
    span.dataset.i18n = key;
    span.textContent = t(key);
    return span;
  };
  const row = (...nodes) => {
    const div = el("div", "tb-pop-row");
    div.append(...nodes.filter(Boolean));
    return div;
  };
  const caret = () => el("span", "tb-caret", { "aria-hidden": "true" });
  const icon = (svg) => {
    const span = el("span", "tb-ico");
    span.innerHTML = svg;
    return span;
  };
  const trigger = (id, titleKey, labelKey = titleKey) => {
    const button = el("button", "tb-trigger", { type: "button", id });
    button.dataset.i18nTitle = titleKey;
    button.dataset.i18nAriaLabel = labelKey;
    return button;
  };

  let openEntry = null;
  const place = ({ trigger: anchor, pop }) => {
    const rect = anchor.getBoundingClientRect();
    const viewWidth = document.documentElement.clientWidth;
    pop.style.maxWidth = `${viewWidth - 8}px`;
    pop.style.left = "0px";
    const width = pop.offsetWidth, height = pop.offsetHeight;
    let top = rect.bottom + 6;
    if (top + height > innerHeight - 4 && rect.top - 6 - height >= 4) top = rect.top - 6 - height;
    pop.style.left = `${Math.max(4, Math.min(rect.left, viewWidth - width - 4))}px`;
    pop.style.top = `${Math.max(4, Math.min(top, innerHeight - height - 4))}px`;
  };
  const close = () => {
    if (!openEntry) return;
    global.TradeVizColors.close();
    openEntry.pop.hidden = true;
    openEntry.trigger.classList.remove("open");
    openEntry.trigger.setAttribute("aria-expanded", "false");
    openEntry = null;
  };
  const open = (entry) => {
    close();
    entry.pop.hidden = false;
    entry.trigger.classList.add("open");
    entry.trigger.setAttribute("aria-expanded", "true");
    openEntry = entry;
    place(entry);
  };
  const popover = (id, titleKey, anchor) => {
    const pop = el("div", "tb-pop", { id, role: "dialog" });
    pop.hidden = true;
    if (titleKey) {
      const title = text(titleKey, "tb-pop-title");
      title.id = `${id}-title`;
      pop.setAttribute("aria-labelledby", title.id);
      pop.append(title);
    } else pop.setAttribute("aria-labelledby", anchor.id);
    document.body.append(pop);
    const entry = { trigger: anchor, pop };
    anchor.setAttribute("aria-haspopup", "dialog");
    anchor.setAttribute("aria-expanded", "false");
    anchor.setAttribute("aria-controls", id);
    anchor.addEventListener("click", () => (openEntry === entry ? close() : open(entry)));
    return entry;
  };
  const replace = (entry) => { if (openEntry === entry) place(entry); };
  document.addEventListener("pointerdown", (event) => {
    if (openEntry && !event.target.closest?.(".tb-pop, .tb-trigger, .form-select-popup, .trade-color-panel")) close();
  }, true);
  global.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !openEntry) return;
    if (typeof formSelectPopup !== "undefined" && formSelectPopup) return;
    if (document.querySelector(".order-color-panel:not([hidden])")) return;
    event.stopImmediatePropagation();
    const { trigger: anchor } = openEntry;
    close();
    anchor.focus();
  }, true);
  global.addEventListener("resize", () => openEntry && place(openEntry));
  global.addEventListener("scroll", () => openEntry && place(openEntry), true);

  const style = el("style");
  style.id = "tb-compact-style";
  style.textContent = CSS;
  document.head.append(style);
  document.documentElement.classList.add("tb-compact");

  const intervals = groupOf("seg-interval"), intervalSeg = $id("seg-interval");
  intervals.classList.add("tb-g-interval");
  const intervalTrigger = trigger("tb-interval-btn", "ctl.interval");
  const intervalName = el("span");
  intervalTrigger.append(intervalName, caret());
  intervals.append(intervalTrigger);
  const intervalMenu = popover("tb-interval-pop", "ctl.interval", intervalTrigger);
  const syncInterval = () => {
    const selected = intervalSeg.querySelector("button.active");
    const label = selected?.textContent ?? "";
    if (intervalName.textContent !== label) intervalName.textContent = label;
    intervalTrigger.disabled = intervalSeg.getAttribute("aria-busy") === "true";
    intervalTrigger.setAttribute("aria-label", `${t("ctl.interval")}: ${label}`);
  };
  new MutationObserver(syncInterval).observe(intervalSeg, { attributes: true, subtree: true,
    attributeFilter: ["class", "aria-busy", "disabled"] });
  intervalSeg.addEventListener("click", event => {
    if (event.target.closest("button") && openEntry === intervalMenu) {
      close();
      intervalTrigger.focus({ preventScroll: true });
    }
  });
  intervalTrigger.addEventListener("keydown", event => {
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    open(intervalMenu);
    (intervalSeg.querySelector("button.active:not(:disabled)") ?? intervalSeg.querySelector("button:not(:disabled)"))?.focus();
  });
  intervalMenu.pop.addEventListener("keydown", event => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...intervalSeg.querySelectorAll("button:not(:disabled)")];
    let index = buttons.indexOf(document.activeElement);
    if (event.key === "Home") index = 0;
    else if (event.key === "End") index = buttons.length - 1;
    else index = (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[index]?.focus();
  });
  syncInterval();

  const chartTypes = groupOf("seg-chart-type"), chartTypeSeg = $id("seg-chart-type");
  chartTypes.classList.add("tb-g-chart-type");
  const chartTypeTrigger = trigger("tb-chart-type-btn", "ctl.chart_type");
  delete chartTypeTrigger.dataset.i18nAriaLabel;
  const chartTypeIcon = el("span", "tb-ico");
  chartTypeTrigger.append(chartTypeIcon, caret());
  chartTypes.append(chartTypeTrigger);
  const chartTypeMenu = popover("tb-chart-type-pop", null, chartTypeTrigger);
  chartTypeSeg.classList.add("tb-radio-list");
  for (const button of chartTypeSeg.querySelectorAll("button")) {
    const check = el("span", "tb-check", { "aria-hidden": "true" });
    check.textContent = "✓";
    button.append(check);
  }
  const candleOptions = el("div", "tb-sub", { id: "tb-candle-options" });
  const lineOptions = el("div", "tb-sub", { id: "tb-line-options" });
  const chartTypeList = el("div", "tb-style-list tb-chart-type-list");
  chartTypeList.append(chartTypeSeg, candleOptions, lineOptions);
  chartTypeMenu.pop.append(chartTypeList);
  const syncChartType = () => {
    const selected = chartTypeSeg.querySelector("button.active");
    const svg = selected?.querySelector("svg");
    chartTypeIcon.replaceChildren(...(svg ? [svg.cloneNode(true)] : []));
    chartTypeTrigger.setAttribute("aria-label", `${t("ctl.chart_type")}: ${selected ? t(`ct.${selected.dataset.val}`) : ""}`);
    candleOptions.hidden = selected?.dataset.val === "line";
    lineOptions.hidden = selected?.dataset.val !== "line";
    replace(chartTypeMenu);
  };
  new MutationObserver(syncChartType).observe(chartTypeSeg, { attributes: true, subtree: true, attributeFilter: ["class"] });
  syncChartType();

  groupOf("btn-pin")?.classList.add("tb-g-pin");
  const pinChip = $id("pin-state"), pinButton = $id("btn-pin");
  if (pinChip && pinButton) {
    $id("price-ohlc")?.after(pinChip);
    pinChip.hidden = touchFirst;
    pinChip.setAttribute("role", "button");
    pinChip.tabIndex = 0;
    const syncPinChip = () => {
      const pinned = pinButton.classList.contains("active");
      pinChip.title = t(pinned ? "t.tb_pin_off" : "t.tb_pin_on");
      pinChip.setAttribute("aria-pressed", String(pinned));
    };
    pinChip.addEventListener("click", () => pinButton.click());
    pinChip.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      pinButton.click();
    });
    new MutationObserver(syncPinChip).observe(pinButton, { attributes: true, attributeFilter: ["class"] });
    new MutationObserver(syncPinChip).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    syncPinChip();
  }

  const replay = groupOf("btn-play");
  replay.classList.add("tb-g-replay");
  const replayTrigger = trigger("tb-replay-btn", "t.tb_replay", "ctl.replay");
  replayTrigger.append(icon(ICONS.replay), text("ctl.replay", "tb-trigger-text"), caret());
  replay.append(replayTrigger);
  const replayMenu = popover("tb-replay-pop", null, replayTrigger);
  replayMenu.pop.setAttribute("aria-label", t("ctl.replay"));
  replayMenu.pop.append(row($id("btn-step-back"), $id("btn-play"), $id("btn-step-fwd"),
    replay.querySelector("label.speed"), $id("chk-show-future").closest("label")));
  const syncReplay = () => replayTrigger.classList.toggle("tb-active", $id("btn-play").getAttribute("aria-pressed") === "true");
  new MutationObserver(syncReplay).observe($id("btn-play"), { attributes: true, attributeFilter: ["aria-pressed"] });
  syncReplay();

  const fills = groupOf("seg-fills-filter");
  fills.classList.add("tb-g-fills");
  fills.querySelector(":scope > .label").classList.add("tb-empty");

  const styleSeg = $id("seg-fill-style");
  const styleTrigger = trigger("tb-style-btn", "t.tb_style", "tb.fills");
  styleTrigger.append(icon(ICONS.fills), text("tb.fills", "tb-trigger-text"), caret());
  styleSeg.closest(".control-pair").replaceWith(styleTrigger);
  const styleMenu = popover("tb-style-pop", null, styleTrigger);
  const fillSettings = el("div", "tb-fill-settings");
  fillSettings.append(text("tb.scope", "tb-section-label"), $id("seg-fills-filter"), $id("fill-intent-control"));
  styleMenu.pop.append(fillSettings, row(text("tb.style", "tb-section-label")));
  for (const button of styleSeg.querySelectorAll("button")) {
    const val = button.dataset.val === "bubble" ? "bubble" : "arrow";
    const nameKey = button.dataset.i18n;
    button.removeAttribute("data-i18n");
    const option = el("span", "tb-opt");
    option.append(text(nameKey, "tb-opt-name"));
    const check = el("span", "tb-check", { "aria-hidden": "true" });
    check.textContent = "✓";
    button.replaceChildren(icon(ICONS[val]), option, check);
  }
  styleSeg.classList.add("tb-radio-list");
  const arrowOptions = el("div", "tb-sub", { id: "tb-arrow-options" });
  const bubbleOptions = $id("bubble-options");
  bubbleOptions.classList.add("tb-sub");
  bubbleOptions.querySelector(":scope > .label").dataset.i18n = "tb.overlap";
  bubbleOptions.querySelector('#seg-bubble-group [data-val="order"]').dataset.i18n = "tb.no_merge";
  bubbleOptions.querySelector('#seg-bubble-group [data-val="cluster"]').dataset.i18n = "tb.merge";
  $id("seg-fill-text").closest(".control-pair").classList.add("tb-empty");
  const styleList = el("div", "tb-style-list");
  styleList.append(styleSeg, arrowOptions, bubbleOptions);
  styleMenu.pop.append(styleList);
  const syncStyle = () => {
    const val = styleSeg.querySelector("button.active")?.dataset.val === "bubble" ? "bubble" : "arrow";
    arrowOptions.hidden = val !== "arrow";
    replace(styleMenu);
  };
  new MutationObserver(syncStyle).observe(styleSeg, { attributes: true, subtree: true, attributeFilter: ["class"] });
  new MutationObserver(() => replace(styleMenu)).observe(bubbleOptions, { attributes: true, attributeFilter: ["hidden"] });

  const COLOR_KEYS = [["takerBuy", "tb.taker_buy"], ["makerBuy", "tb.maker_buy"], ["takerSell", "tb.taker_sell"], ["makerSell", "tb.maker_sell"]];
  const DEFAULTS = {
    arrow: { takerBuy: "#ffa726", makerBuy: "#26a69a", takerSell: "#ec407a", makerSell: "#ef5350" },
    bubble: { takerBuy: "#26a69a", makerBuy: "#26a69a", takerSell: "#ef5350", makerSell: "#ef5350" },
  };
  const isColor = (value) => typeof value === "string" && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value);
  const colors = {};
  for (const set of ["arrow", "bubble"]) {
    const saved = prefs.colors?.[set] ?? {};
    colors[set] = Object.fromEntries(COLOR_KEYS.map(([key]) => [key, isColor(saved[key]) ? saved[key].toLowerCase() : DEFAULTS[set][key]]));
  }
  const LABEL_PARTS = [["side", "t.tb_label_side"], ["pct", "t.tb_label_pct"], ["price", "t.tb_label_price"]];
  const LABEL_DEFAULTS = { side: false, pct: true, price: false };
  const labels = {};
  for (const set of ["arrow", "bubble"]) {
    const saved = prefs.labels?.[set] ?? {};
    labels[set] = Object.fromEntries(LABEL_PARTS.map(([part]) => [part, typeof saved[part] === "boolean" ? saved[part] : LABEL_DEFAULTS[part]]));
  }
  Object.defineProperty(state, "fillText", {
    configurable: true, enumerable: true, get: () => Object.values(labels.bubble).some(Boolean), set() {},
  });
  const money = (value) => Math.round(value).toLocaleString("en-US");
  global.bubbleLabel = function bubbleLabelParts(group) {
    const parts = [];
    const net = bubbleNet(group);
    if (labels.bubble.side) parts.push(group.kind.side === "B" ? "B" : "S");
    if (labels.bubble.pct) parts.push(`${net.pct.toFixed(net.pct >= 100 ? 0 : net.pct >= 10 ? 1 : 2)}%`);
    if (labels.bubble.price) parts.push(`@${money(bubbleVwap(group))}`);
    if (group.orders.size > 1) parts.push(`· ${t("bubble.orders", group.orders.size)}`);
    return parts.join(" ");
  };
  const arrowKeyOf = Object.fromEntries(COLOR_KEYS.map(([key]) => [DEFAULTS.arrow[key], key]));
  const barIndex = () => {
    const map = new Map();
    const bars = state.timeline?.bars ?? [];
    let av = bars.find((bar) => bar.av > 0)?.av ?? null;
    for (const bar of bars) {
      if (bar.av > 0) av = bar.av;
      map.set(Math.floor(bar.t / 1000), { bar, av });
    }
    return map;
  };
  const arrowLabel = (entry, side, taker) => {
    if (!entry) return "";
    let notional = 0, size = 0;
    for (const fill of entry.bar.fills ?? []) {
      const sz = Number(fill.sz), px = Number(fill.px);
      if (fill.side !== side || Boolean(fill.crossed) !== taker || !(sz > 0 && px > 0)) continue;
      notional += sz * px;
      size += sz;
    }
    const parts = [];
    if (labels.arrow.side) parts.push(side === "B" ? "B" : "S");
    if (labels.arrow.pct) parts.push(entry.av > 0 ? `${(notional / entry.av * 100).toFixed(2)}%` : "—");
    if (labels.arrow.price && size > 0) parts.push(`@${money(notional / size)}`);
    return parts.join(" ");
  };
  const setMarkers = priceSeries.setMarkers.bind(priceSeries);
  priceSeries.setMarkers = (markers) => {
    const index = markers.length ? barIndex() : null;
    return setMarkers(markers.map((marker) => {
      const key = arrowKeyOf[String(marker.baseColor ?? marker.color).toLowerCase()];
      if (!key) return marker;
      const color = typeof hoverMarkColor === "function" ? hoverMarkColor(colors.arrow[key], marker.id) : colors.arrow[key];
      const next = { ...marker, color };
      delete next.baseColor;
      delete next.text;
      const label = arrowLabel(index.get(marker.time), marker.position === "belowBar" ? "B" : "A", key.startsWith("taker"));
      if (label) next.text = label;
      return next;
    }));
  };
  const bubbleKinds = {
    B: { any: { side: "B", role: "any" }, taker: { side: "B", role: "taker" }, maker: { side: "B", role: "maker" } },
    A: { any: { side: "A", role: "any" }, taker: { side: "A", role: "taker" }, maker: { side: "A", role: "maker" } },
  };
  const paintKinds = () => {
    const c = colors.bubble;
    Object.assign(bubbleKinds.B.any, { color: c.takerBuy });
    Object.assign(bubbleKinds.B.taker, { color: c.takerBuy });
    Object.assign(bubbleKinds.B.maker, { color: c.makerBuy });
    Object.assign(bubbleKinds.A.any, { color: c.takerSell });
    Object.assign(bubbleKinds.A.taker, { color: c.takerSell });
    Object.assign(bubbleKinds.A.maker, { color: c.makerSell });
  };
  const split = (side) => (side === "B" ? colors.bubble.takerBuy !== colors.bubble.makerBuy : colors.bubble.takerSell !== colors.bubble.makerSell);
  const collect = global.collectBubbles;
  global.collectBubbles = function collectBubblesByColour() {
    collect();
    const totals = new Map();
    for (const part of bubbleParts) {
      const sum = totals.get(part.key) ?? { taker: 0, notional: 0 };
      sum.taker += part.taker;
      sum.notional += part.notional;
      totals.set(part.key, sum);
    }
    for (const part of bubbleParts) {
      const side = part.kind.side === "B" ? "B" : "A";
      const sum = totals.get(part.key);
      part.kind = bubbleKinds[side][split(side) ? (sum.taker * 2 >= sum.notional ? "taker" : "maker") : "any"];
    }
    bubbleOrderCache.clear();
  };
  const swatches = { arrow: new Map(), bubble: new Map() };
  const paintColors = () => {
    paintKinds();
    for (const set of ["arrow", "bubble"]) {
      for (const [key, { input, swatch }] of swatches[set]) {
        input.value = colors[set][key];
        swatch.style.setProperty("--swatch", colors[set][key]);
      }
    }
    const root = document.documentElement.style;
    root.setProperty("--tb-arrow-buy", colors.arrow.takerBuy);
    root.setProperty("--tb-arrow-sell", colors.arrow.takerSell);
    root.setProperty("--tb-bubble-buy", colors.bubble.takerBuy);
    root.setProperty("--tb-bubble-sell", colors.bubble.takerSell);
    if (state.timeline) applyFillMarkers();
  };
  const saveColors = () => {
    const changed = {};
    for (const set of ["arrow", "bubble"]) {
      if (COLOR_KEYS.some(([key]) => colors[set][key] !== DEFAULTS[set][key])) changed[set] = { ...colors[set] };
    }
    if (Object.keys(changed).length) prefs.colors = changed;
    else delete prefs.colors;
    savePrefs();
  };
  const colorRow = (set) => {
    const grid = el("div", "tb-colors");
    for (const [key, labelKey] of COLOR_KEYS) {
      const cell = el("div", "tb-color");
      const swatch = el("button", "tb-swatch", { type: "button", id: `tb-${set}-${key}-trigger` });
      swatch.dataset.i18nAriaLabel = labelKey;
      swatch.setAttribute("aria-label", t(labelKey));
      const input = el("input", "", { type: "color", id: `tb-${set}-${key}` });
      input.addEventListener("input", () => { colors[set][key] = input.value.toLowerCase(); paintColors(); });
      input.addEventListener("change", saveColors);
      swatches[set].set(key, { input, swatch });
      cell.append(text(labelKey, "ind-sub"), swatch, input);
      grid.append(cell);
      global.TradeVizColors.attach({ input, trigger: swatch, defaultColor: DEFAULTS[set][key], label: () => t(labelKey) });
    }
    return [text("tb.colors", "label"), grid];
  };
  const SAMPLE = { arrow: { side: "B", pct: "3.20%", price: "@90,252" }, bubble: { side: "B", pct: "12.3%", price: "@83,108" } };
  const labelRow = (set) => {
    const sample = el("div", "tb-sample", { id: `tb-${set}-labels`, role: "group" });
    for (const [part, titleKey] of LABEL_PARTS) {
      const button = el("button", "", { type: "button" });
      button.dataset.part = part;
      button.dataset.i18nTitle = titleKey;
      button.textContent = SAMPLE[set][part];
      button.setAttribute("aria-pressed", String(labels[set][part]));
      button.addEventListener("click", () => {
        labels[set][part] = !labels[set][part];
        button.setAttribute("aria-pressed", String(labels[set][part]));
        prefs.labels = { arrow: { ...labels.arrow }, bubble: { ...labels.bubble } };
        savePrefs();
        if (state.timeline) applyFillMarkers();
      });
      sample.append(button);
    }
    return [text("tb.labels", "label"), sample];
  };
  const MIN_CHOICES = [0, 1, 2, 3, 4, 5], MAX_CHOICES = [10, 20, 30, 40, 50, Infinity];
  const radius = {
    min: MIN_CHOICES.includes(prefs.bubbleRadius?.min) ? prefs.bubbleRadius.min : BUBBLE_MIN_R,
    max: prefs.bubbleRadius?.max === null ? Infinity : MAX_CHOICES.includes(prefs.bubbleRadius?.max) ? prefs.bubbleRadius.max : BUBBLE_MAX_R,
  };
  const clampRadius = (raw) => Math.min(radius.max, Math.max(radius.min, raw));
  global.placeBubble = function placeBubbleWithLimits(group, timeScale, ref, scale) {
    if (!bubbleNet(group).size) return null;
    const x = bubbleLogicalX(timeScale, group.weighted / group.notional);
    const y = priceSeries.priceToCoordinate(bubbleVwap(group));
    if (x == null || y == null) return null;
    const raw = bubbleRawRadius(bubbleMeasure(group), ref);
    return { group, x, y, r: clampRadius(raw) * scale, raw: raw * scale, scale };
  };
  const cluster = global.clusterBubbles;
  global.clusterBubbles = function clusterBubblesWithLimits(view, until) {
    return cluster(view, until, radius, group => {
      const net = bubbleNet(group);
      if (!net.side) return group.kind;
      const role = split(net.side) ? (net.taker * 2 >= net.notional ? "taker" : "maker") : "any";
      return bubbleKinds[net.side][role];
    });
  };
  const radiusSelect = (id, choices, current) => {
    const select = el("select", "", { id });
    for (const value of choices) {
      const option = el("option");
      option.value = Number.isFinite(value) ? String(value) : "none";
      option.textContent = Number.isFinite(value) ? String(value) : "∞";
      if (!Number.isFinite(value)) option.dataset.symbol = "infinity";
      option.selected = value === current;
      select.append(option);
    }
    return select;
  };
  const minSelect = radiusSelect("tb-radius-min", MIN_CHOICES, radius.min);
  const maxSelect = radiusSelect("tb-radius-max", MAX_CHOICES, radius.max);
  const onRadius = () => {
    radius.min = Number(minSelect.value === "none" ? 0 : minSelect.value);
    radius.max = maxSelect.value === "none" ? Infinity : Number(maxSelect.value);
    prefs.bubbleRadius = { min: radius.min, max: Number.isFinite(radius.max) ? radius.max : null };
    savePrefs();
    if (state.timeline) applyFillMarkers();
  };
  minSelect.addEventListener("change", onRadius);
  maxSelect.addEventListener("change", onRadius);
  const radiusCell = el("span", "tb-radius");
  const dash = el("span", "", { "aria-hidden": "true" });
  dash.textContent = "–";
  radiusCell.append(minSelect, dash, maxSelect, text("tb.radius_unit", "ind-sub"));
  arrowOptions.append(...labelRow("arrow"), ...colorRow("arrow"));
  bubbleOptions.append(text("tb.radius", "label"), radiusCell, ...labelRow("bubble"), ...colorRow("bubble"));
  if (typeof enhanceFormControls === "function") enhanceFormControls(bubbleOptions);
  paintColors();
  syncStyle();

  const LINE_WIDTHS = [1, 2, 3, 4];
  const chartStyle = { candle: { ...DEFAULT_CHART_STYLE.candle }, line: { ...DEFAULT_CHART_STYLE.line } };
  for (const [key, value] of Object.entries(prefs.chartStyle?.candle ?? {})) {
    const fallback = DEFAULT_CHART_STYLE.candle[key];
    if (typeof fallback === "boolean" && typeof value === "boolean") chartStyle.candle[key] = value;
    else if (typeof fallback === "string" && isColor(value)) chartStyle.candle[key] = value.toLowerCase();
  }
  if (isColor(prefs.chartStyle?.line?.color)) chartStyle.line.color = prefs.chartStyle.line.color.toLowerCase();
  if (LINE_WIDTHS.includes(prefs.chartStyle?.line?.width)) chartStyle.line.width = prefs.chartStyle.line.width;
  const applyChartStyle = () => {
    state.chartStyle = { candle: { ...chartStyle.candle }, line: { ...chartStyle.line } };
    applyChartType();
  };
  const saveChartStyle = () => {
    const changed = {};
    for (const part of ["candle", "line"]) {
      const diff = Object.entries(chartStyle[part]).filter(([key, value]) => value !== DEFAULT_CHART_STYLE[part][key]);
      if (diff.length) changed[part] = Object.fromEntries(diff);
    }
    if (Object.keys(changed).length) prefs.chartStyle = changed;
    else delete prefs.chartStyle;
    savePrefs();
  };
  const styleSwatch = (part, key, nameKeys, sideKey) => {
    const cell = el("div", sideKey ? "tb-color" : "tb-color tb-color-solo");
    const swatch = el("button", "tb-swatch", { type: "button", id: `tb-${part}-${key}-trigger` });
    const name = () => nameKeys.map((k) => t(k)).join(" ");
    swatch.setAttribute("aria-label", name());
    const input = el("input", "", { type: "color", id: `tb-${part}-${key}` });
    const paint = () => {
      input.value = chartStyle[part][key];
      swatch.style.setProperty("--swatch", chartStyle[part][key]);
    };
    input.addEventListener("input", () => {
      if (!isColor(input.value)) return;
      chartStyle[part][key] = input.value.toLowerCase();
      swatch.style.setProperty("--swatch", chartStyle[part][key]);
      applyChartStyle();
    });
    input.addEventListener("change", saveChartStyle);
    if (sideKey) cell.append(text(sideKey, "ind-sub"));
    cell.append(swatch, input);
    global.TradeVizColors.attach({ input, trigger: swatch, defaultColor: DEFAULT_CHART_STYLE[part][key], label: name });
    paint();
    return cell;
  };
  const upDown = (prefix, nameKey) => {
    const grid = el("div", "tb-colors");
    grid.append(styleSwatch("candle", `${prefix}Up`, [nameKey, "tb.cs_up"], "tb.cs_up"),
      styleSwatch("candle", `${prefix}Down`, [nameKey, "tb.cs_down"], "tb.cs_down"));
    return grid;
  };
  const partToggle = (key, nameKey) => {
    const label = el("label", "chk");
    const box = el("input", "", { type: "checkbox", id: `tb-candle-${key}` });
    box.checked = chartStyle.candle[key];
    box.addEventListener("change", () => {
      chartStyle.candle[key] = box.checked;
      applyChartStyle();
      saveChartStyle();
    });
    label.append(box, text(nameKey));
    return label;
  };
  candleOptions.append(text("tb.cs_body", "tb-cs-body"), upDown("body", "tb.cs_body"),
    partToggle("wick", "tb.cs_wick"), upDown("wick", "tb.cs_wick"));
  const widthSelect = el("select", "", { id: "tb-line-width" });
  for (const width of LINE_WIDTHS) {
    const option = el("option");
    option.value = String(width);
    option.textContent = String(width);
    option.selected = width === chartStyle.line.width;
    widthSelect.append(option);
  }
  widthSelect.addEventListener("change", () => {
    chartStyle.line.width = Number(widthSelect.value);
    applyChartStyle();
    saveChartStyle();
  });
  const widthCell = el("span", "tb-line-width");
  widthCell.append(widthSelect, text("tb.cs_width_unit", "ind-sub"));
  lineOptions.append(text("tb.cs_color", "label"), styleSwatch("line", "color", ["ct.line", "tb.cs_color"]),
    text("tb.cs_width", "label"), widthCell);
  if (typeof enhanceFormControls === "function") enhanceFormControls(lineOptions);
  applyChartStyle();

  const orders = groupOf("seg-order-mode");
  orders.classList.add("tb-g-orders");
  const modeSeg = $id("seg-order-mode");
  const showAll = $id("seg-show-all");
  const showAllGroup = showAll.closest(".control-group");
  showAllGroup.classList.add("tb-empty");
  const ordersTrigger = trigger("tb-orders-btn", "t.tb_order_settings", "tb.order_settings");
  ordersTrigger.append(icon(ICONS.sliders), text("tb.order_settings", "tb-trigger-text"), caret());
  orders.append(ordersTrigger);
  const ordersMenu = popover("tb-orders-pop", null, ordersTrigger);
  const colorGroup = $id("order-color-buy-trigger").closest(".control-group");
  colorGroup.classList.add("tb-empty");
  const sideLabel = (key) => colorGroup.querySelector(`:scope > .ind-sub[data-i18n="${key}"]`);
  const [buyColor, sellColor] = colorGroup.querySelectorAll(":scope > .order-color-control");
  const unfilledLabel = colorGroup.querySelector(':scope > [data-i18n="ol.unfilled"]');
  unfilledLabel.dataset.i18n = "tb.unfilled";
  unfilledLabel.className = "tb-row-label";
  const showAllLabel = showAllGroup.querySelector(":scope > .label");
  showAllLabel.className = "tb-row-label";
  const orderControls = el("div", "tb-order-controls");
  const orderRow = (label, ...controls) => {
    const value = el("div", "tb-order-value");
    value.append(...controls);
    const line = el("div", "tb-order-row");
    line.append(label, value);
    return line;
  };
  orderControls.append(
    orderRow(showAllLabel, showAll),
    orderRow(text("tb.line_mode", "tb-row-label"), modeSeg),
    orderRow(text("ol.filled", "tb-row-label"), $id("order-filled-alpha"), $id("order-filled-alpha-val")),
    orderRow(unfilledLabel, $id("order-unfilled-alpha"), $id("order-unfilled-alpha-val")),
    orderRow(text("tb.colors", "tb-row-label"), sideLabel("side.buy"), buyColor, sideLabel("side.sell"), sellColor),
  );
  ordersMenu.pop.append(orderControls);
  const marks = [...bar.childNodes].filter((node) => node.nodeType === Node.COMMENT_NODE);
  const from = marks.find((node) => node.data.trim() === "site:controls");
  const to = marks.find((node) => node.data.trim() === "/site:controls");
  if (from && to) {
    const siteNodes = [];
    for (let node = from.nextSibling; node && node !== to; node = node.nextSibling) {
      if (node.nodeType === Node.ELEMENT_NODE) siteNodes.push(node);
    }
    for (const node of siteNodes) {
      const label = node.querySelector(":scope > .label");
      if (!node.classList.contains("control-group") || !label) {
        ordersMenu.pop.append(row(node));
        continue;
      }
      label.className = "tb-row-label";
      const line = orderRow(label, ...[...node.children]);
      if (node.id) line.id = `${node.id}-row`;
      orderControls.append(line);
      node.classList.add("tb-empty");
    }
  }
  const modeButton = (val) => modeSeg.querySelector(`button[data-val="${val}"]`);
  const fullMode = () => modeSeg.querySelector("button.active")?.dataset.val === "full";
  const allOrdersOn = () => showAll.querySelector("button.active")?.dataset.val === "on";
  showAll.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!event.isTrusted || button?.dataset.val !== "on" || allOrdersOn() || !fullMode()) return;
    modeButton("lifecycle").click();
  }, true);
  modeSeg.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!event.isTrusted || button?.dataset.val !== "full" || !allOrdersOn()) return;
    showAll.querySelector('button[data-val="off"]').click();
  }, true);
  if ("modeBeforeAllOrders" in prefs) { delete prefs.modeBeforeAllOrders; savePrefs(); }

  const indicators = groupOf("ind-add");
  indicators.classList.add("tb-g-ind");
  const indTrigger = trigger("tb-ind-btn", "tb.ind_title");
  indTrigger.append(icon(ICONS.indicator), text("tb.ind", "tb-trigger-text"), caret());
  const wrapper = (node) => node.closest(".form-select, .form-number") ?? node;
  const indMenu = popover("tb-ind-pop", null, indTrigger);
  indMenu.pop.append(row(wrapper($id("ind-type")), wrapper($id("ind-period")), $id("ind-add")));
  indMenu.pop.append(row($id("chk-liquidation").closest("label"), $id("chk-cash-flows").closest("label")));
  indicators.append(indTrigger);
  $id("ind-add").addEventListener("click", () => { if (openEntry === indMenu) close(); });

  const priceWrap = $id("chart-price").closest(".chart-wrap");
  const fullscreenGroups = [fills, orders, indicators];
  let fullscreenHomes = null, fullscreenBarSize = null;
  new MutationObserver(() => {
    const maximized = priceWrap.classList.contains("maximized");
    const maxBar = priceWrap.querySelector(":scope > .maximized-controls");
    if (maximized && maxBar && !fullscreenHomes) {
      fullscreenHomes = fullscreenGroups.map((node) => ({ node, parent: node.parentNode, before: node.nextSibling }));
      maxBar.append(...fullscreenGroups);
      fullscreenBarSize = new ResizeObserver(() => {
        priceWrap.style.setProperty("--tb-max-bar", `${maxBar.offsetHeight}px`);
        scheduleToolbar();
      });
      fullscreenBarSize.observe(maxBar);
    } else if (!maximized && fullscreenHomes) {
      for (const { node, parent, before } of fullscreenHomes) parent.insertBefore(node, before?.parentNode === parent ? before : null);
      fullscreenHomes = null;
      fullscreenBarSize?.disconnect();
      priceWrap.style.removeProperty("--tb-max-bar");
    }
    close();
    scheduleToolbar();
  }).observe(priceWrap, { attributes: true, attributeFilter: ["class"] });

  const snapshot = groupOf("seg-snapshot");
  snapshot.classList.add("tb-g-side");
  snapshot.querySelector(":scope > .label").dataset.i18n = "tb.snapshot";
  if (touchFirst) {
    snapshot.classList.add("tb-empty");
    const snapshotSeg = $id("seg-snapshot");
    const keepOpen = () => {
      const show = snapshotSeg.querySelector('button[data-val="show"]');
      if (show && !show.classList.contains("active")) show.click();
    };
    new MutationObserver(keepOpen).observe(snapshotSeg, { attributes: true, subtree: true, attributeFilter: ["class"] });
    keepOpen();
  }

  let toolbarFrame = 0;
  const layoutToolbar = () => {
    toolbarFrame = 0;
    const host = priceWrap.querySelector(":scope > .maximized-controls") ?? bar;
    const root = document.documentElement, previous = root.dataset.tbDensity;
    root.dataset.tbDensity = "full";
    intervals.insertBefore(intervalSeg, intervalTrigger);
    host.classList.add("tb-measuring");
    const fits = () => {
      const css = getComputedStyle(host);
      const children = [...host.children].filter(node => node.getBoundingClientRect().width > 0);
      const width = children.reduce((sum, node) => sum + node.getBoundingClientRect().width, 0)
        + Math.max(0, children.length - 1) * parseFloat(css.columnGap);
      return width <= host.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    };
    if (!fits()) {
      root.dataset.tbDensity = "indicator";
      if (!fits()) {
        root.dataset.tbDensity = "compact";
        intervalMenu.pop.append(intervalSeg);
      }
    }
    host.classList.remove("tb-measuring");
    if (previous !== root.dataset.tbDensity && openEntry === intervalMenu) close();
    if (openEntry) place(openEntry);
  };
  const scheduleToolbar = () => { if (!toolbarFrame) toolbarFrame = requestAnimationFrame(layoutToolbar); };
  new ResizeObserver(scheduleToolbar).observe(bar);
  new MutationObserver(() => { syncInterval(); syncChartType(); scheduleToolbar(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  for (const node of bar.querySelectorAll(".tb-trigger-text")) {
    new MutationObserver(scheduleToolbar).observe(node, { childList: true, characterData: true, subtree: true });
  }
  global.addEventListener("resize", scheduleToolbar);
  document.fonts?.ready.then(scheduleToolbar);
  applyStaticI18n();
  layoutToolbar();
}
if (new URLSearchParams(globalThis.location?.search ?? "").get("toolbar") !== "classic") {
  if (typeof I18N === "undefined") document.addEventListener("DOMContentLoaded", () => installCompactToolbar(globalThis), { once: true });
  else installCompactToolbar(globalThis);
}
