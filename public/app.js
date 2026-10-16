"use strict";

const LWC = window.LightweightCharts;
if (!LWC) {
  document.body.innerHTML =
    '<div style="padding:40px;color:#e6edf3;font-family:sans-serif">'
    + '无法加载 lightweight-charts。'
    + '请确认 <code>vendor/lightweight-charts.standalone.production.js</code> 存在。</div>';
  throw new Error("lightweight-charts missing");
}

const PREFS_KEY = "ui_prefs";
const DEFAULT_ORDER_COLORS = Object.freeze({ buy: "#26a69a", sell: "#ef5350" });

const state = {
  interval: "4h",
  timeline: null,
  timelineBusy: false,
  timelineVersion: 0,
  orders: [],
  fills: [],
  pnlUnit: "usd",
  pnlPercent: false,
  pnlStart: null,
  pnlDefaultStart: null,
  pnlStartPicking: false,
  unfilledAlpha: 0.3,
  filledAlpha: 0.6,
  summary: null,
  pinned: false,
  selectedT: null,
  playTimer: null,
  fillMarkers: "all",
  intentThresholdPct: 0.2,
  fillStyle: "bubble",
  fillText: true,
  bubbleGroup: "order",
  bubbleSize: "pos",
  showAllOrders: false,
  showLiquidation: true,
  showCashFlows: false,
  hoverOid: null,
  hoverOids: new Set(),
  chartType: "candles",
  chartStyle: null,
  orderLineMode: "lifecycle",
  ordersSort: [{ key: "side", dir: 1 }, { key: "price", dir: 1 }],
  indicators: [],
  orderColors: { ...DEFAULT_ORDER_COLORS },
  sidebarCollapsed: false,
  chartMaximized: false,
  replayMode: "overlay",
  lang: (function () {
    const stored = loadPrefs().lang;
    return (stored === "zh" || stored === "en")
      ? stored
      : ((navigator.language || "en").toLowerCase().startsWith("zh") ? "zh" : "en");
  })(),
};
window.state = state;

const $ = (id) => document.getElementById(id);
const els = {
  cardAv: $("card-av"),
  cardAvSource: $("card-av-source"),
  cardPos: $("card-pos"),
  cardPosSide: $("card-pos-side"),
  cardLev: $("card-lev"),
  cardUpdate: $("card-update"),
  cardUpdateDetail: $("card-update-detail"),
  hyperbotLink: $("hyperbot-link"),
  segInterval: $("seg-interval"),
  intervalLoading: $("interval-loading"),
  btnPlay: $("btn-play"),
  btnStepBack: $("btn-step-back"),
  btnStepFwd: $("btn-step-fwd"),
  playSpeed: $("play-speed"),
  btnPin: $("btn-pin"),
  btnPinLatest: $("btn-pin-latest"),
  pinState: $("pin-state"),
  priceOhlc: $("price-ohlc"),
  selTime: $("sel-time"),
  selPx: $("sel-px"),
  selPos: $("sel-pos"),
  selNotional: $("sel-notional"),
  selAvBtc: $("sel-av-btc"),
  selAv: $("sel-av"),
  selLev: $("sel-lev"),
  selPnl: $("sel-pnl"),
  selPnlReturn: $("sel-pnl-return"),
  selPnlReturnGroup: $("sel-pnl-return-group"),
  pnlStartMenu: $("pnl-start-menu"),
  pnlStartTrigger: $("pnl-start-trigger"),
  pnlStartSummary: $("pnl-start-summary"),
  pnlStartSelected: $("pnl-start-selected"),
  pnlStartClear: $("pnl-start-clear"),
  pnlDefaultLabel: $("pnl-default-label"),
  pnlDefaultTime: $("pnl-default-time"),
  pnlStartStatus: $("pnl-start-status"),
  ordersTableBody: document.querySelector("#orders-table tbody"),
  ordersEmpty: $("orders-empty"),
};

const CORE_I18N = {
  "app.title": { zh: "交易可视化", en: "Trade Visualizer" },
  "hdr.addr": { zh: "地址", en: "Address" },
  "card.av": { zh: "账户价值", en: "Account Value" },
  "card.av_source": { zh: "截止", en: "As of" },
  "card.pos": { zh: "当前 BTC 仓位", en: "Current BTC Position" },
  "card.lev": { zh: "实际杠杆 (有方向)", en: "Actual Leverage (signed)" },
  "card.lev_sub": { zh: "永续合约价值 / 账户价值", en: "Perp Value / Account Value" },
  "card.update": { zh: "数据更新", en: "Data Update" },
  "card.update_sub": { zh: "最新数据时刻", en: "Newest data at" },
  "pos.flat": { zh: "无仓位", en: "No position" },
  "pos.perp": { zh: "永续合约价值", en: "Perp value" },
  "update.ok": { zh: "上次成功", en: "Last: OK" },
  "update.bad": { zh: "上次失败 / 进行中", en: "Last: failed / running" },
  "ctl.interval": { zh: "K 线粒度", en: "Interval" },
  "ctl.chart_type": { zh: "K 线类型", en: "Chart type" },
  "ct.candles": { zh: "K线图", en: "Candles" },
  "ct.line": { zh: "线形图", en: "Line" },
  "ctl.interval_loading": { zh: "正在加载 K 线", en: "Loading candles" },
  "ctl.replay": { zh: "回放", en: "Replay" },
  "ctl.play": { zh: "▶", en: "▶" },
  "ctl.pause": { zh: "⏸", en: "⏸" },
  "t.step_back": { zh: "上一根 K 线（快捷键：←）", en: "Previous candle (shortcut: ←)" },
  "t.step_fwd": { zh: "下一根 K 线（快捷键：→）", en: "Next candle (shortcut: →)" },
  "t.play": { zh: "播放回放（快捷键：空格）", en: "Play replay (shortcut: Space)" },
  "t.pause": { zh: "暂停回放（快捷键：空格）", en: "Pause replay (shortcut: Space)" },
  "ctl.speed": { zh: "速度 (根/秒)", en: "Speed (bars/s)" },
  "ctl.show_future": { zh: "显示未来", en: "Show future" },
  "t.show_future": { zh: "开：叠加在完整图上，用十字虚线标出回放位置，能看到未来 K 线/挂单。"
                     + "关：真历史回放，只显示到回放点为止（隐藏未来）。回放中途也可随时切换。",
                     en: "On: overlay on the full chart with a dashed crosshair at the replay point; future candles/orders visible. "
                     + "Off: true history replay — show only up to the replay point (future hidden). Toggle anytime, even mid-replay." },
  "ctl.pin": { zh: "钉住时间", en: "Pin Time" },
  "ctl.pin_toggle": { zh: "📌 钉住", en: "📌 Pin" },
  "ctl.pin_latest": { zh: "⇥ 最新", en: "⇥ Latest" },
  "ctl.fills": { zh: "成交标记", en: "Fill Markers" },
  "fills.all": { zh: "全部", en: "All" },
  "fills.scope": { zh: "显示范围", en: "Display range" },
  "fills.taker": { zh: "主动订单", en: "Active orders" },
  "fills.maker": { zh: "被动订单", en: "Passive orders" },
  "fills.threshold": { zh: "主动判定阈值", en: "Active threshold" },
  "fills.threshold_help": {
    zh: "当挂单价与下单时的盘口价距离不超过 {0}% 的时候，按主动订单显示。",
    en: "When the order price is within {0}% of the order-book price at the time it was placed, it is shown as an active order." },
  "t.fills_maker": { zh: "只显示被动成交", en: "Only passive fills" },
  "fills.none": { zh: "无", en: "None" },
  "ctl.fill_style": { zh: "样式", en: "Style" },
  "fill.arrow": { zh: "箭头", en: "Arrows" },
  "fill.bubble": { zh: "气泡", en: "Bubbles" },
  "ctl.fill_text": { zh: "文字", en: "Labels" },
  "fill.text_on": { zh: "显示", en: "Show" },
  "fill.text_off": { zh: "隐藏", en: "Hide" },
  "ctl.bubble": { zh: "气泡", en: "Bubbles" },
  "bubble.order": { zh: "重叠不合并", en: "One per order" },
  "bubble.cluster": { zh: "重叠合并", en: "Merge on overlap" },
  "ctl.bubble_size": { zh: "大小", en: "Size" },
  "bubble.pos": { zh: "按仓位", en: "By position" },
  "bubble.usd": { zh: "按金额", en: "By amount" },
  "ctl.show_all": { zh: "显示范围", en: "Display range" },
  "orders.all_history": { zh: "全部历史", en: "All history" },
  "orders.current": { zh: "当前挂单", en: "Current orders" },
  "ctl.order_mode": { zh: "挂单显示", en: "Order Style" },
  "om.lifecycle": { zh: "生命周期", en: "Lifecycle" },
  "om.full": { zh: "铺满横屏", en: "Full-width" },
  "t.om_lifecycle": { zh: "每条挂单只在它自己的生命周期（创建 → 成交/撤销）区间内画线",
                      en: "Draw each order only over its own lifecycle (created → filled/canceled)" },
  "t.om_full": { zh: "把选中时刻仍在挂的订单画成贯穿整个横屏的水平线（红=卖 绿=买，虚线=最终未成交 实线=成交）",
                 en: "Draw orders live at the selected time as full-width horizontal lines (red=sell, green=buy; dotted=unfilled, solid=filled)" },
  "seg.off": { zh: "关", en: "Off" },
  "seg.on": { zh: "开", en: "On" },
  "ctl.indicators": { zh: "技术指标", en: "Indicators" },
  "ind.add": { zh: "+ 添加", en: "+ Add" },
  "ind.edit_hint": { zh: "（在 K 线图左上角图例里改颜色/周期/类型；布林带还可改中轨与倍数）",
                     en: "(edit color/period/type in the chart legend; bands also support basis and multiplier)" },
  "ind.thick": { zh: "粗", en: "W" },
  "ind.bb_opt": { zh: "布林带 (EMA)", en: "Bollinger (EMA)" },
  "ind.ed_type": { zh: "类型", en: "Type" },
  "ind.ed_basis": { zh: "中轨", en: "Basis" },
  "ind.ed_period": { zh: "周期", en: "Period" },
  "ind.ed_mult": { zh: "倍数σ", en: "Mult σ" },
  "ind.ed_color": { zh: "颜色", en: "Color" },
  "ind.ed_width": { zh: "粗细", en: "Width" },
  "ind.ed_done": { zh: "完成", en: "Done" },
  "ctl.order_colors": { zh: "挂单颜色", en: "Order Colors" },
  "side.buy": { zh: "买", en: "Buy" },
  "side.sell": { zh: "卖", en: "Sell" },
  "order_color.reset": { zh: "恢复默认", en: "Restore default" },
  "order_color.eyedropper": { zh: "从屏幕上取色", en: "Pick a colour from the screen" },
  "t.split_columns": { zh: "左右拖动改变图表与侧栏的宽度", en: "Drag left or right to resize charts and sidebar" },
  "ctl.snapshot": { zh: "历史状态快照", en: "State snapshot" },
  "t.snapshot": { zh: "开=显示右侧历史状态快照栏（选中时间的状态 + 活跃挂单）；关=隐藏，让 K 线占满",
                  en: "On = show the right state-snapshot panel (state at selected time + active orders); Off = hide it to widen the chart" },
  "pin.off": { zh: "未钉住（跟随鼠标）", en: "Not pinned (follow cursor)" },
  "pin.pinned": { zh: "已钉住 {0}", en: "Pinned {0}" },
  "pin.pinned_click": { zh: "已钉住 {0}（点击图表）", en: "Pinned {0} (click chart)" },
  "pin.playing": { zh: "播放中 {0}", en: "Playing {0}" },
  "t.pin_latest": { zh: "跳到最后一根 K 线并钉住，看当前挂单和仓位；缩放级别保持不变",
                    en: "Jump to the newest candle and pin there to read current orders and position; zoom is kept" },
  "t.pin": { zh: "把当前 hover 的时间钉住，鼠标离开不跳走；双击任一张图解除", en: "Pin the hovered time so it won't move when the cursor leaves; double-click any chart to release" },
  "t.fills_all": { zh: "主动 + 被动成交全显示", en: "Show both taker and maker fills" },
  "t.fills_taker": { zh: "只显示主动 / taker 成交（该账户主动发起的）", en: "Only taker fills (account-initiated)" },
  "t.fills_none": { zh: "不显示成交箭头，让主图只剩挂单线和 K 线——专心看他把单挂在哪儿的时候用",
                    en: "Hide the fill arrows so the chart is just candles and order lines - for when you are reading where he places orders" },
  "t.fill_arrow": { zh: "每根 K 线的成交画成箭头，一个不少；订单少时最清楚",
                    en: "Draw each candle's fills as arrows, every one of them; clearest when orders are few" },
  "t.fill_bubble": { zh: "每个订单画成一个圆，面积与大小成正比；买绿卖红，鼠标放上去看明细",
                     en: "Draw each order as a circle whose area follows its size; buys green, sells red, hover for details" },
  "t.fill_text_on": { zh: "箭头和气泡旁边写上方向、占账户百分比等文字", en: "Write side, share of account and more beside arrows and bubbles" },
  "t.fill_text_off": { zh: "只画箭头或气泡，不写文字", en: "Draw only the arrows or bubbles, without text" },
  "t.bubble_order": { zh: "每个订单一个圆，重叠也不合并；一个订单分几笔成交仍是一个圆",
                      en: "One circle per order, even where they overlap; an order filled in several pieces is still one circle" },
  "t.bubble_cluster": { zh: "重叠的买卖气泡按 BTC 数量抵消，显示剩余净方向和大小；净额为零时隐藏，合并后不超过半径上限",
                        en: "Overlapping buys and sells net by BTC quantity; show the remaining side and size, hide zero net quantity, and respect the radius cap" },
  "t.bubble_pos": { zh: "面积与成交额占成交当时账户价值的比例成正比", en: "Area follows the share of the account value at the time of the fill" },
  "t.bubble_usd": { zh: "面积与成交金额（美元）成正比", en: "Area follows the amount in US dollars" },
  "t.show_off": { zh: "只显示选中时刻仍活跃的挂单（默认）", en: "Only orders live at the selected time (default)" },
  "t.show_on": { zh: "一次性把所有订单按各自完整生命周期画在图上，与选中时刻无关——用来总览该账户的全部挂单分布",
                 en: "Draw every order over its full lifecycle, independent of the selected time — an overview of all orders" },
  "t.ind_type": { zh: "EMA 更贴近近期价格；SMA 是简单均线；布林带默认采用 EMA 中轨 ± σ 倍同周期指数加权标准差，添加后可在图例切换为经典 SMA 口径并修改倍数/周期",
                  en: "EMA weights recent prices more; SMA is a simple average; Bollinger defaults to an EMA mid-band ± σ times the same-period exponentially weighted deviation (switch to classic SMA basis or edit multiplier/period in the legend)" },
  "t.ind_period": { zh: "周期（多少根 K 线）", en: "Period (number of candles)" },
  "t.ind_add": { zh: "添加一个技术指标，可添加多个", en: "Add a technical indicator (multiple allowed)" },
  "t.ind_limit": { zh: "最多 {0} 个指标；删除一个后可继续添加", en: "Up to {0} indicators; remove one to add another" },
  "t.color_buy": { zh: "买单线颜色", en: "Buy order line color" },
  "t.color_sell": { zh: "卖单线颜色", en: "Sell order line color" },
  "t.collapse": { zh: "隐藏右侧历史状态快照栏（选中时间的状态 + 活跃挂单），让 K 线更宽",
                  en: "Hide the right state-snapshot panel (state at selected time + active orders) to widen the chart" },
  "t.lang": { zh: "Switch to English", en: "切换到中文" },
  "t.ind_color": { zh: "线颜色", en: "Line color" },
  "t.ind_width": { zh: "线粗细（1 最细 → 5 最粗）", en: "Line width (1 thinnest → 5 thickest)" },
  "t.ind_remove": { zh: "移除", en: "Remove" },
  "t.ind_toggle": { zh: "点眼睛：隐藏 / 显示这项指标", en: "Eye: hide / show this indicator" },
  "t.ind_edit": { zh: "点名字：修改这项指标（颜色 / 周期 / 类型或中轨 / 倍数 / 粗细）",
                  en: "Click the name to edit this indicator (color / period / type or basis / multiplier / width)" },
  "t.ind_del": { zh: "删除这条指标", en: "Delete this indicator" },
  "t.fullscreen": { zh: "全屏放大，只看 K 线（再点或按 Esc 退出）",
                    en: "Fullscreen — chart only (click again or press Esc to exit)" },
  "lang.btn": { zh: "EN", en: "中文" },
  "chart.symbol": { zh: "BTC", en: "BTC" },
  "chart.venue": { zh: "", en: "" },
  "chart.pnl": { zh: "累计盈亏", en: "Cumulative PnL" },
  "ctl.liquidation": { zh: "清算价", en: "Liquidation price" },
  "chart.liquidation": { zh: "清算价", en: "Liquidation price" },
  "t.liquidation": { zh: "所选 K 线、当前图表资产口径的理论归零价；不是交易所实际强平价",
    en: "Zero-equity price for the selected candle and this chart's asset scope; not the exchange liquidation threshold" },
  "ctl.cash_flows": { zh: "出入金记录", en: "Deposits & withdrawals" },
  "t.cash_flows": { zh: "在主图上用竖向虚线标出每一次入金和出金，写明金额和时间",
    en: "Mark every deposit and withdrawal on the price chart with a vertical dashed line, labelled with amount and time" },
  "cash.deposit": { zh: "入金 {0}", en: "Deposit {0}" },
  "cash.withdraw": { zh: "出金 {0}", en: "Withdrawal {0}" },
  "chart.pnl_detail": { zh: "（账户价值 − 累计净入金）", en: " (account value − net deposits)" },
  "chart.pnl_period_detail": { zh: "（权益变动 − 期间净入金）", en: " (equity change − net transfers)" },
  "chart.pnl_twr": { zh: "（TWR）", en: " (TWR)" },
  "t.pnl_usd": { zh: "美元本位：账户价值 − 累计入金。赚了多少钱",
                 en: "USD basis: account value minus cumulative deposits - how much money was made" },
  "t.pnl_period_usd": { zh: "美元本位：当前权益减起点权益，再扣除期间净转账", en: "USD basis: current equity minus start equity, excluding later net transfers" },
  "t.pnl_period_btc": { zh: "BTC 本位：当前权益折 BTC 减起点权益折 BTC，再扣除期间转账折 BTC", en: "BTC basis: current equity in BTC minus start equity in BTC, excluding later transfers in BTC" },
  "t.pnl_amount": { zh: "按当前 USD/BTC 本位显示盈亏数值曲线", en: "Show PnL values in the selected USD/BTC basis" },
  "t.pnl_percent": { zh: "按当前 USD/BTC 本位显示百分比收益率曲线", en: "Show the percentage return curve in the selected USD/BTC basis" },
  "t.pnl_btc": { zh: "BTC 本位：账户价值折成 BTC − 每笔入金按当时价折成的 BTC。回答\u201c不如当初直接买币拿着？\u201d",
                 en: "BTC basis: equity in BTC minus deposits converted to BTC at deposit time - did trading beat just holding?" },
  "t.split": { zh: "上下拖动改变两张图的高度",
               en: "Drag up or down to resize the two charts" },
  "chart.lev": { zh: "实际杠杆率 %（永续合约价值 / 账户价值，有方向）",
                 en: "Actual Leverage % (Perp Value / Account Value, signed)" },
  "panel.state": { zh: "选中时间的状态", en: "State at Selected Time" },
  "kv.time": { zh: "时间", en: "Time" },
  "kv.px": { zh: "BTC 价格 (close)", en: "BTC Price (close)" },
  "kv.pos": { zh: "永续合约仓位", en: "Perp Contract Position" },
  "kv.notional": { zh: "永续合约价值", en: "Perp Contract Value" },
  "kv.av_btc": { zh: "账户价值（BTC）", en: "Account Value (BTC)" },
  "kv.av": { zh: "账户价值（USD）", en: "Account Value (USD)" },
  "t.av_btc": { zh: "所选 K 线收盘时的账户权益，按同一根 K 线的 BTC 收盘价折算；不是 BTC 现货余额",
    en: "Account equity at the selected candle close, converted at that candle's BTC close price; not the BTC spot balance" },
  "kv.lev": { zh: "实际杠杆 (有方向)", en: "Actual Leverage (signed)" },
  "kv.pnl": { zh: "累计盈亏（USD）", en: "Cumulative PnL (USD)" },
  "kv.pnl_btc": { zh: "累计盈亏（BTC 本位）", en: "Cumulative PnL (BTC)" },
  "pnl.unit": { zh: "盈亏计价单位", en: "PnL unit" },
  "pnl.mode": { zh: "盈亏显示方式", en: "PnL display mode" },
  "pnl.amount": { zh: "金额", en: "Amount" },
  "pnl.percentage": { zh: "百分比", en: "Percentage" },
  "pnl.start_short": { zh: "起点", en: "Start" },
  "pnl.start_current": { zh: "当前起点", en: "Current start" },
  "pnl.start_loading": { zh: "读取中…", en: "Loading…" },
  "pnl.start_account_origin": { zh: "（账户起点）", en: " (account start)" },
  "pnl.start_selected": { zh: "选中 K 线", en: "Selected candle" },
  "pnl.status_pick": { zh: "请点选上方 K 线图中的一根 K 线作为收益起点；仅生效一次，打开起点菜单或按 Esc 可取消。",
    en: "Click a candle in the chart above to set the start once; open the start menu or press Esc to cancel." },
  "pnl.status_loading": { zh: "正在读取起点数据…", en: "Loading start data…" },
  "pnl.status_unavailable": { zh: "所选位置没有可用 K 线、有效 BTC 价格或正值账户权益；起点未改变。",
    en: "No usable candle, valid BTC price or positive account equity is available here; start unchanged." },
  "pnl.status_account_start": { zh: "所选时间早于账户开始，已选用账户起点。",
    en: "The selected time precedes the account; account start selected." },
  "pnl.status_error": { zh: "起点数据加载失败；起点未改变。", en: "Could not load start data; start unchanged." },
  "pnl.before_start": { zh: "起点之前", en: "Before start" },
  "ol.unfilled": { zh: "未成交挂单不透明度", en: "Unfilled order opacity" },
  "ol.filled": { zh: "成交挂单不透明度", en: "Filled order opacity" },
  "t.filled_alpha": { zh: "已成交挂单线的不透明度，不影响成交箭头或气泡", en: "Filled order line opacity, independent of fill arrows and bubbles" },
  "t.unfilled_alpha": {
    zh: "未成交挂单线（虚线）画多浓。未成交的单通常远多于成交的，调淡能让成交过的线显出来；想看挂过哪些单就调回去",
    en: "How strongly unfilled order lines (dotted) are drawn. Unfilled orders usually far outnumber filled ones, so fading them lets the filled ones show; turn it back up to study what was placed",
  },
  "panel.orders": { zh: "活跃订单（收盘仍在挂 + 本 K 线内成交）", en: "Active Orders (live at close + filled within candle)" },
  "orders.meta": {
    zh: '百分比 = 名义价值 / 当时账户价值。已成交订单按实际成交量与成交均价计算；仍在挂的订单按原始下单量与委托价计算。图上箭头合计的是该根 K 线的成交，同一分钟多张订单会合并显示。列表包含 K 线收盘时仍在挂的订单，以及该 K 线内完成的成交订单（包括零生命周期主动单）；含 <code>crossed=true</code> 成交的订单会额外标为“主动 Taker”。每条订单的最终命运用 badge 标出：'
      + '<span class="badge ok">成交</span> / <span class="badge open">在挂</span> / <span class="badge canceled">撤销</span>。'
      + '点表头排序（再点切换升/降，新点的列成为第一优先级，其余降为次级）。默认：买单在上、卖单在下，组内价格从低到高。 ',
    en: 'Percent = notional / account value at that time. Filled orders use executed size and average price; live orders use original size and limit price. A chart arrow totals fills within its candle, so multiple orders in one minute share an arrow. The list includes orders still live at candle close and filled orders completed within that candle (including zero-lifetime taker orders); an order with any <code>crossed=true</code> fill gets an additional “Taker” badge. Each order\'s final fate is tagged: '
      + '<span class="badge ok">Filled</span> / <span class="badge open">Open</span> / <span class="badge canceled">Canceled</span>. '
      + 'Click a header to sort (click again to flip; the clicked column becomes the primary key, the rest demote). Default: buys on top, sells below, price low→high. ' },
  "th.side": { zh: "方向", en: "Side" },
  "th.price": { zh: "价格", en: "Price" },
  "th.sz": { zh: "BTC数量", en: "BTC Size" },
  "th.notional": { zh: "价值", en: "Notional" },
  "th.pct": { zh: "占账户%", en: "% of Acct" },
  "th.created": { zh: "创建", en: "Created" },
  "orders.empty": { zh: "该根 K 线收盘时没有活跃订单，且区间内没有成交订单。", en: "No live orders at candle close or filled orders within this candle." },
  "tbl.buy": { zh: "买 Long", en: "Buy" },
  "tbl.sell": { zh: "卖 Short", en: "Sell" },
  "tbl.execution_price": { zh: "最终成交均价（事后结果）", en: "Final average execution price (retrospective)" },
  "tbl.limit_price": { zh: "委托限价", en: "Order limit price" },
  "tbl.trigger_price": { zh: "触发价", en: "Trigger price" },
  "tbl.missing_fills": { zh: "成交明细不完整，无法核验成交均价与实际成交额", en: "Incomplete fills; execution price and notional unavailable" },
  "tbl.no_execution": { zh: "委托价，非经核验成交均价", en: "Order price, not a verified execution average" },
  "badge.filled": { zh: "成交", en: "Filled" },
  "badge.open": { zh: "在挂", en: "Open" },
  "badge.canceled": { zh: "撤销", en: "Canceled" },
  "badge.taker": { zh: "主动 Taker", en: "Taker" },
  "mark.taker": { zh: "（主动）", en: " (taker)" },
  "bubble.buy": { zh: "买", en: "Buy" },
  "bubble.sell": { zh: "卖", en: "Sell" },
  "bubble.orders": { zh: "{0} 单", en: "{0} orders" },
  "bubble.orders_long": { zh: "{0} 个订单 · ", en: "{0} orders · " },
  "bubble.candles": { zh: "（{0} 根 K 线）", en: " ({0} candles)" },
  "bubble.amount": { zh: "金额 {0}（账户 {1}）", en: "Amount {0} ({1} of account)" },
  "bubble.net_amount": { zh: "净成交 {0} BTC · 净金额 {1}（账户 {2}）", en: "Net {0} BTC · net amount {1} ({2} of account)" },
  "bubble.avg": { zh: "均价 {0} · 成交价 {1} – {2}", en: "Avg {0} · fills {1} – {2}" },
  "bubble.liq_counterparty": { zh: "对手方强制平仓", en: "Counterparty forced liquidation" },
  "bubble.liq_self": { zh: "本账户强制平仓", en: "This account's forced liquidation" },
  "footer.summary": { zh: "关于数据 / 指标说明", en: "About the data / metrics" },
  "footer.pnl_start": {
    zh: '<strong>收益起点可以任意选择</strong>：在盈亏图的“起点”菜单选择“选中 K 线”，再点选任意有可用数据、有效价格和正值账户权益的历史 K 线。',
    en: '<strong>You can choose any return start</strong>: choose “Selected candle” in the PnL chart\'s “Start” menu, then select any historical candle with available data, a valid price and positive account equity.' },
  "footer.li3": {
    zh: '<strong>重建仓位</strong>由 <code>fills</code> 逐条累加而来：<code>B</code> 增加多头、<code>A</code> 减少多头（变空头）。',
    en: '<strong>Reconstructed position</strong> is summed from <code>fills</code>: <code>B</code> adds long, <code>A</code> reduces (goes short).' },
  "footer.li5": {
    zh: '<strong>订单占账户百分比</strong>= 名义价值 / 当时账户价值，<em>不是</em>占当前持仓的百分比。已成交订单按实际成交额计算；仍在挂的订单按委托价计算。',
    en: '<strong>Order % of account</strong> = notional / account value at that time, <em>not</em> a percent of the current position. Filled orders use actual executions; live orders use their limit price.' },
  "footer.li8": {
    zh: '主图挂单线有两种<strong>显示形态</strong>（控制栏"挂单显示"切换）：<strong>生命周期</strong> = 每条挂单按自己真实的区间（创建 → 成交/撤销）分段画，仍在挂的延伸到"现在"；<strong>铺满横屏</strong> = 把十字线/选中时刻仍在挂的订单画成贯穿整个横屏的水平线（十字线移到哪，就显示当时在挂的单）。两种形态线型一致：<strong>实线</strong> = 最终成交，<strong>点线</strong> = 未成交（撤销或仍在挂）。',
    en: 'Main-chart order lines have two <strong>display styles</strong> (the "Order Style" toggle): <strong>Lifecycle</strong> draws each order over its real interval (created → filled/canceled), still-open ones reaching "now"; <strong>Full-width</strong> draws orders live at the crosshair/selected time as horizontal lines spanning the whole chart (move the crosshair to see what was live then). In both, <strong>solid</strong> = eventually filled, <strong>dotted</strong> = unfilled (canceled or still open).' },
  "footer.li9": {
    zh: '<strong>挂单显示范围</strong>：默认"当前挂单"，显示选中时刻的挂单；"全部历史"使用"生命周期"形态，把所有订单按各自真实生命周期画在主图上，与选中时刻无关，用来总览历史挂单的价格分布。',
    en: '<strong>Order display range</strong>: Current orders (default) shows orders at the selected time. All history uses Lifecycle style to draw every order over its real lifecycle, independent of the selected time, for an overview of historical order prices.' },
  "footer.ack": {
    zh: '图表引擎：Lightweight Charts by <a href="https://www.tradingview.com/" target="_blank" rel="noopener" title="TradingView Lightweight Charts™ · Copyright © 2025 TradingView, Inc. · Apache 2.0">TradingView</a>',
    en: 'Charting engine: Lightweight Charts by <a href="https://www.tradingview.com/" target="_blank" rel="noopener" title="TradingView Lightweight Charts™ · Copyright © 2025 TradingView, Inc. · Apache 2.0">TradingView</a>' },
  "err.load": {
    zh: '加载数据失败：{0}<br>请通过 HTTP 访问此页面——直接用 file:// 打开时，浏览器通常会拒绝读取页面的数据文件。',
    en: 'Failed to load data: {0}<br>Serve this page over HTTP — opening it via file:// usually blocks reading its data files.' },
};

const I18N = { ...CORE_I18N, ...globalThis.TradeVizSite?.i18n };

function t(key, ...args) {
  const e = I18N[key];
  let s = e ? (e[state.lang] || e.zh || key) : key;
  args.forEach((a, i) => { s = s.split("{" + i + "}").join(a); });
  return s;
}

function applyStaticI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll("[data-i18n-html]").forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll("[data-i18n-title]").forEach(el => { el.title = t(el.dataset.i18nTitle); });
  root.querySelectorAll("[data-i18n-aria-label]").forEach(el => { el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel)); });
  root.querySelectorAll("[data-i18n-label]").forEach(el => { el.dataset.label = t(el.dataset.i18nLabel); });
  syncFormControls(root);
  renderFillIntentHelp();
}

function renderPlayButton() {
  if (!els.btnPlay) return;
  const playing = Boolean(state.playTimer);
  els.btnPlay.querySelector('[data-replay-icon="play"]')?.toggleAttribute("hidden", playing);
  els.btnPlay.querySelector('[data-replay-icon="pause"]')?.toggleAttribute("hidden", !playing);
  const label = t(playing ? "t.pause" : "t.play");
  els.btnPlay.title = label;
  els.btnPlay.setAttribute("aria-label", label);
  els.btnPlay.setAttribute("aria-pressed", String(playing));
}

function beginChartTouchTracking() {
  if (!state.pinned) return;
  if (state.playTimer) stopPlay();
  state.pinned = false;
  renderPinState();
  updateOverlayMarker();
}

function endChartTouchTracking() {
  for (const pane of chartPanes()) {
    try { pane.chart?.clearCrosshairPosition(); } catch (e) { }
  }
  if (!state.pinned && state.timeline?.bars?.length) {
    state.selectedT = state.timeline.bars.at(-1).t;
    renderForSelected();
  }
}
function renderPinState(messageKey) {
  if (els.btnPin) els.btnPin.classList.toggle("active", Boolean(state.pinned));
  setCrosshairMode(state.pinned ? LWC.CrosshairMode.Hidden : LWC.CrosshairMode.Magnet);
  if (!els.pinState) return;
  if (messageKey) els.pinState.textContent = t(messageKey, fmtTs(state.selectedT));
  else if (state.playTimer) els.pinState.textContent = t("pin.playing", fmtTs(state.selectedT));
  else if (state.pinned) els.pinState.textContent = t("pin.pinned", fmtTs(state.selectedT));
  else els.pinState.textContent = t("pin.off");
}

function applyLang() {
  if (_indEditor) closeIndicatorEditor();
  document.documentElement.lang = state.lang === "en" ? "en" : "zh-CN";
  document.title = t("app.title");
  applyStaticI18n();
  updateOrdersSortIndicators();
  if (state.summary) renderSummaryCards();
  if (state.timeline && state.timeline.bars) {
    renderForSelected();
    applyFillMarkers();
  }
  renderIndicatorLegend();
  renderPinState();
  renderChartSymbol();
  renderPlayButton();
  renderPnlHeading();
  renderPnlStartStatus();
  const lb = $("btn-lang");
  if (lb) lb.textContent = t("lang.btn");
}

function setLang(lang) {
  state.lang = (lang === "en") ? "en" : "zh";
  persistLang();
  applyLang();
}

function persistLang() {
  const stored = loadPrefs();
  stored.lang = state.lang;
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(stored)); } catch (e) { }
}

let _prefsReady = false;
let pendingInitialInterval = null;
let initialTimelineReady = false;

const PREF_CONTROLS = [
  { key: "showLiquidation", id: "chk-liquidation",   kind: "checkbox", event: "change" },
  { key: "showCashFlows", id: "chk-cash-flows",       kind: "checkbox", event: "change" },
  { key: "interval",      id: "seg-interval",         kind: "seg" },
  { key: "chartType",     id: "seg-chart-type",       kind: "seg" },
  { key: "playSpeed",     id: "play-speed",           kind: "select",   event: null },
  { key: "showFuture",    id: "chk-show-future",      kind: "checkbox", event: "change" },
  { key: "fillMarkers",   id: "seg-fills-filter",     kind: "fillScope", event: "change" },
  { key: "intentThresholdPct", id: "fill-intent-threshold", kind: "percent", event: "change" },
  { key: "fillStyle",     id: "seg-fill-style",       kind: "seg" },
  { key: "fillText",      id: "seg-fill-text",        kind: "seg" },
  { key: "bubbleGroup",   id: "seg-bubble-group",     kind: "seg" },
  { key: "bubbleSize",    id: "seg-bubble-size",      kind: "seg" },
  { key: "orderMode",     id: "seg-order-mode",       kind: "seg" },
  { key: "showAllOrders", id: "seg-show-all",         kind: "seg" },
  { key: "pnlUnit",       id: "seg-pnl-unit",         kind: "seg" },
  { key: "pnlPercent",    id: "seg-pnl-mode",         kind: "segBool" },
  { key: "snapshot",      id: "seg-snapshot",         kind: "seg" },
  { key: "colorBuy",      id: "order-color-buy",      kind: "color",    event: "input" },
  { key: "colorSell",     id: "order-color-sell",     kind: "color",    event: "input" },
  { key: "unfilledAlpha", id: "order-unfilled-alpha", kind: "range",    event: "input" },
  { key: "filledAlpha", id: "order-filled-alpha", kind: "range", event: "input" },
  { key: "indType",       id: "ind-type",             kind: "select",   event: null },
  { key: "indPeriod",     id: "ind-period",           kind: "number",   event: null },
  ...(globalThis.TradeVizSite?.prefControls ?? []),
];

const segButtons = (id) => { const el = $(id); return el ? [...el.querySelectorAll("button")] : []; };

function readPref(control) {
  const el = $(control.id);
  if (!el) return undefined;
  if (control.kind === "seg") return el.querySelector("button.active[data-val]")?.dataset.val;
  if (control.kind === "segBool") return el.querySelector("button.active[data-val]")?.dataset.val === "percentage";
  if (control.kind === "checkbox") return el.checked;
  if (control.kind === "fillScope") {
    const taker = el.querySelector('[data-fill-role="taker"]').checked;
    const maker = el.querySelector('[data-fill-role="maker"]').checked;
    return taker ? (maker ? "all" : "taker") : (maker ? "maker" : "none");
  }
  return el.value;
}

function isValidPref(control, value) {
  const el = $(control.id);
  if (!el) return false;
  switch (control.kind) {
    case "seg": return segButtons(control.id).some((b) => b.dataset.val === value);
    case "select": return [...el.options].some((o) => o.value === value);
    case "checkbox": case "segBool": return typeof value === "boolean";
    case "fillScope": return ["all", "taker", "maker", "none"].includes(value);
    case "color": return typeof value === "string" && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value);
    case "percent": return (typeof value === "number" || typeof value === "string" && value.trim() !== "")
      && Number.isFinite(Number(value)) && Number(value) >= 0;
    case "range": case "number": {
      const n = Number(value);
      return Number.isFinite(n) && n >= Number(el.min) && n <= Number(el.max);
    }
    default: return false;
  }
}

function applyPref(control, value) {
  const el = $(control.id);
  if (!el) return;
  if (control.kind === "seg" || control.kind === "segBool") {
    const selected = control.kind === "segBool" ? (value ? "percentage" : "amount") : value;
    const target = segButtons(control.id).find((b) => b.dataset.val === selected);
    if (target && !target.classList.contains("active")) target.click();
    return;
  }
  if (control.kind === "fillScope") {
    for (const checkbox of el.querySelectorAll("[data-fill-role]")) {
      checkbox.checked = value === "all" || value === checkbox.dataset.fillRole;
    }
  } else if (control.kind === "checkbox") {
    if (el.checked === value) return;
    el.checked = value;
  } else {
    if (el.value === String(value)) return;
    el.value = String(value);
  }
  el._syncFormControl?.();
  if (control.event) el.dispatchEvent(new Event(control.event, { bubbles: true }));
}

function renderFillIntentHelp() {
  const control = PREF_CONTROLS.find(pref => pref.key === "intentThresholdPct");
  const input = $(control.id);
  if (!input) return;
  const value = isValidPref(control, input.value) ? Number(input.value) : state.intentThresholdPct;
  $("fill-intent-help").textContent = t("fills.threshold_help", value);
}

function loadPrefs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    return (parsed && typeof parsed === "object") ? parsed : {};
  } catch (e) { return {}; }
}

function persistPrefField(key, value) {
  const stored = loadPrefs();
  stored[key] = value;
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(stored)); } catch (e) { }
}

const IND_TYPES = ["ema", "sma", "bb"];
const MAX_INDICATORS = 12;

function serializeIndicators() {
  return state.indicators.map((ind) => {
    const out = { type: ind.type, period: ind.period, color: ind.color,
                  widthLevel: ind.widthLevel, hidden: Boolean(ind.hidden) };
    if (ind.type === "bb") { out.basis = ind.basis; out.mult = ind.mult; }
    return out;
  });
}

function validIndicatorConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return false;
  if (!IND_TYPES.includes(cfg.type)) return false;
  if (!Number.isInteger(cfg.period) || cfg.period < 1 || cfg.period > 1000) return false;
  if (!Number.isInteger(cfg.widthLevel) || cfg.widthLevel < 1 || cfg.widthLevel > 5) return false;
  if (typeof cfg.color !== "string" || !/^#[0-9a-f]{6}$/i.test(cfg.color)) return false;
  if (cfg.type !== "bb") return true;
  return (cfg.basis === "ema" || cfg.basis === "sma")
    && Number.isFinite(cfg.mult) && cfg.mult > 0 && cfg.mult <= 10;
}

function restoreIndicators(list) {
  if (!Array.isArray(list) || !list.length) return;
  for (const cfg of list) {
    if (state.indicators.length >= MAX_INDICATORS) break;
    if (!validIndicatorConfig(cfg)) continue;
    _indColorIdx += 1;
    const ind = {
      id: _indColorIdx + "-" + cfg.period + "-" + cfg.type + "-" + state.indicators.length,
      type: cfg.type, period: cfg.period, color: cfg.color,
      widthLevel: cfg.widthLevel, hidden: Boolean(cfg.hidden), series: null,
    };
    if (cfg.type === "bb") { ind.basis = cfg.basis; ind.mult = cfg.mult; ind.upSeries = null; ind.lowSeries = null; }
    state.indicators.push(ind);
  }
  refreshIndicatorData();
  renderIndicatorLegend();
}

function savePrefs() {
  const out = {};
  for (const control of PREF_CONTROLS) {
    const value = readPref(control);
    if (value !== undefined) out[control.key] = value;
  }
  out.lang = state.lang;
  out.indicators = serializeIndicators();
  if (state.pnlStart && state.pnlStart.source !== "default") {
    out.pnlStart = {
      interval: state.pnlStart.interval,
      candleOpenT: state.pnlStart.bar.t,
      requestedT: state.pnlStart.requestedT,
      source: state.pnlStart.source,
    };
  }
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(out)); } catch (e) { }
}

function applyStoredInterval() {
  const control = PREF_CONTROLS.find((c) => c.key === "interval");
  const stored = loadPrefs().interval;
  if (!isValidPref(control, stored) || stored === state.interval) return;
  state.interval = stored;
  segButtons(control.id).forEach((b) => b.classList.toggle("active", b.dataset.val === stored));
}

function applyStoredPrefs() {
  const stored = loadPrefs();
  const allowed = new Set([...PREF_CONTROLS.map((control) => control.key),
    "lang", "indicators", "pnlStart"]);
  const clean = Object.fromEntries(Object.entries(stored)
    .filter(([key]) => allowed.has(key)));
  if ("indicators" in clean) {
    if (Array.isArray(clean.indicators)) {
      clean.indicators = clean.indicators.filter(validIndicatorConfig).slice(0, MAX_INDICATORS);
    } else {
      delete clean.indicators;
    }
  }
  if (JSON.stringify(clean) !== JSON.stringify(stored)) {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(clean)); } catch (e) { }
  }
  const siteDefaults = globalThis.TradeVizSite?.defaultPrefs ?? {};
  for (const control of PREF_CONTROLS) {
    if (control.key === "interval") continue;
    for (const source of [stored, siteDefaults]) {
      if (!(control.key in source)) continue;
      if (!isValidPref(control, source[control.key])) continue;
      applyPref(control, source[control.key]);
      break;
    }
  }
  restoreIndicators(clean.indicators);
}

let defaultPnlStartPromise;
let pnlStartRequestVersion = 0;
function defaultPnlStart() {
  if (!defaultPnlStartPromise) {
    defaultPnlStartPromise = (async () => {
      const getDefault = globalThis.TradeVizData?.getDefaultPnlStart;
      const exported = state.summary?.pnl_default_start;
      const bar = typeof getDefault === "function" ? await getDefault()
        : validPnlBaseline(exported) ? exported
          : (await loadJson("timeline_1h")).bars.find(validPnlBaseline);
      const start = bar ? {
        requestedT: bar.T, bar, source: "default", interval: bar.interval || "1h",
        origin: bar.origin ?? { kind: "first_record", time: bar.T },
      } : null;
      state.pnlDefaultStart = start;
      return start;
    })().catch((error) => {
      defaultPnlStartPromise = null;
      throw error;
    });
  }
  return defaultPnlStartPromise;
}

async function restorePnlStartPreference() {
  const version = pnlStartRequestVersion;
  const defaultPromise = defaultPnlStart().catch((error) => {
    console.error(error);
    return null;
  });
  const saved = loadPrefs().pnlStart;
  let start = null;
  if (saved && ["minute", "selected"].includes(saved.source)
      && Number.isSafeInteger(saved.candleOpenT)
      && Number.isSafeInteger(saved.requestedT)
      && ["1m", "3m", "5m", "15m", "1h", "4h", "1d", "1w"].includes(saved.interval)) {
    try {
      const resolve = globalThis.TradeVizData?.getPnlStartAt;
      const bar = typeof resolve === "function"
        ? await resolve(saved.candleOpenT, saved.interval)
        : resolvePnlStartBar((await loadJson("timeline_" + saved.interval)).bars,
          saved.candleOpenT);
      if (validPnlBaseline(bar) && bar.t === saved.candleOpenT
          && bar.T >= saved.requestedT) {
        start = { requestedT: saved.requestedT, bar,
          source: saved.source, interval: saved.interval };
      }
    } catch (error) { console.error(error); }
  }
  const defaultStart = await defaultPromise;
  if (!start) start = defaultStart;
  if (version === pnlStartRequestVersion) setPnlStart(start, { preservePicking: true });
}

function markPrefsReady() {
  _prefsReady = true;
  updateIndicatorAddButton();
}

function fmtTs(ms) {
  if (!ms && ms !== 0) return "—";
  const d = new Date(ms);
  return d.getUTCFullYear() + "-"
    + String(d.getUTCMonth() + 1).padStart(2, "0") + "-"
    + String(d.getUTCDate()).padStart(2, "0") + " "
    + String(d.getUTCHours()).padStart(2, "0") + ":"
    + String(d.getUTCMinutes()).padStart(2, "0") + "Z";
}

function fmtTsShort(ms) {
  if (!ms && ms !== 0) return "—";
  const d = new Date(ms);
  const p = n => String(n).padStart(2, "0");
  return `<span>${String(d.getUTCFullYear()).slice(2)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}</span>`
    + ` <span>${p(d.getUTCHours())}:${p(d.getUTCMinutes())}</span>`;
}

function fmtUsd(x, decimals = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  const sign = x < 0 ? "-" : "";
  const abs = Math.abs(x);
  return sign + "$" + abs.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function priceOhlcSnapshot(bars, index) {
  if (!Array.isArray(bars) || index < 0 || index >= bars.length) return null;
  const bar = bars[index];
  if (![bar.o, bar.h, bar.l, bar.c].every(Number.isFinite)) return null;
  const previousClose = index > 0 && Number.isFinite(bars[index - 1]?.c)
    ? bars[index - 1].c : null;
  const change = previousClose === null ? null : bar.c - previousClose;
  const changePct = previousClose === null || previousClose === 0
    ? null : change / previousClose * 100;
  const direction = (value) => value > 0 ? "up" : value < 0 ? "down" : "flat";
  return {
    o: bar.o, h: bar.h, l: bar.l, c: bar.c,
    change, changePct,
    candleDirection: direction(bar.c - bar.o),
    changeDirection: change === null ? "flat" : direction(change),
  };
}

function fmtChartPrice(value) {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtSignedChartValue(value, suffix = "") {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return sign + Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + suffix;
}

function renderPriceOhlc(bars, index) {
  const root = els.priceOhlc;
  if (!root) return;
  const values = root.querySelector('[data-role="values"]');
  const change = root.querySelector('[data-role="change"]');
  if (!values || !change) return;
  const priceNodes = [
    ["open", "o"],
    ["high", "h"],
    ["low", "l"],
    ["close", "c"],
  ].map(([role, key]) => [values.querySelector(`[data-role="${role}"]`), key]);
  if (priceNodes.some(([node]) => !node)) return;
  const snapshot = priceOhlcSnapshot(bars, index);
  if (!snapshot) {
    for (const [node] of priceNodes) {
      node.textContent = "—";
      node.className = "price-ohlc-number flat";
    }
    change.textContent = "— (—)";
    change.className = "flat";
    return;
  }
  for (const [node, key] of priceNodes) {
    node.textContent = fmtChartPrice(snapshot[key]);
    node.className = `price-ohlc-number ${snapshot.candleDirection}`;
  }
  change.textContent = snapshot.change === null
    ? "— (—)"
    : `${fmtSignedChartValue(snapshot.change)} (${fmtSignedChartValue(snapshot.changePct, "%")})`;
  change.className = snapshot.changeDirection;
}

function fmtUsdCompact(x) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  const sign = x < 0 ? "-" : "";
  const abs = Math.abs(x);
  if (abs >= 1e6) return sign + "$" + (abs / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return sign + "$" + (abs / 1e3).toFixed(0) + "K";
  return sign + "$" + abs.toFixed(0);
}

function pnlUnitSpec() {
  return state.pnlUnit === "btc"
    ? {
        axis: (v) => (v >= 0 ? "" : "-") + Math.abs(v).toFixed(2) + "₿",
        text: (v) => (v >= 0 ? "+" : "-") + Math.abs(v).toFixed(4) + " BTC",
        minMove: 0.01,
      }
    : {
        axis: fmtUsdCompact,
        text: (v) => fmtUsd(v, 0),
        minMove: 1,
      };
}

function validPnlBaseline(bar) {
  return Boolean(bar && Number.isFinite(bar.T) && Number.isFinite(bar.av) && bar.av > 0
    && Number.isFinite(bar.c) && bar.c > 0
    && Number.isFinite(bar.dep) && Number.isFinite(bar.dep_btc));
}

function pnlStartForSelection(bar, expectedOpenT, interval, accountStart) {
  if (!Number.isFinite(expectedOpenT)) return null;
  const matched = bar?.t === expectedOpenT;
  const closeT = matched ? bar.T : expectedOpenT + (INTERVAL_MS[interval] || 60_000) - 1;
  const originT = accountStart?.origin?.time ?? accountStart?.bar.T;
  if (Number.isFinite(closeT) && Number.isFinite(originT) && closeT < originT
      && validPnlBaseline(accountStart?.bar)) return accountStart;
  return matched && validPnlBaseline(bar)
    ? { requestedT: bar.T, bar, source: "selected", interval } : null;
}

function resolvePnlStartBar(bars, requestedT) {
  if (!Array.isArray(bars) || !Number.isFinite(requestedT)) return null;
  const minuteT = Math.floor(requestedT / 60_000) * 60_000;
  const index = bisectLeq(bars, minuteT, "t");
  const bar = index < 0 ? null : bars[index];
  return validPnlBaseline(bar) && bar.t === minuteT ? bar : null;
}

function pnlSnapshot(bar, baseline = null) {
  const empty = { usd: null, btc: null, usdReturn: null, btcReturn: null };
  if (!bar || (baseline && bar.T < baseline.T)) return empty;
  if (baseline) {
    if (!validPnlBaseline(baseline) || !Number.isFinite(bar.av)
      || !Number.isFinite(bar.c) || bar.c <= 0
      || !Number.isFinite(bar.dep) || !Number.isFinite(bar.dep_btc)) return empty;
    const startBtc = baseline.av / baseline.c;
    const usd = bar.T === baseline.T ? 0
      : (bar.av - baseline.av) - (bar.dep - baseline.dep);
    const btc = bar.T === baseline.T ? 0
      : (bar.av / bar.c - startBtc) - (bar.dep_btc - baseline.dep_btc);
    const periodReturn = (field) => {
      if (Number.isFinite(baseline[field]) && baseline[field] > 0
          && Number.isFinite(bar[field])) return bar.T === baseline.T ? 0 : bar[field] / baseline[field] - 1;
      return null;
    };
    return {
      usd, btc,
      usdReturn: periodReturn("twr_usd"),
      btcReturn: periodReturn("twr_btc"),
    };
  }
  const usd = Number.isFinite(bar.pnl) ? bar.pnl : null;
  const btc = Number.isFinite(bar.pnl_btc) ? bar.pnl_btc : null;
  return {
    usd, btc,
    usdReturn: Number.isFinite(bar.twr_usd) ? bar.twr_usd - 1 : null,
    btcReturn: Number.isFinite(bar.twr_btc) ? bar.twr_btc - 1 : null,
  };
}

function pnlChartValue(bar) {
  return pnlSnapshot(bar, state.pnlStart?.bar)[state.pnlUnit + (state.pnlPercent ? "Return" : "")];
}

function pnlChartPoint(bar) {
  const time = Math.floor(bar.t / 1000);
  const value = pnlChartValue(bar);
  return value === null && (state.pnlStart || state.pnlPercent)
    ? { time } : { time, value: value === null ? 0 : value };
}

function fmtReturnAxis(value) {
  return (value * 100).toFixed(1) + "%";
}

function fmtReturn(value) {
  return value === null ? "—" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function fmtPnlStartUtc(ms, seconds = false) {
  const iso = new Date(ms).toISOString();
  return iso.slice(0, seconds ? 19 : 16).replace("T", " ") + "Z";
}

function renderPnlHeading() {
  const key = state.pnlPercent ? "chart.pnl_twr"
    : state.pnlStart && state.pnlStart.source !== "default" ? "chart.pnl_period_detail" : "chart.pnl_detail";
  $("pnl-title").textContent = t("chart.pnl");
  $("pnl-detail").textContent = t(key);
  $("pnl-tag").title = t("chart.pnl") + t(key);
}

function bindPnlResponsiveHeader() {
  const head = document.querySelector(".pane-pnl .chart-head");
  const width = (element) => element.getBoundingClientRect().width;
  const mode = $("seg-pnl-mode");
  const fullButtons = [...mode.querySelectorAll("button[data-val]")];
  const toggle = $("btn-pnl-percent-toggle");
  const start = $("pnl-start");
  const fullTime = $("pnl-start-summary");
  const shortTime = $("pnl-start-short");
  const update = () => {
    const axisWidth = pnlChart.priceScale("right").width() || pnlChart.options().rightPriceScale.minimumWidth;
    head.style.setProperty("--pnl-axis-width", `${axisWidth}px`);
    head.classList.toggle("pnl-toolbar-tight", width(head) < 300);
    const style = getComputedStyle(head);
    const available = width(head) -
      parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const modeStyle = getComputedStyle(mode);
    const border = parseFloat(modeStyle.borderLeftWidth) + parseFloat(modeStyle.borderRightWidth);
    const fullModeWidth = fullButtons.reduce((sum, button) => sum + width(button), border);
    const shortModeWidth = width(toggle) + border;
    const startExtras = width(start) - width(start.querySelector(".pnl-start-value"));
    const fixed = width($("pnl-title")) + width($("seg-pnl-unit")) + startExtras + parseFloat(style.columnGap) * 3;
    const compactMode = matchMedia("(max-width: 700px)").matches || fixed + fullModeWidth + width(fullTime) > available;
    const modeWidth = compactMode ? shortModeWidth : fullModeWidth;
    const compactDate = fixed + modeWidth + width(fullTime) > available;
    const required = fixed + modeWidth + width(compactDate ? shortTime : fullTime);
    head.classList.toggle("pnl-mode-compact", compactMode);
    head.classList.toggle("pnl-date-compact", compactDate);
    head.classList.toggle("pnl-detail-hidden", (compactMode && state.pnlPercent) || required + width($("pnl-detail")) > available);
    positionPnlStartMenu();
  };
  let frame = null;
  const scheduleUpdate = () => {
    if (frame !== null) return;
    frame = requestAnimationFrame(() => { frame = null; update(); });
  };
  const observer = new ResizeObserver(scheduleUpdate);
  observer.observe($("chart-pnl").querySelector("canvas"));
  for (const element of [head, $("pnl-title"), $("pnl-detail"), $("seg-pnl-unit"),
    ...fullButtons, toggle, start, fullTime, shortTime]) observer.observe(element);
  update();
}

function positionPnlStartMenu() {
  if (!els.pnlStartMenu.open) return;
  const popup = els.pnlStartMenu.querySelector(".pnl-start-menu-content");
  const viewport = window.visualViewport;
  const left = (viewport?.offsetLeft ?? 0) + 8;
  const top = (viewport?.offsetTop ?? 0) + 8;
  const width = Math.max(1, (viewport?.width ?? innerWidth) - 16);
  const height = Math.max(1, (viewport?.height ?? innerHeight) - 16);
  popup.style.maxWidth = `${Math.min(280, width)}px`;
  popup.style.maxHeight = `${height}px`;
  popup.style.transform = "none";
  const anchor = els.pnlStartTrigger.getBoundingClientRect();
  const rect = popup.getBoundingClientRect();
  const above = anchor.top - 4 - rect.height;
  const preferredTop = above >= top ? above : anchor.bottom + 4;
  const x = Math.max(left, Math.min(anchor.right - rect.width, left + width - rect.width));
  const y = Math.max(top, Math.min(preferredTop, top + height - rect.height));
  popup.style.transform = `translate(${Math.round(x) - rect.left}px, ${Math.round(y) - rect.top}px)`;
}

function renderPnlStartStatus(key = null) {
  const messageKey = key || (state.pnlStartPicking ? "pnl.status_pick" : null);
  els.pnlStartStatus.hidden = !messageKey;
  els.pnlStartStatus.textContent = messageKey ? t(messageKey) : "";
  const defaultStart = state.pnlDefaultStart;
  const originTime = defaultStart?.origin?.time ?? defaultStart?.bar.T;
  els.pnlDefaultLabel.textContent = t("pnl.start_account_origin");
  els.pnlDefaultTime.textContent = originTime === undefined
    ? t("pnl.start_loading") : fmtPnlStartUtc(originTime, true);
  if (originTime !== undefined) els.pnlDefaultTime.dateTime = new Date(originTime).toISOString();
  els.pnlStartClear.disabled = !defaultStart;
  els.pnlStartClear.setAttribute("aria-pressed", String(state.pnlStart?.source === "default"));
  const shownTime = state.pnlStart?.source === "default" ? originTime : state.pnlStart?.requestedT;
  els.pnlStartSummary.textContent = shownTime === undefined
    ? t("pnl.start_loading") : fmtPnlStartUtc(shownTime);
  $("pnl-start-short").textContent = shownTime === undefined
    ? t("pnl.start_loading") : fmtPnlStartUtc(shownTime).slice(0, 10) + "…";
  const fullLabel = shownTime === undefined ? t("pnl.start_loading") : fmtPnlStartUtc(shownTime, true);
  els.pnlStartTrigger.title = fullLabel;
  els.pnlStartTrigger.setAttribute("aria-label", `${t("pnl.start_short")} ${fullLabel}`);
  $("pnl-current-start").hidden = !state.pnlStart || state.pnlStart.source === "default";
  $("pnl-current-time").textContent = fullLabel;
  if (shownTime !== undefined) $("pnl-current-time").dateTime = new Date(shownTime).toISOString();
  if (shownTime !== undefined) els.pnlStartSummary.dateTime = new Date(shownTime).toISOString();
  for (const button of $("seg-pnl-unit").querySelectorAll("button[data-val]")) {
    const titleKey = state.pnlStart ? "t.pnl_period_" + button.dataset.val : "t.pnl_" + button.dataset.val;
    button.dataset.i18nTitle = titleKey;
    button.title = t(titleKey);
  }
  positionPnlStartMenu();
}

function setPnlStartPicking(enabled) {
  state.pnlStartPicking = enabled;
  els.pnlStartSelected.setAttribute("aria-pressed", String(enabled));
  els.pnlStartTrigger.classList.toggle("picking", enabled);
  renderPnlStartStatus();
}

function setPnlStart(start, { preservePicking = false } = {}) {
  state.pnlStart = start;
  if (preservePicking && state.pnlStartPicking) renderPnlStartStatus();
  else setPnlStartPicking(false);
  applyPnlSeries();
  renderForSelected();
  updateOverlayMarker();
  if (_prefsReady) savePrefs();
}
function fmtBtc(x, decimals = 5) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  return x.toFixed(decimals);
}

function fmtLev(x) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  return (x * 100).toFixed(2) + "%";
}

function levColor(lev) {
  if (lev === null || lev === undefined || Number.isNaN(lev)) return "";
  if (lev < -0.0005) return "red";
  if (lev > 1) return "yellow";
  if (lev > 0.0005) return "green";
  return "";
}

function levBarColor(lev) {
  if (lev < -0.000001) return "#ef5350";
  if (lev > 1) return "#d4ac00";
  return "#26a69a";
}

function bisectLeq(arr, ts, key = "t") {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid][key] <= ts) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

async function loadJson(name) {
  const direct = globalThis.TradeVizData?.getExport;
  if (typeof direct === "function") return direct(name);
  const base = globalThis.TradeVizSite?.exportBase ?? "../data/export/";
  const r = await fetch(`${base}${name}.json`, { cache: "no-store" });
  if (!r.ok) throw new Error(`加载 ${name}.json 失败: HTTP ${r.status}`);
  return r.json();
}

async function loadAll() {
  const [summary, orders, fills] = await Promise.all([
    loadJson("summary"),
    loadJson("orders"),
    loadJson("fills"),
  ]);
  state.summary = summary;
  state.orders = orders;
  state.fills = fills;
  state._allOrderSegments = null;
}

async function loadTimeline(interval, { beforeCommit } = {}) {
  const version = state.timelineVersion;
  const tl = await loadJson(`timeline_${interval}`);
  if (state.timelineBusy || state.interval !== interval || state.timelineVersion !== version) return false;
  beforeCommit?.(tl);
  state.timeline = tl;
  return true;
}

function logicalTime(bars, index, step) {
  const last = bars.length - 1;
  if (index <= 0) return bars[0].t + index * step;
  if (index >= last) return bars[last].t + (index - last) * step;
  const i = Math.floor(index);
  return bars[i].t + (bars[i + 1].t - bars[i].t) * (index - i);
}

function timeLogical(bars, time, step) {
  const last = bars.length - 1;
  if (time <= bars[0].t) return (time - bars[0].t) / step;
  if (time >= bars[last].t) return last + (time - bars[last].t) / step;
  const i = bisectLeq(bars, time);
  return i + (time - bars[i].t) / (bars[i + 1].t - bars[i].t);
}

function captureTimeView() {
  const bars = state.timeline?.bars;
  const range = priceChart?.timeScale().getVisibleLogicalRange();
  if (!bars?.length || !range) return null;
  const emptyRange = archivePlaceholderVisibleRange();
  if (emptyRange) {
    return { ...emptyRange, selectedT: state.selectedT, pinned: state.pinned };
  }
  const step = INTERVAL_MS[state.timeline.interval];
  return { from: logicalTime(bars, range.from, step), to: logicalTime(bars, range.to, step),
    selectedT: state.selectedT, pinned: state.pinned };
}

function restoreTimeView(view, { render = true } = {}) {
  const bars = state.timeline.bars;
  const step = INTERVAL_MS[state.interval];
  state.selectedT = view.selectedT ?? bars[Math.max(0, bisectLeq(bars, (view.from + view.to) / 2))].t;
  state.pinned = view.pinned;
  if (archivePlaceholder) {
    const from = Math.floor(view.from / 1000), to = Math.floor(view.to / 1000);
    if (Number.isFinite(archivePlaceholder.firstTime) && Number.isFinite(archivePlaceholder.lastTime) &&
        (to < archivePlaceholder.firstTime || from > archivePlaceholder.lastTime)) {
      setArchivePlaceholder(state.interval, view.from, view.to);
    }
    priceChart.timeScale().setVisibleRange({
      from: Number.isFinite(archivePlaceholder.firstTime) ? Math.max(from, archivePlaceholder.firstTime) : from,
      to: Number.isFinite(archivePlaceholder.lastTime) ? Math.min(to, archivePlaceholder.lastTime) : to,
    });
  } else {
    const range = { from: timeLogical(bars, view.from, step), to: timeLogical(bars, view.to, step) };
    for (const { chart } of chartPanes()) chart.timeScale().setVisibleLogicalRange(range);
  }
  if (render) {
    renderForSelected();
    renderPinState();
    updateOverlayMarker();
  }
}

function viewAnchorTime(view) {
  if (view?.pinned && Number.isFinite(view.selectedT)) return view.selectedT;
  if (Number.isFinite(view?.from) && Number.isFinite(view?.to)) {
    return (view.from + view.to) / 2;
  }
  if (Number.isFinite(view?.selectedT)) return view.selectedT;
  return null;
}

function defaultSpanBars(interval) {
  return Math.min(DEFAULT_SPAN_MAX_BARS, Math.round(DEFAULT_SPAN_MS / INTERVAL_MS[interval]));
}

function boundedTimeView(view, interval, shownStep = null) {
  if (!view || !INTERVAL_MS[interval]) return view;
  if (!Number.isFinite(view.from) || !Number.isFinite(view.to)) return view;
  const step = INTERVAL_MS[interval];
  const maxSpan = MAX_VISIBLE_BARS * step;
  if (view.to - view.from > maxSpan) {
    const anchor = viewAnchorTime(view) ?? (view.from + view.to) / 2;
    return { ...view, from: anchor - maxSpan / 2, to: anchor + maxSpan / 2 };
  }
  const shown = shownStep > 0 ? (view.to - view.from) / shownStep : Infinity;
  const minSpan = Math.ceil(Math.min(defaultSpanBars(interval), shown)) * step;
  if (!(minSpan > 0) || view.to - view.from >= minSpan) return view;
  return { ...view, from: view.to - minSpan };
}

async function prepareTimelineArchive(interval, view) {
  const ensure = globalThis.TradeVizData?.ensureCandleRange;
  const bounded = boundedTimeView(view, interval);
  if (
    typeof ensure !== "function" ||
    !Number.isFinite(bounded?.from) ||
    !Number.isFinite(bounded?.to)
  ) {
    return { changed: false, available: true };
  }
  return await ensure(interval, {
    from: bounded.from,
    to: bounded.to,
    beforeBars: PREFETCH_BUFFER_BARS,
    afterBars: PREFETCH_BUFFER_BARS,
  });
}

async function switchTimeline(interval) {
  if (!initialTimelineReady) {
    pendingInitialInterval = interval;
    persistPrefField("interval", interval);
    els.segInterval.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("active", button.dataset.val === interval);
    });
    els.intervalLoading.hidden = false;
    els.segInterval.setAttribute("aria-busy", "true");
    return;
  }
  if (state.timelineBusy || interval === state.interval) return;
  state.timelineBusy = true;
  state.timelineVersion++;
  const buttons = els.segInterval.querySelectorAll("button");
  buttons.forEach((button) => { button.disabled = true; });
  const previous = {interval: state.interval, timeline: state.timeline};
  let view = null;
  let switched = false;
  els.intervalLoading.hidden = false;
  els.segInterval.setAttribute("aria-busy", "true");
  try {
    stopPlay();
    await candleRangeLoadPromise;
    view = boundedTimeView(captureTimeView(), interval, INTERVAL_MS[state.interval]);
    await prepareTimelineArchive(interval, view);
    let timeline = await loadJson(`timeline_${interval}`);
    const latestView = boundedTimeView(captureTimeView(), interval, INTERVAL_MS[state.interval]);
    const prepared = await prepareTimelineArchive(interval, latestView);
    if (prepared.changed) timeline = await loadJson(`timeline_${interval}`);
    if (timeline.interval !== interval || !timeline.bars?.length) throw new Error("Invalid candle timeline");
    view = latestView;
    state.interval = interval;
    state.timeline = timeline;
    applyTimelineToCharts(view, {
      archivePlaceholder: !prepared.available
        ? { interval, from: view.from, to: view.to }
        : null,
    });
    globalThis.TradeVizData?.retainActiveTimeline?.(interval);
    switched = true;
  } catch (error) {
    if (state.timeline !== previous.timeline) {
      state.interval = previous.interval;
      state.timeline = previous.timeline;
      applyTimelineToCharts(view);
    }
    console.error("[chart] Interval switch failed", error);
  } finally {
    state.timelineBusy = false;
    els.intervalLoading.hidden = true;
    els.segInterval.setAttribute("aria-busy", "false");
    buttons.forEach((button) => {
      button.disabled = false;
      button.classList.toggle("active", button.dataset.val === state.interval);
    });
    if (switched && state.interval === interval) {
      if (_prefsReady) savePrefs();
      else persistPrefField("interval", interval);
    }
  }
}

function renderSummaryCards() {
  const s = state.summary;
  if (!s) return;
  if (s.title) {
    document.title = s.title;
    const heading = document.querySelector("header h1");
    if (heading) heading.textContent = s.title;
  }
  const siteCards = globalThis.TradeVizSite?.renderSummaryCards;
  if (siteCards) {
    siteCards(s);
    return;
  }
  els.hyperbotLink.href = s.hyperbot_url;
  els.hyperbotLink.textContent = s.target_user;

  const ch = s.clearinghouse;
  els.cardAv.textContent = fmtUsd(ch.account_total_value);
  els.cardAvSource.textContent = `${t("card.av_source")} ${fmtTs(ch.account_total_as_of)}`;

  const pos = ch.btc_position || {};
  const szi = pos.szi;
  els.cardPos.textContent = (szi === null || szi === undefined)
    ? "—" : `${fmtBtc(szi)} BTC`;
  els.cardPos.classList.toggle("green", szi > 0);
  els.cardPos.classList.toggle("red", szi < 0);
  const pv = ch.position_value != null ? `${t("pos.perp")} ${fmtUsd(ch.position_value, 0)}` : "";
  els.cardPosSide.textContent = szi === 0 ? t("pos.flat") : pv;

  const lev = ch.btc_leverage_signed;
  els.cardLev.textContent = fmtLev(lev);
  els.cardLev.classList.remove("green", "red", "yellow");
  const levCls = levColor(lev);
  if (levCls) els.cardLev.classList.add(levCls);

  if (!globalThis.TradeVizData?.paintFreshness?.()) {
    const lu = s.latest_update;
    els.cardUpdate.textContent = fmtTs(lu.finished_at || lu.started_at);
    els.cardUpdateDetail.textContent = lu.success ? t("update.ok") : t("update.bad");
  }
}

let priceChart, priceSeries, volumeSeries;
let priceLineSeries;
let liquidationLine = null, selectedLiquidationPrice = null;
let levChart, levSeries;
let pnlChart, pnlSeries;
let resetTimeRangeInput = () => {};
let archivePlaceholderSeries = [];
let archivePlaceholder = null;
let orderLinesPrimitive = null;
let orderHoverPrimitive = null;
let priceMarker = null;
let levMarker = null;
let pnlMarker = null;
let resetPnlVerticalPan = () => {};
const verticalPans = { price: null, lev: null, pnl: null };
let pnlScaleBasis = null;

function archivePlaceholderData(interval, from, to) {
  const step = INTERVAL_MS[interval];
  if (!step || !Number.isFinite(from) || !Number.isFinite(to) || to < from) return [];
  let start = Math.floor(from / step) * step;
  let end = Math.ceil(to / step) * step;
  const count = Math.floor((end - start) / step) + 1;
  if (count > MAX_VISIBLE_BARS) {
    const center = (start + end) / 2;
    start = Math.floor((center - (MAX_VISIBLE_BARS / 2) * step) / step) * step;
    end = start + (MAX_VISIBLE_BARS - 1) * step;
  }
  return Array.from({ length: Math.floor((end - start) / step) + 1 }, (_, index) => ({
    time: start / 1000 + index * step / 1000,
  }));
}

function setArchivePlaceholder(interval, from, to) {
  const key = `${interval}:${from}:${to}`;
  if (archivePlaceholder?.key === key) return;
  const points = archivePlaceholderData(interval, from, to);
  if (!points.length || archivePlaceholderSeries.length !== 3) return;
  archivePlaceholderSeries.forEach((series) => series.setData(points));
  archivePlaceholder = { key, interval, from, to, firstTime: points[0].time, lastTime: points.at(-1).time };
}

function clearArchivePlaceholder() {
  if (!archivePlaceholder) return;
  archivePlaceholderSeries.forEach((series) => series.setData([]));
  archivePlaceholder = null;
}

function chartTimeMs(time) {
  if (Number.isFinite(time)) return Number(time) * 1000;
  if (time && Number.isInteger(time.year) && Number.isInteger(time.month) && Number.isInteger(time.day)) {
    return Date.UTC(time.year, time.month - 1, time.day);
  }
  return NaN;
}

function archivePlaceholderVisibleRange() {
  if (!archivePlaceholder || !priceChart?.timeScale) return null;
  const range = priceChart.timeScale().getVisibleRange();
  const from = chartTimeMs(range?.from);
  const to = chartTimeMs(range?.to);
  return Number.isFinite(from) && Number.isFinite(to) ? { from, to } : null;
}

function chartPanes() {
  return [
    { key: "price", chart: priceChart, series: priceSeries },
    { key: "lev", chart: levChart, series: levSeries },
    { key: "pnl", chart: pnlChart, series: pnlSeries },
  ];
}

function panPriceRange(range, deltaY, height) {
  if (!Number.isFinite(deltaY) || !Number.isFinite(height) || height <= 0) return range;
  const shift = (range.maxValue - range.minValue) * deltaY / height;
  return { minValue: range.minValue + shift, maxValue: range.maxValue + shift };
}

function zoomPriceRange(range, factor, anchor) {
  if (!(factor > 0) || !Number.isFinite(anchor) || !(range.maxValue > range.minValue)) return range;
  return { minValue: anchor - (anchor - range.minValue) * factor, maxValue: anchor + (range.maxValue - anchor) * factor };
}
const PRICE_WHEEL_ZOOM_RATE = Math.LN2 / 600;

function bindVerticalPan(element, chart, series, { plotPan = true } = {}) {
  let offsetRange = null;
  let relativeOffset = 0;
  let drag = null;
  const refreshScale = () => series.applyOptions({
    autoscaleInfoProvider: (original) => {
      const info = original();
      if (!info) return info;
      const range = info.priceRange;
      if (offsetRange) return { ...info, priceRange: offsetRange };
      if (!range || !relativeOffset) return info;
      const shift = (range.maxValue - range.minValue) * relativeOffset;
      return { ...info, priceRange: { minValue: range.minValue + shift, maxValue: range.maxValue + shift } };
    },
  });
  refreshScale();
  const scale = chart.priceScale("right");
  const reset = () => {
    drag = null;
    offsetRange = null;
    relativeOffset = 0;
    refreshScale();
    scale.applyOptions({ autoScale: true });
  };

  element.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.pointerType === "touch") return;
    const rect = element.getBoundingClientRect();
    if (event.clientX >= rect.right - scale.width()) {
      offsetRange = null;
      relativeOffset = 0;
      refreshScale();
    }
  }, true);

  element.addEventListener("wheel", (event) => {
    const rect = element.getBoundingClientRect();
    if (event.clientX < rect.right - scale.width() || event.clientX >= rect.right
        || event.clientY < rect.top || event.clientY >= rect.bottom) return;
    event.preventDefault();
    event.stopPropagation();
    const height = element.querySelector("canvas")?.clientHeight || rect.height;
    let base = offsetRange;
    if (!base) {
      const top = series.coordinateToPrice(0);
      const bottom = series.coordinateToPrice(height);
      if (!Number.isFinite(top) || !Number.isFinite(bottom) || top <= bottom) return;
      const margins = scale.options().scaleMargins;
      const span = top - bottom;
      base = { minValue: bottom + span * margins.bottom, maxValue: top - span * margins.top };
    }
    const perLine = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
    const factor = Math.min(2, Math.max(0.5, Math.exp(event.deltaY * perLine * PRICE_WHEEL_ZOOM_RATE)));
    const under = series.coordinateToPrice(event.clientY - rect.top);
    offsetRange = zoomPriceRange(base, factor, Number.isFinite(under) ? under : (base.minValue + base.maxValue) / 2);
    relativeOffset = 0;
    drag = null;
    if (!scale.options().autoScale) scale.applyOptions({ autoScale: true });
    refreshScale();
  }, { capture: true, passive: false });

  element.addEventListener("pointerdown", (event) => {
    if (!plotPan || event.pointerType === "touch") return;
    const rect = element.getBoundingClientRect();
    const plotWidth = rect.width - scale.width();
    if (event.button !== 0 || event.clientX < rect.left || event.clientX >= rect.left + plotWidth ||
        event.clientY < rect.top || event.clientY >= rect.bottom) return;
    const height = element.querySelector("canvas")?.clientHeight || rect.height;
    const top = series.coordinateToPrice(0);
    const bottom = series.coordinateToPrice(height);
    if (!Number.isFinite(top) || !Number.isFinite(bottom) || top <= bottom) return;
    const margins = scale.options().scaleMargins;
    const span = top - bottom;
    const wasAutoScale = scale.options().autoScale;
    drag = { pointerId: event.pointerId, y: event.clientY, height, fixed: !wasAutoScale || offsetRange !== null,
      range: { minValue: bottom + span * margins.bottom,
               maxValue: top - span * margins.top } };
    if (!wasAutoScale) {
      offsetRange = drag.range;
      scale.applyOptions({ autoScale: true });
      refreshScale();
    }
  });
  window.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if ((event.buttons & 1) === 0) { drag = null; return; }
    if (event.clientY === drag.y) return;
    if (drag.fixed) {
      offsetRange = panPriceRange(drag.range, event.clientY - drag.y, drag.height);
    } else {
      relativeOffset += (event.clientY - drag.y) / drag.height;
      drag.y = event.clientY;
    }
    refreshScale();
  });
  window.addEventListener("pointerup", (event) => {
    if (drag?.pointerId === event.pointerId) drag = null;
  });
  window.addEventListener("pointercancel", (event) => {
    if (drag?.pointerId === event.pointerId) drag = null;
  });
  element.addEventListener("dblclick", (event) => {
    const rect = element.getBoundingClientRect();
    if (event.clientX < rect.right - chart.priceScale("right").width()) return;
    reset();
  });
  return { reset, panned: () => offsetRange !== null || relativeOffset !== 0, fixedRange: () => offsetRange };
}

const themeColor = (name, fallback) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
if (new URLSearchParams(globalThis.location?.search ?? "").get("theme") === "dark") {
  document.documentElement.dataset.theme = "dark";
}

function makeCharts() {
  const common = {
    autoSize: false,
    layout: {
      background: { color: themeColor("--chart-bg", "#161b22") },
      textColor: themeColor("--chart-text", "#cdd9e5"),
      fontSize: 10,
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: themeColor("--chart-grid", "#222a35") },
      horzLines: { color: themeColor("--chart-grid", "#222a35") },
    },
    rightPriceScale: { borderColor: themeColor("--chart-border", "#2a323d"), minimumWidth: 84 },
    timeScale: {
      borderColor: themeColor("--chart-border", "#2a323d"),
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 6,
      minBarSpacing: boundedMinBarSpacing($("chart-price")?.clientWidth || 2500),
    },
    crosshair: {
      mode: 1,
    },
    trackingMode: {
      exitMode: LWC.TrackingModeExitMode.OnNextTap,
    },
    handleScroll: {
      mouseWheel: false,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    },
    handleScale: {
      mouseWheel: true,
      pinch: true,
      axisPressedMouseMove: true,
      axisDoubleClickReset: true,
    },
  };

  priceChart = LWC.createChart($("chart-price"), {
    ...common,
    timeScale: { ...common.timeScale, visible: true },
  });
  priceLineSeries = priceChart.addLineSeries({
    color: "#4fc3e8", lineWidth: 2, visible: false,
    lastValueVisible: false, priceLineVisible: false, autoscaleInfoProvider: () => null,
  });
  priceSeries = priceChart.addCandlestickSeries({
    upColor: "#26a69a",
    downColor: "#ef5350",
    borderUpColor: "#26a69a",
    borderDownColor: "#ef5350",
    wickUpColor: "#26a69a",
    wickDownColor: "#ef5350",
  });
  orderLinesPrimitive = makeOrderLinesPrimitive();
  priceSeries.attachPrimitive(orderLinesPrimitive);
  priceMarker = makeMarkerPrimitive();
  priceSeries.attachPrimitive(priceMarker);
  priceSeries.attachPrimitive(makeBubblePrimitive());
  priceSeries.attachPrimitive(makeCashFlowPrimitive());
  orderHoverPrimitive = makeOrderHoverPrimitive();
  priceSeries.attachPrimitive(orderHoverPrimitive);
  applyChartType();
  volumeSeries = priceChart.addHistogramSeries({
    priceFormat: { type: "volume" },
    priceScaleId: "",
  });
  volumeSeries.priceScale().applyOptions({
    scaleMargins: { top: 0.8, bottom: 0.0 },
  });

  levChart = LWC.createChart($("chart-lev"), {
    ...common,
    timeScale: { ...common.timeScale, visible: false },
    rightPriceScale: {
      ...common.rightPriceScale,
    },
    handleScroll: { ...common.handleScroll },
    handleScale: {
      axisPressedMouseMove: { time: false, price: true },
      axisDoubleClickReset: { time: false, price: true },
      mouseWheel: true,
      pinch: true,
    },
  });
  pnlChart = LWC.createChart($("chart-pnl"), {
    ...common,
    timeScale: { ...common.timeScale, visible: false },
    handleScroll: { ...common.handleScroll },
    handleScale: {
      axisPressedMouseMove: { time: false, price: true },
      axisDoubleClickReset: { time: false, price: true },
      mouseWheel: true,
      pinch: true,
    },
  });
  pnlSeries = pnlChart.addBaselineSeries({
    baseValue: { type: "price", price: 0 },
    topLineColor: "#26a69a",
    topFillColor1: "rgba(38, 166, 154, 0.28)",
    topFillColor2: "rgba(38, 166, 154, 0.02)",
    bottomLineColor: "#ef5350",
    bottomFillColor1: "rgba(239, 83, 80, 0.02)",
    bottomFillColor2: "rgba(239, 83, 80, 0.28)",
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false,
    priceFormat: { type: "custom", formatter: (v) => pnlUnitSpec().axis(v), minMove: 1 },
  });
  pnlSeries.priceScale().applyOptions({ scaleMargins: { top: 0.12, bottom: 0.08 } });
  pnlMarker = makeMarkerPrimitive();
  pnlSeries.attachPrimitive(pnlMarker);

  window.priceChart = priceChart;
  window.levChart = levChart;
  window.pnlChart = pnlChart;
  window.priceSeries = priceSeries;
  window.priceMarker = () => priceMarker && priceMarker.getMarker();
  window.levMarker = () => levMarker && levMarker.getMarker();

  levSeries = levChart.addHistogramSeries({
    base: 0,
    lastValueVisible: false,
    priceLineVisible: false,
    priceFormat: {
      type: "custom",
      formatter: (v) => (v * 100).toFixed(0) + "%",
      minMove: 0.01,
    },
  });
  levSeries.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.05 } });
  verticalPans.lev = bindVerticalPan($("chart-lev"), levChart, levSeries);
  verticalPans.pnl = bindVerticalPan($("chart-pnl"), pnlChart, pnlSeries);
  resetPnlVerticalPan = verticalPans.pnl.reset;
  verticalPans.price = bindVerticalPan($("chart-price"), priceChart, priceSeries, { plotPan: false });
  levMarker = makeMarkerPrimitive();
  levSeries.attachPrimitive(levMarker);

  const placeholderOptions = {
    visible: false,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
  };
  archivePlaceholderSeries = [priceChart, levChart, pnlChart].map(
    (chart) => chart.addLineSeries({ ...placeholderOptions }),
  );

  const SYNC_EPSILON = 0.01;
  let syncingRange = false;
  let timeInput = null;
  let timeInputPointer = null;
  let timeInputRelease = null;
  let timeInputEnding = false;
  const syncRange = (target, range) => {
    if (syncingRange || !range) return;
    const current = target.timeScale().getVisibleLogicalRange();
    if (current &&
        Math.abs(current.from - range.from) < SYNC_EPSILON &&
        Math.abs(current.to - range.to) < SYNC_EPSILON) return;
    syncingRange = true;
    try {
      target.timeScale().setVisibleLogicalRange(range);
    } finally {
      syncingRange = false;
    }
  };
  const mirrorPriceRange = (range) => {
    if (!range) return;
    syncRange(levChart, range);
    syncRange(pnlChart, range);
    scheduleCandleRangeLoad(range);
  };
  const finishTimeInput = () => {
    timeInputEnding = true;
    if (timeInputRelease !== null) clearTimeout(timeInputRelease);
    timeInputRelease = setTimeout(() => {
      timeInputRelease = null;
      timeInput = null;
      timeInputPointer = null;
      timeInputEnding = false;
      mirrorPriceRange(priceChart.timeScale().getVisibleLogicalRange());
    }, 180);
  };
  resetTimeRangeInput = () => {
    if (timeInputRelease !== null) clearTimeout(timeInputRelease);
    timeInputRelease = null;
    timeInput = null;
    timeInputPointer = null;
    timeInputEnding = false;
  };
  for (const { key } of chartPanes()) {
    const element = $("chart-" + key);
    element.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      resetTimeRangeInput();
      timeInput = key;
      timeInputPointer = event.pointerId;
    }, true);
    element.addEventListener("wheel", () => {
      resetTimeRangeInput();
      timeInput = key;
      finishTimeInput();
    }, { capture: true, passive: true });
  }
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest("#chart-price, #chart-lev, #chart-pnl")) resetTimeRangeInput();
  }, true);
  window.addEventListener("pointerup", (event) => {
    if (event.pointerId === timeInputPointer) finishTimeInput();
  });
  window.addEventListener("pointercancel", (event) => {
    if (event.pointerId === timeInputPointer) finishTimeInput();
  });

  priceChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
    if (timeInput && timeInput !== "price") return;
    mirrorPriceRange(range);
    if (timeInput === "price" && timeInputEnding) finishTimeInput();
  });
  for (const { key, chart } of chartPanes().slice(1)) {
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (timeInput !== key || !range) return;
      syncRange(priceChart, range);
      const settled = priceChart.timeScale().getVisibleLogicalRange();
      if (!settled) return;
      for (const other of chartPanes().slice(1)) {
        if (other.key !== key) syncRange(other.chart, settled);
      }
      scheduleCandleRangeLoad(settled);
      if (timeInputEnding) finishTimeInput();
    });
  }
  priceChart.subscribeCrosshairMove((param) => onCrosshair(param, "price"));
  priceChart.subscribeCrosshairMove(showFillTooltip);
  const priceEl = $("chart-price");
  for (const type of ["pointermove", "pointerdown"]) {
    priceEl.addEventListener(type, (event) => { chartPointerType = event.pointerType; }, { passive: true });
  }
  priceEl.addEventListener("pointerleave", () => setOrderHover(null, "chart"));
  priceChart.subscribeCrosshairMove(onChartHover);
  levChart.subscribeCrosshairMove((param) => onCrosshair(param, "lev"));
  pnlChart.subscribeCrosshairMove((param) => onCrosshair(param, "pnl"));

  function resize() {
    for (const [chart, id] of [[priceChart, "chart-price"], [levChart, "chart-lev"], [pnlChart, "chart-pnl"]]) {
      const el = $(id);
      if (el.clientWidth > 0 && el.clientHeight > 0) chart.resize(el.clientWidth, el.clientHeight);
    }
    const width = $("chart-price").clientWidth;
    if (width > 0) {
      const minBarSpacing = boundedMinBarSpacing(width);
      for (const pane of chartPanes()) pane.chart.timeScale().applyOptions({ minBarSpacing });
    }
  }
  const resizeObserver = new ResizeObserver(resize);
  for (const id of ["chart-price", "chart-lev", "chart-pnl"]) resizeObserver.observe($(id));
  window.addEventListener("resize", resize);
  resize();
}

function applyPnlSeries({ preserveScale = false } = {}) {
  const bars = state.timeline && state.timeline.bars;
  if (!bars || !bars.length) return;
  const spec = pnlUnitSpec();
  const start = state.pnlStart?.bar;
  const basis = JSON.stringify([state.pnlUnit, state.pnlPercent,
    start?.T, start?.av, start?.c, start?.dep, start?.dep_btc]);
  const basisChanged = basis !== pnlScaleBasis;
  if (basisChanged) {
    resetPnlVerticalPan();
    pnlScaleBasis = basis;
  }
  pnlSeries.setData(bars.map(pnlChartPoint));
  pnlSeries.applyOptions({
    priceFormat: { type: "custom", formatter: state.pnlPercent ? fmtReturnAxis : spec.axis,
      minMove: state.pnlPercent ? 0.0001 : spec.minMove },
  });
  if (!preserveScale || basisChanged) {
    pnlChart.priceScale("right").applyOptions({ autoScale: true });
  }
  renderPnlHeading();
}

const DEFAULT_SPAN_MS = 9 * 30 * 24 * 60 * 60 * 1000;
const DEFAULT_SPAN_MAX_BARS = 2000;
const MIN_BAR_SPACING = 0.05;
const MAX_VISIBLE_BARS = 10_000;
const PREFETCH_BUFFER_BARS = 10_000;
const PREFETCH_EDGE_BARS = 3_000;

function boundedMinBarSpacing(width) {
  return Math.max(MIN_BAR_SPACING, Math.max(0, width) / MAX_VISIBLE_BARS);
}
const INTERVAL_MS = {
  "1m": 60000,
  "3m": 180000,
  "5m": 300000,
  "15m": 900000,
  "1h": 3600000,
  "4h": 14400000,
  "1d": 86400000,
  "1w": 604800000,
};

let candleRangeLoadTimer = null;
let candleRangeLoading = false;
let candleRangeLoadPromise = null;

let chartViewSettling = false;
let chartViewGeneration = 0;
const chartViewWaiting = [];
function settleChartView() {
  const generation = ++chartViewGeneration;
  chartViewSettling = true;
  requestAnimationFrame(() => {
    if (generation !== chartViewGeneration) return;
    chartViewSettling = false;
    for (const run of chartViewWaiting.splice(0)) run();
  });
}
function afterChartViewSettles(run) {
  if (chartViewSettling) chartViewWaiting.push(run);
  else run();
}
function subscribeChartClick(chart, handler) {
  chart.subscribeClick((param) => {
    if (!chartViewSettling || !param?.point) { handler(param); return; }
    chartViewWaiting.push(() => handler({ ...param, time: chart.timeScale().coordinateToTime(param.point.x) ?? undefined }));
  });
}

function scheduleCandleRangeLoad(range) {
  if (
    state.timelineBusy || candleRangeLoading ||
    !range || !state.timeline?.bars?.length
  ) {
    return;
  }
  const last = state.timeline.bars.length - 1;
  if (
    !archivePlaceholder &&
    range.from > PREFETCH_EDGE_BARS &&
    range.to < last - PREFETCH_EDGE_BARS
  ) return;
  if (candleRangeLoadTimer !== null) clearTimeout(candleRangeLoadTimer);
  if (state.playTimer) {
    candleRangeLoadTimer = null;
    return loadCandleRange(range);
  }
  candleRangeLoadTimer = setTimeout(() => {
    candleRangeLoadTimer = null;
    void loadCandleRange(range);
  }, 150);
}

async function loadCandleRange(range, timeRange = null) {
  if (candleRangeLoading) return candleRangeLoadPromise;
  const ensure = globalThis.TradeVizData?.ensureCandleRange;
  if (typeof ensure !== "function" || state.timelineBusy) return null;
  const currentRange = typeof priceChart !== "undefined" && priceChart?.timeScale
    ? priceChart.timeScale().getVisibleLogicalRange() : range;
  if ((!currentRange && !timeRange) || !state.timeline?.bars?.length) return null;
  const bars = state.timeline.bars;
  const placeholderRange = archivePlaceholderVisibleRange();
  const from = timeRange?.from ?? placeholderRange?.from ??
    logicalTime(bars, currentRange.from, INTERVAL_MS[state.interval]);
  const to = timeRange?.to ?? placeholderRange?.to ??
    logicalTime(bars, currentRange.to, INTERVAL_MS[state.interval]);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  candleRangeLoading = true;
  let completeRangeLoad;
  candleRangeLoadPromise = new Promise(resolve => { completeRangeLoad = resolve; });
  const version = state.timelineVersion;
  const interval = state.interval;
  try {
    const result = await ensure(interval, {
      from, to, beforeBars: PREFETCH_BUFFER_BARS, afterBars: PREFETCH_BUFFER_BARS,
    });
    if (state.interval !== interval || state.timelineVersion !== version) return null;
    if (!result.available) {
      applyTimelineToCharts(captureTimeView(), {
        archivePlaceholder: { interval, from: result.from, to: result.to },
        preserveVerticalScale: true,
      });
      return result;
    }
    if (result.changed || archivePlaceholder) {
      const timeline = result.changed ? await loadJson(`timeline_${interval}`) : state.timeline;
      if (state.interval !== interval || state.timelineVersion !== version) return;
      const view = captureTimeView();
      state.timeline = timeline;
      applyTimelineToCharts(view, { archivePlaceholder: null, preserveVerticalScale: true });
    }
    return result;
  } catch (error) {
    console.error("[chart] Candle archive range load failed", error);
    return null;
  } finally {
    candleRangeLoading = false;
    completeRangeLoad();
    candleRangeLoadPromise = null;
  }
}

function defaultVisibleBars(bars) {
  const step = INTERVAL_MS[state.interval];
  if (!step || !bars || !bars.length) return Math.min(150, (bars && bars.length) || 150);
  return Math.min(bars.length, defaultSpanBars(state.interval));
}

function applyTimelineToCharts(view = null, options = {}) {
  resetTimeRangeInput();
  const bars = state.timeline.bars;
  if (!bars || !bars.length) return;
  const candleData = bars.map(b => ({
    time: Math.floor(b.t / 1000),
    open: b.o, high: b.h, low: b.l, close: b.c,
  }));
  const volData = bars.map(b => ({
    time: Math.floor(b.t / 1000),
    value: b.v,
    color: b.c >= b.o ? "rgba(38,166,154,0.4)" : "rgba(239,83,80,0.4)",
  }));
  const levData = bars.map(b => {
    const lev = (b.lev !== null && b.lev !== undefined) ? b.lev : 0;
    return { time: Math.floor(b.t / 1000), value: lev, color: levBarColor(lev) };
  });

  priceSeries.setData(candleData);
  syncChartTypeData();
  volumeSeries.setData(volData);
  levSeries.setData(levData);
  applyPnlSeries({ preserveScale: Boolean(options.preserveVerticalScale) });
  if (options.archivePlaceholder === null) clearArchivePlaceholder();
  if (options.archivePlaceholder) {
    setArchivePlaceholder(
      options.archivePlaceholder.interval,
      options.archivePlaceholder.from,
      options.archivePlaceholder.to,
    );
  }
  refreshIndicatorData();
  if (!options.preserveVerticalScale) {
    levChart.priceScale("right").applyOptions({ autoScale: true });
    if (verticalPans.price) verticalPans.price.reset();
    else priceChart.priceScale("right").applyOptions({ autoScale: true });
  }

  state._allOrderSegments = null;
  if (view) restoreTimeView(view, { render: false });
  else {
    state.selectedT = bars[bars.length - 1].t;
    const showN = defaultVisibleBars(bars);
    const lastIdx = bars.length - 1;
    const initialRange = { from: lastIdx - showN, to: lastIdx + 2 };
    for (const { chart } of chartPanes()) chart.timeScale().setVisibleLogicalRange(initialRange);
  }
  settleChartView();
  finishTimelineRender();
}

function renderChartSymbol() {
  const text = $("chart-symbol-text");
  if (text) text.textContent = [t("chart.symbol"), state.interval, t("chart.venue")].filter(Boolean).join(" · ");
}

function finishTimelineRender() {
  syncChartTypeData();
  renderChartSymbol();
  applyFillMarkers();
  renderForSelected();
  renderPinState();
  updateOverlayMarker();
}

const CHART_TYPES = ["candles", "line"];
const CLEAR = "rgba(0, 0, 0, 0)";
const DEFAULT_CHART_STYLE = Object.freeze({
  candle: Object.freeze({ bodyUp: "#26a69a", bodyDown: "#ef5350", wick: true, wickUp: "#26a69a", wickDown: "#ef5350" }),
  line: Object.freeze({ color: "#4fc3e8", width: 2 }),
});
function chartColor(value) {
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value ?? "");
  if (!hex?.[2]) return value;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${Math.round(parseInt(hex[2], 16) / 255 * 1000) / 1000})`;
}
function chartTypeSeries() {
  return state.chartType === "line" ? priceLineSeries : priceSeries;
}
let chartTypeSignature = null;
function syncChartTypeData() {
  if (!priceSeries || !priceLineSeries) return;
  const line = state.chartType === "line";
  const data = line ? priceSeries.data() : [];
  const tail = data.slice(-3).map(d => [d.time, d.close].join(",")).join(";");
  const signature = [state.chartType, data.length, data[0]?.time, tail].join("|");
  if (signature === chartTypeSignature) return;
  chartTypeSignature = signature;
  priceLineSeries.setData(data.map(({ time, close }) => ({ time, value: close })));
}
function applyChartType() {
  if (!priceSeries || !priceLineSeries) return;
  const style = state.chartStyle ?? DEFAULT_CHART_STYLE, candle = style.candle, line = state.chartType === "line";
  priceSeries.applyOptions(line
    ? { upColor: CLEAR, downColor: CLEAR, borderVisible: false, wickVisible: false, lastValueVisible: false }
    : { upColor: chartColor(candle.bodyUp), downColor: chartColor(candle.bodyDown),
      borderVisible: true, borderUpColor: chartColor(candle.bodyUp), borderDownColor: chartColor(candle.bodyDown),
      wickVisible: candle.wick, wickUpColor: chartColor(candle.wickUp), wickDownColor: chartColor(candle.wickDown),
      lastValueVisible: true });
  priceLineSeries.applyOptions({ visible: line, lastValueVisible: line,
    color: chartColor(style.line.color), lineWidth: style.line.width });
  syncChartTypeData();
  renderLatestPriceLine();
}

const IND_COLORS = ["#ffd54f", "#4fc3f7", "#ba68c8", "#81c784", "#f06292",
                    "#58a6ff", "#ffb74d", "#4db6ac", "#e57373", "#9575cd"];
let _indColorIdx = 0;
const IND_WIDTHS = [0.5, 1, 1.5, 2, 3];
const indWidthPx = (level) => IND_WIDTHS[Math.min(5, Math.max(1, level || 2)) - 1];

function computeMA(bars, type, period) {
  const out = [];
  if (!bars || !bars.length || !(period >= 1)) return out;
  if (type === "sma") {
    let sum = 0;
    for (let i = 0; i < bars.length; i++) {
      sum += bars[i].c;
      if (i >= period) sum -= bars[i - period].c;
      if (i >= period - 1) out.push({ time: Math.floor(bars[i].t / 1000), value: sum / period });
    }
  } else {
    const k = 2 / (period + 1);
    let ema = null, seed = 0;
    for (let i = 0; i < bars.length; i++) {
      if (i < period - 1) { seed += bars[i].c; continue; }
      if (i === period - 1) { seed += bars[i].c; ema = seed / period; }
      else { ema = bars[i].c * k + ema * (1 - k); }
      out.push({ time: Math.floor(bars[i].t / 1000), value: ema });
    }
  }
  return out;
}

function computeBB(bars, basis, period, mult) {
  const mid = [], up = [], low = [];
  if (!bars || !bars.length || !(period >= 1)) return { mid, up, low };
  const m = (mult > 0) ? mult : 2;
  const push = (i, center, sd) => {
    const tt = Math.floor(bars[i].t / 1000);
    mid.push({ time: tt, value: center });
    up.push({ time: tt, value: center + m * sd });
    low.push({ time: tt, value: center - m * sd });
  };
  if (basis === "sma") {
    let sum = 0, sumSq = 0;
    for (let i = 0; i < bars.length; i++) {
      const c = bars[i].c;
      sum += c; sumSq += c * c;
      if (i >= period) { const o = bars[i - period].c; sum -= o; sumSq -= o * o; }
      if (i >= period - 1) {
        const mean = sum / period;
        const sd = Math.sqrt(Math.max(0, sumSq / period - mean * mean));
        push(i, mean, sd);
      }
    }
  } else {
    const k = 2 / (period + 1);
    let ema = null, varr = 0, seedSum = 0, seedSumSq = 0;
    for (let i = 0; i < bars.length; i++) {
      const c = bars[i].c;
      if (i < period - 1) { seedSum += c; seedSumSq += c * c; continue; }
      if (i === period - 1) {
        seedSum += c; seedSumSq += c * c;
        ema = seedSum / period;
        varr = Math.max(0, seedSumSq / period - ema * ema);
      } else {
        const delta = c - ema;
        ema = ema + k * delta;
        varr = (1 - k) * (varr + k * delta * delta);
      }
      push(i, ema, Math.sqrt(Math.max(0, varr)));
    }
  }
  return { mid, up, low };
}

function bbTitle(ind) {
  return `BB ${(ind.basis || "ema").toUpperCase()}${ind.period}·${ind.mult}σ`;
}

function indicatorLabel(ind) {
  return ind.type === "bb" ? bbTitle(ind) : `${ind.type.toUpperCase()} ${ind.period}`;
}

function indicatorSeriesList(ind) {
  return ind.type === "bb" ? [ind.series, ind.upSeries, ind.lowSeries] : [ind.series];
}

function indicatorAutoscale(original) {
  return verticalPans.price?.fixedRange() ? null : original();
}

function makeIndicatorSeries(ind) {
  if (ind.type === "bb") {
    const base = { color: ind.color, lineWidth: indWidthPx(ind.widthLevel), visible: !ind.hidden,
                   priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
                   autoscaleInfoProvider: indicatorAutoscale };
    ind.upSeries  = priceChart.addLineSeries({ ...base });
    ind.lowSeries = priceChart.addLineSeries({ ...base });
    ind.series    = priceChart.addLineSeries({ ...base, lineStyle: LWC.LineStyle.Dashed,
                       lastValueVisible: !ind.hidden, title: bbTitle(ind) });
    return;
  }
  ind.series = priceChart.addLineSeries({
    color: ind.color,
    lineWidth: indWidthPx(ind.widthLevel),
    visible: !ind.hidden,
    priceLineVisible: false,
    lastValueVisible: !ind.hidden,
    crosshairMarkerVisible: false,
    title: indicatorLabel(ind),
    autoscaleInfoProvider: indicatorAutoscale,
  });
}

function setIndicatorData(ind, bars) {
  if (!bars) return;
  if (ind.type === "bb") {
    const { mid, up, low } = computeBB(bars, ind.basis, ind.period, ind.mult);
    ind.series.setData(mid); ind.upSeries.setData(up); ind.lowSeries.setData(low);
  } else {
    ind.series.setData(computeMA(bars, ind.type, ind.period));
  }
}

function refreshIndicatorData() {
  const bars = state.timeline && state.timeline.bars;
  if (!bars) return;
  for (const ind of state.indicators) {
    if (!ind.series) makeIndicatorSeries(ind);
    setIndicatorData(ind, bars);
  }
}

function addIndicator(type, period) {
  if (state.indicators.length >= MAX_INDICATORS || !IND_TYPES.includes(type) ||
      !Number.isInteger(period) || period < 1 || period > 1000) return false;
  const color = IND_COLORS[_indColorIdx++ % IND_COLORS.length];
  const id = _indColorIdx + "-" + period + "-" + type + "-" + state.indicators.length;
  const ind = (type === "bb")
    ? { id, type: "bb", basis: "ema", period, mult: 2, widthLevel: 2, hidden: false, color,
        series: null, upSeries: null, lowSeries: null }
    : { id, type, period, widthLevel: 2, hidden: false, color, series: null };
  state.indicators.push(ind);
  makeIndicatorSeries(ind);
  setIndicatorData(ind, state.timeline && state.timeline.bars);
  renderIndicatorLegend();
  return true;
}

function removeIndicator(id) {
  const i = state.indicators.findIndex(x => x.id === id);
  if (i === -1) return;
  if (_indEditor && _indEditor._indId === id) closeIndicatorEditor();
  for (const s of indicatorSeriesList(state.indicators[i])) {
    if (s) { try { priceChart.removeSeries(s); } catch (e) { } }
  }
  state.indicators.splice(i, 1);
  renderIndicatorLegend();
}

function setIndicatorPeriod(id, period) {
  const ind = state.indicators.find(x => x.id === id);
  if (!ind || !(period >= 1) || period > 1000) return false;
  ind.period = period;
  ind.series.applyOptions({ title: indicatorLabel(ind) });
  setIndicatorData(ind, state.timeline && state.timeline.bars);
  renderIndicatorLegend();
  return true;
}
function setIndicatorColor(id, color) {
  const ind = state.indicators.find(x => x.id === id);
  if (!ind || !color) return;
  ind.color = color;
  for (const s of indicatorSeriesList(ind)) if (s) s.applyOptions({ color });
  renderIndicatorLegend();
}
function setIndicatorWidthLevel(id, level) {
  const ind = state.indicators.find(x => x.id === id);
  if (!ind || !(level >= 1) || level > 5) return;
  ind.widthLevel = level;
  for (const s of indicatorSeriesList(ind)) if (s) s.applyOptions({ lineWidth: indWidthPx(level) });
  if (_prefsReady) savePrefs();
}
function toggleIndicatorVisible(id) {
  const ind = state.indicators.find(x => x.id === id);
  if (!ind || !ind.series) return;
  ind.hidden = !ind.hidden;
  const vis = !ind.hidden;
  ind.series.applyOptions({ visible: vis, lastValueVisible: vis });
  if (ind.type === "bb") {
    ind.upSeries.applyOptions({ visible: vis });
    ind.lowSeries.applyOptions({ visible: vis });
  }
  renderIndicatorLegend();
}

function setIndicatorType(id, type) {
  const ind = state.indicators.find(x => x.id === id);
  if (!ind || ind.type === "bb" || (type !== "ema" && type !== "sma")) return;
  ind.type = type;
  ind.series.applyOptions({ title: indicatorLabel(ind) });
  setIndicatorData(ind, state.timeline && state.timeline.bars);
  renderIndicatorLegend();
}
function setIndicatorBasis(id, basis) {
  const ind = state.indicators.find(x => x.id === id);
  if (!ind || ind.type !== "bb" || (basis !== "ema" && basis !== "sma")) return;
  ind.basis = basis;
  ind.series.applyOptions({ title: indicatorLabel(ind) });
  setIndicatorData(ind, state.timeline && state.timeline.bars);
  renderIndicatorLegend();
}
function setIndicatorMult(id, mult) {
  const ind = state.indicators.find(x => x.id === id);
  if (!ind || ind.type !== "bb" || !(mult > 0) || mult > 10) return false;
  ind.mult = mult;
  ind.series.applyOptions({ title: indicatorLabel(ind) });
  setIndicatorData(ind, state.timeline && state.timeline.bars);
  renderIndicatorLegend();
  return true;
}

function renderIndicatorLegend() {
  updateIndicatorAddButton();
  const el = $("chart-legend");
  if (!el) return;
  el.innerHTML = "";
  for (const ind of state.indicators) {
    const row = document.createElement("div");
    row.className = "legend-item" + (ind.hidden ? " off" : "");
    const eye = document.createElement("button");
    eye.type = "button";
    eye.className = "legend-eye";
    eye.title = t("t.ind_toggle");
    eye.setAttribute("aria-label", `${indicatorLabel(ind)}: ${t("t.ind_toggle")}`);
    eye.setAttribute("aria-pressed", String(!ind.hidden));
    eye.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/>
      <circle cx="12" cy="12" r="3"/>
      <path class="legend-eye-slash" d="M3 21 21 3"/>
    </svg>`;
    eye.addEventListener("click", (e) => { e.stopPropagation(); toggleIndicatorVisible(ind.id); });
    const name = document.createElement("span");
    name.className = "legend-name";
    name.style.color = ind.color;
    name.textContent = indicatorLabel(ind);
    name.title = t("t.ind_edit");
    name.addEventListener("click", (e) => { e.stopPropagation(); openIndicatorEditor(ind, name); });
    const del = document.createElement("button");
    del.className = "legend-x";
    del.title = t("t.ind_del");
    del.textContent = "×";
    del.addEventListener("click", (e) => { e.stopPropagation(); removeIndicator(ind.id); });
    row.appendChild(eye);
    row.appendChild(name);
    row.appendChild(del);
    el.appendChild(row);
  }
  if (_prefsReady) savePrefs();
}

function updateIndicatorAddButton() {
  const button = $("ind-add");
  if (!button) return;
  const full = state.indicators.length >= MAX_INDICATORS;
  button.disabled = !initialTimelineReady || !_prefsReady || full;
  button.title = full ? t("t.ind_limit", MAX_INDICATORS) : t("t.ind_add");
}

let _indEditor = null;
function _indEditorOutside(e) {
  if (formSelectPopup?.select.closest(".ind-editor") === _indEditor
      && formSelectPopup?.popup.contains(e.target)) return;
  if (_indEditor && !_indEditor.contains(e.target) && !e.target.classList.contains("legend-name")) {
    closeIndicatorEditor();
  }
}
function closeIndicatorEditor() {
  if (_indEditor?.contains(formSelectPopup?.select)) formSelectPopup.close();
  if (_indEditor) { _indEditor.remove(); _indEditor = null; }
  document.removeEventListener("mousedown", _indEditorOutside, true);
}
function openIndicatorEditor(ind, anchorEl) {
  const wrap = $("chart-price").closest(".chart-wrap");
  if (!wrap) return;
  if (_indEditor && _indEditor._indId === ind.id) { closeIndicatorEditor(); return; }
  closeIndicatorEditor();
  const isBB = ind.type === "bb";
  const typeVal = isBB ? ind.basis : ind.type;
  const typeLabel = isBB ? t("ind.ed_basis") : t("ind.ed_type");
  const pop = document.createElement("div");
  pop.className = "ind-editor";
  pop._indId = ind.id;
  let html =
      `<div class="ind-ed-row"><span>${typeLabel}</span>`
    + `<select class="ind-ed-type"><option value="ema"${typeVal === "ema" ? " selected" : ""}>EMA</option>`
    + `<option value="sma"${typeVal === "sma" ? " selected" : ""}>SMA</option></select></div>`
    + `<div class="ind-ed-row"><span>${t("ind.ed_period")}</span>`
    + `<input class="ind-ed-period" type="number" min="1" max="1000" value="${ind.period}"></div>`;
  if (isBB) {
    html += `<div class="ind-ed-row"><span>${t("ind.ed_mult")}</span>`
      + `<input class="ind-ed-mult" type="number" min="0.1" max="10" step="0.1" value="${ind.mult}"></div>`;
  }
  html += `<div class="ind-ed-row"><span>${t("ind.ed_color")}</span>`
    + `<input class="ind-ed-color" type="color" value="${ind.color}"></div>`
    + `<div class="ind-ed-row"><span>${t("ind.ed_width")}</span>`
    + `<select class="ind-ed-width">`
    +   [1, 2, 3, 4, 5].map(l => `<option value="${l}"${(ind.widthLevel || 2) === l ? " selected" : ""}>${l}</option>`).join("")
    + `</select></div>`
    + `<button class="ind-ed-done">${t("ind.ed_done")}</button>`;
  pop.innerHTML = html;
  wrap.appendChild(pop);
  const wr = wrap.getBoundingClientRect(), ar = anchorEl.getBoundingClientRect();
  pop.style.left = Math.round(ar.left - wr.left) + "px";
  pop.style.top = Math.round(ar.bottom - wr.top + 4) + "px";
  pop.querySelector(".ind-ed-type").addEventListener("change",
    e => isBB ? setIndicatorBasis(ind.id, e.target.value) : setIndicatorType(ind.id, e.target.value));
  pop.querySelector(".ind-ed-period").addEventListener("change", e => {
    if (!setIndicatorPeriod(ind.id, parseInt(e.target.value, 10))) e.target.value = String(ind.period);
  });
  const multEl = pop.querySelector(".ind-ed-mult");
  if (multEl) multEl.addEventListener("change", e => {
    if (!setIndicatorMult(ind.id, parseFloat(e.target.value))) e.target.value = String(ind.mult);
  });
  pop.querySelector(".ind-ed-color").addEventListener("input", e => setIndicatorColor(ind.id, e.target.value));
  pop.querySelector(".ind-ed-width").addEventListener("change", e => setIndicatorWidthLevel(ind.id, parseInt(e.target.value, 10)));
  pop.querySelector(".ind-ed-done").addEventListener("click", closeIndicatorEditor);
  enhanceFormControls(pop);
  _indEditor = pop;
  setTimeout(() => document.addEventListener("mousedown", _indEditorOutside, true), 0);
}

let intentView = { fills: null, timeline: null, threshold: null, byId: new Map() };
function syncFillIntent() {
  const intent = globalThis.TradeVizOrderIntent;
  if (!intent || !state.timeline) return;
  const threshold = state.intentThresholdPct / 100;
  if (intentView.fills !== state.fills || intentView.threshold !== threshold) {
    state.fills = intent.reclassifyFills(state.fills, threshold);
    intentView = { fills: state.fills, threshold, timeline: null,
      byId: new Map(state.fills.map(fill => [fill.tid, fill.crossed])) };
  }
  if (intentView.timeline !== state.timeline) {
    state.timeline = { ...state.timeline, bars: state.timeline.bars.map(bar => !bar.fills?.length ? bar : {
      ...bar, fills: bar.fills.map(fill => intentView.byId.has(fill.tid)
        ? { ...fill, crossed: intentView.byId.get(fill.tid) } : fill),
    }) };
    intentView.timeline = state.timeline;
  }
}

function applyFillMarkers() {
  if (!state.timeline) return;
  syncFillIntent();
  collectBubbles();
  bubbleRequestUpdate?.();
  arrowCache = null;
  setFillArrowMarkers();
}

let arrowCache = null;
let arrowOrders = new Map();
let hoveredArrowIds = new Set();
function fillArrowBase() {
  const key = [state.timeline, state.fillMarkers, state.fillText, state.lang];
  if (arrowCache && key.every((value, i) => value === arrowCache.key[i])) return arrowCache;
  const showMaker = state.fillMarkers !== "taker";
  const showTaker = state.fillMarkers !== "maker";
  const bars = state.timeline.bars;
  let firstAv = null;
  for (const b of bars) { if (b.av && b.av > 0) { firstAv = b.av; break; } }
  let lastAv = firstAv;
  const markers = [], orders = new Map();
  const mark = (time, position, color, shape, text, role, oids) => {
    const id = `fills:${time}:${role}`;
    markers.push(state.fillText ? { id, time, position, color, shape, text } : { id, time, position, color, shape });
    orders.set(id, oids);
  };
  for (const b of bars) {
    if (b.av && b.av > 0) lastAv = b.av;
    if (!b.fills || !b.fills.length) continue;
    let makerBuyN = 0, takerBuyN = 0, makerSellN = 0, takerSellN = 0;
    const oids = { makerBuy: new Set(), takerBuy: new Set(), makerSell: new Set(), takerSell: new Set() };
    for (const f of b.fills) {
      const ntl = (f.sz || 0) * (f.px || 0);
      const oid = String(bubbleOrderId(f));
      if (f.side === "B") {
        if (f.crossed) { takerBuyN += ntl; oids.takerBuy.add(oid); } else { makerBuyN += ntl; oids.makerBuy.add(oid); }
      } else if (f.side === "A") {
        if (f.crossed) { takerSellN += ntl; oids.takerSell.add(oid); } else { makerSellN += ntl; oids.makerSell.add(oid); }
      }
    }
    const tSec = Math.floor(b.t / 1000);
    const av = (b.av && b.av > 0) ? b.av : lastAv;
    const pct = (n) => (av && av > 0) ? `${(n / av * 100).toFixed(2)}%` : "—";
    if (showMaker && makerBuyN > 0) mark(tSec, "belowBar", "#26a69a", "arrowUp", `B ${pct(makerBuyN)}`, "makerBuy", oids.makerBuy);
    if (showTaker && takerBuyN > 0) mark(tSec, "belowBar", "#ffa726", "arrowUp", `B ${pct(takerBuyN)}${t("mark.taker")}`, "takerBuy", oids.takerBuy);
    if (showMaker && makerSellN > 0) mark(tSec, "aboveBar", "#ef5350", "arrowDown", `S ${pct(makerSellN)}`, "makerSell", oids.makerSell);
    if (showTaker && takerSellN > 0) mark(tSec, "aboveBar", "#ec407a", "arrowDown", `S ${pct(takerSellN)}${t("mark.taker")}`, "takerSell", oids.takerSell);
  }
  arrowCache = { key, markers, orders };
  return arrowCache;
}

function setFillArrowMarkers() {
  hoverArrowCount = 0;
  hoveredArrowIds = new Set();
  if (state.fillMarkers === "none" || state.fillStyle === "bubble") {
    arrowOrders = new Map();
    priceSeries.setMarkers([]);
    return;
  }
  const base = fillArrowBase();
  arrowOrders = base.orders;
  const hovered = state.hoverOids;
  priceSeries.setMarkers(!hovered.size ? base.markers : base.markers.map((marker) => {
    if (![...base.orders.get(marker.id)].some((oid) => hovered.has(oid))) return marker;
    hoveredArrowIds.add(marker.id);
    hoverArrowCount++;
    return { ...marker, baseColor: marker.color, color: hoverMarkColor(marker.color, marker.id) };
  }));
}

const BUBBLE_MIN_R = 0, BUBBLE_MAX_R = 50;
const BUBBLE_ZOOM_PX = 8;
const BUBBLE_LABELS = 10;
const BUBBLE_LABEL_ALL = 30;
const BUBBLE_KINDS = { B: { side: "B", color: "#26a69a" }, A: { side: "A", color: "#ef5350" } };

let bubbleParts = [];
let bubbleOrderCache = new Map();
const BUBBLE_ORDER_CACHE_LIMIT = 4;
let bubbleRef = null;
let bubbleRefKey = null, bubbleRefJob = null;
let bubbleVersion = 0;
let bubbleClusterCache = { key: null, data: null, at: -Infinity, scale: 1, clusters: [] };
let bubbleMergeTimer = null;
const BUBBLE_ZOOM_SETTLE_MS = 150;
let drawnBubbles = [];
let drawnBubblesTimeline = null;
let drawnBubbleLabels = [];
let bubbleLabelBoxes = [];
let bubbleRequestUpdate = null;
let bubbleOidSource = null, bubbleOidByTid = new Map();

const bubbleMedian = (values) => {
  const sorted = values.filter((value) => value > 0).sort((a, b) => a - b);
  return sorted.length ? sorted[sorted.length >> 1] : 1;
};
const bubbleVwap = (group) => group.notional / group.size;
const bubbleMeasure = (group, other) => {
  const net = bubbleNet(group, other);
  return state.bubbleSize === "usd" ? net.notional : net.pct;
};
const bubbleRawRadius = (value, ref) => 4 * Math.sqrt(value / ref);
const bubbleRadius = (value, ref) => Math.min(BUBBLE_MAX_R, Math.max(BUBBLE_MIN_R, bubbleRawRadius(value, ref)));
const bubbleMoney = (value) => "$" + Math.round(value).toLocaleString("en-US");

function bubbleOrderId(fill) {
  if (fill.oid != null) return fill.oid;
  if (state.fills !== bubbleOidSource) {
    bubbleOidSource = state.fills;
    bubbleOidByTid = new Map();
    for (const known of state.fills || []) if (known.tid != null && known.oid != null) bubbleOidByTid.set(known.tid, known.oid);
  }
  return bubbleOidByTid.get(fill.tid) ?? `fill:${fill.tid ?? `${fill.time}|${fill.px}|${fill.sz}`}`;
}

function emptyBubble(kind, i) {
  return { kind, notional: 0, taker: 0, size: 0, pct: 0, weighted: 0, min: Infinity, max: 0,
    firstI: i, lastI: i, time: Infinity, orders: new Set(), liquidations: { counterparty: 0, self: 0 },
    sides: { B: { size: 0, notional: 0, pct: 0, taker: 0 }, A: { size: 0, notional: 0, pct: 0, taker: 0 } } };
}
function addBubbleFill(group, i, time, oid, size, px, av, crossed, liquidation) {
  const amount = size * px;
  group.notional += amount;
  if (crossed) group.taker += amount;
  group.size += size;
  group.pct += amount / av * 100;
  group.weighted += i * amount;
  group.min = Math.min(group.min, px);
  group.max = Math.max(group.max, px);
  group.time = Math.min(group.time, time);
  group.orders.add(oid);
  if (Object.hasOwn(group.liquidations, liquidation)) group.liquidations[liquidation] += 1;
  const side = group.sides[group.kind.side];
  side.size += size;
  side.notional += amount;
  side.pct += amount / av * 100;
  if (crossed) side.taker += amount;
}
function absorbBubble(group, part) {
  group.notional += part.notional;
  group.taker += part.taker;
  group.size += part.size;
  group.pct += part.pct;
  group.weighted += part.weighted;
  group.min = Math.min(group.min, part.min);
  group.max = Math.max(group.max, part.max);
  group.firstI = Math.min(group.firstI, part.firstI);
  group.lastI = Math.max(group.lastI, part.lastI);
  group.time = Math.min(group.time, part.time);
  for (const oid of part.orders) group.orders.add(oid);
  for (const role of Object.keys(group.liquidations)) group.liquidations[role] += part.liquidations[role];
  for (const side of ["B", "A"]) for (const key of ["size", "notional", "pct", "taker"]) {
    group.sides[side][key] += part.sides[side][key];
  }
}

function bubbleNet(group, other) {
  const total = (side, key) => group.sides[side][key] + (other?.sides[side][key] ?? 0);
  const buy = total("B", "size"), sell = total("A", "size");
  const size = Math.abs(buy - sell);
  if (size <= Number.EPSILON * 8 * Math.max(buy, sell)) {
    return { side: null, size: 0, notional: 0, pct: 0, taker: 0 };
  }
  const side = buy > sell ? "B" : "A", fraction = size / (side === "B" ? buy : sell);
  return { side, size, notional: total(side, "notional") * fraction,
    pct: total(side, "pct") * fraction, taker: total(side, "taker") * fraction };
}

function collectBubbles() {
  bubbleParts = [];
  bubbleOrderCache = new Map();
  bubbleVersion += 1;
  const bars = state.timeline?.bars;
  if (state.fillStyle !== "bubble" || !bars?.length || state.fillMarkers === "none") return;
  let lastAv = null;
  for (const bar of bars) if (bar.av > 0) { lastAv = bar.av; break; }
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    if (bar.av > 0) lastAv = bar.av;
    if (!bar.fills?.length || !(lastAv > 0)) continue;
    const time = Math.floor(bar.t / 1000);
    const byOrder = new Map();
    for (const fill of bar.fills) {
      if (state.fillMarkers === "taker" && !fill.crossed || state.fillMarkers === "maker" && fill.crossed) continue;
      const size = Number(fill.sz), px = Number(fill.px);
      if (!(size > 0 && px > 0)) continue;
      const kind = BUBBLE_KINDS[fill.side === "B" ? "B" : "A"];
      const oid = bubbleOrderId(fill);
      const key = `${oid}|${kind.side}`;
      let part = byOrder.get(key);
      if (!part) byOrder.set(key, part = Object.assign(emptyBubble(kind, i), { key }));
      addBubbleFill(part, i, time, oid, size, px, lastAv, fill.crossed, fill.liquidation);
    }
    bubbleParts.push(...byOrder.values());
  }
  requestBubbleRef();
}

function requestBubbleRef() {
  const fills = state.fills ?? [];
  const last = fills[fills.length - 1];
  const key = [state.fillMarkers, state.intentThresholdPct, fills.length, last?.tid, last?.time].join("|");
  if (key === bubbleRefKey) return;
  bubbleRefKey = key;
  const fillMarkers = state.fillMarkers;
  const job = (async () => {
    let bars = null;
    try { bars = (await loadJson("timeline_1d"))?.bars; } catch (e) { }
    if (bubbleRefJob !== job) return;
    bubbleRef = bubbleRefFromHistory(fills, bars?.length ? bars : state.timeline?.bars ?? [], fillMarkers)
      ?? bubbleRef ?? { usd: 1, pos: 1 };
    bubbleRequestUpdate?.();
  })();
  bubbleRefJob = job;
}

function bubbleRefFromHistory(fills, bars, fillMarkers, orderOf = bubbleOrderId) {
  const times = [], values = [];
  let last = bars.find((bar) => bar.av > 0)?.av;
  if (!(last > 0)) return null;
  for (const bar of bars) {
    if (bar.av > 0) last = bar.av;
    times.push(bar.t);
    values.push(last);
  }
  const avAt = (time) => {
    let lo = 0, hi = times.length - 1, found = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= time) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return values[found];
  };
  const orders = new Map();
  for (const fill of fills) {
    if (fillMarkers === "taker" && !fill.crossed || fillMarkers === "maker" && fill.crossed) continue;
    const size = Number(fill.sz), px = Number(fill.px);
    if (!(size > 0 && px > 0)) continue;
    const key = `${orderOf(fill)}|${fill.side === "B" ? "B" : "A"}`;
    const amount = size * px, pct = amount / avAt(fill.time) * 100;
    const order = orders.get(key);
    if (order) { order.notional += amount; order.pct += pct; } else orders.set(key, { notional: amount, pct });
  }
  if (!orders.size) return null;
  const list = [...orders.values()];
  return { usd: bubbleMedian(list.map((o) => o.notional)), pos: bubbleMedian(list.map((o) => o.pct)) };
}

function bubbleUntilKey(until) {
  if (until == null || !bubbleParts.length) return until;
  let lo = 0, hi = bubbleParts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bubbleParts[mid].time <= until) lo = mid + 1;
    else hi = mid;
  }
  return lo ? bubbleParts[lo - 1].time : -1;
}

function bubbleOrdersUntil(untilSec) {
  const until = bubbleUntilKey(untilSec);
  const cacheKey = String(until);
  if (bubbleOrderCache.has(cacheKey)) return bubbleOrderCache.get(cacheKey);
  const map = new Map();
  for (const part of bubbleParts) {
    if (until != null && part.time > until) continue;
    let order = map.get(part.key);
    if (!order) map.set(part.key, order = emptyBubble(part.kind, part.firstI));
    absorbBubble(order, part);
  }
  for (const order of map.values()) order.weighted = order.notional * order.lastI;
  const list = [...map.values()];
  bubbleOrderCache.set(cacheKey, list);
  for (const key of bubbleOrderCache.keys()) {
    if (bubbleOrderCache.size <= BUBBLE_ORDER_CACHE_LIMIT) break;
    bubbleOrderCache.delete(key);
  }
  return list;
}

function bubbleView() {
  const timeScale = priceChart.timeScale();
  const range = timeScale.getVisibleLogicalRange();
  if (!range) return null;
  const spacing = timeScale.options().barSpacing || timeScale.width() / Math.max(1, range.to - range.from);
  return { from: Math.floor(range.from), to: Math.ceil(range.to), spacing, scale: Math.max(1, spacing / BUBBLE_ZOOM_PX) };
}

const BUBBLE_Y_STEPS = 8;
function bubbleClusterBasis(view) {
  const log = priceSeries.priceScale?.().options?.().mode === 1;
  const height = globalThis.document?.getElementById?.("chart-price")?.clientHeight;
  const mid = height ? priceSeries.coordinateToPrice?.(height / 2) : null;
  const ref = Number.isFinite(mid) && mid > 0 ? mid : 10_000;
  const y0 = priceSeries.priceToCoordinate(ref), y1 = priceSeries.priceToCoordinate(ref * 1.01);
  if (y0 == null || y1 == null || y0 === y1) return { spacing: view.spacing, k: null };
  const perUnit = Math.abs(y0 - y1) / (log ? Math.log(1.01) : ref * 0.01);
  const step = Math.round(Math.log2(perUnit) * BUBBLE_Y_STEPS);
  return { spacing: view.spacing, log, k: 2 ** (step / BUBBLE_Y_STEPS),
    key: `${view.spacing.toPrecision(6)}|${log ? "log" : "linear"}${step}` };
}
const bubbleY = (basis, price) => -(basis.log ? Math.log(price) : price) * basis.k;

function bubbleLogicalX(timeScale, logical) {
  const lo = Math.floor(logical);
  const x0 = timeScale.logicalToCoordinate(lo);
  if (x0 == null || logical === lo) return x0;
  const x1 = timeScale.logicalToCoordinate(lo + 1);
  return x1 == null ? x0 : x0 + (logical - lo) * (x1 - x0);
}
function placeBubble(group, timeScale, ref, scale) {
  if (!bubbleNet(group).size) return null;
  const x = bubbleLogicalX(timeScale, group.weighted / group.notional);
  const y = priceSeries.priceToCoordinate(bubbleVwap(group));
  if (x == null || y == null) return null;
  const value = bubbleMeasure(group);
  return { group, x, y, r: bubbleRadius(value, ref) * scale, raw: bubbleRawRadius(value, ref) * scale, scale };
}
function bubbleInView(group, view) {
  const center = group.weighted / group.notional;
  return center >= view.from - 1 && center <= view.to + 1;
}

function clusterBubbles(view, untilSec, limits = {}, kindFor = group => BUBBLE_KINDS[bubbleNet(group).side] ?? group.kind) {
  const min = limits.min ?? BUBBLE_MIN_R, max = limits.max ?? BUBBLE_MAX_R;
  const clamp = raw => raw > 0 ? Math.min(max, Math.max(min, raw)) : 0;
  const timeScale = priceChart.timeScale();
  const basis = bubbleClusterBasis(view);
  if (!(basis.k > 0)) return [];
  const until = bubbleUntilKey(untilSec);
  const data = [bubbleVersion, state.bubbleSize, bubbleRef?.[state.bubbleSize], until, min, max].join("|");
  const key = [basis.key, view.scale, data].join("|");
  if (bubbleClusterCache.key !== key) {
    const now = globalThis.performance?.now?.() ?? Date.now();
    const zooming = bubbleClusterCache.data === data && now - bubbleClusterCache.at < BUBBLE_ZOOM_SETTLE_MS;
    if (zooming) {
      clearTimeout(bubbleMergeTimer);
      bubbleMergeTimer = setTimeout(() => {
        bubbleMergeTimer = null;
        bubbleClusterCache.at = -Infinity;
        bubbleRequestUpdate?.();
      }, BUBBLE_ZOOM_SETTLE_MS);
    } else {
      bubbleClusterCache = { key, data, at: now, scale: view.scale,
        clusters: mergeBubbles(basis, view.scale, until, min, max, clamp, kindFor) };
    }
  }
  const ratio = view.scale / bubbleClusterCache.scale;
  const items = [];
  for (const cluster of bubbleClusterCache.clusters) {
    if (!bubbleInView(cluster.group, view)) continue;
    const x = bubbleLogicalX(timeScale, cluster.group.weighted / cluster.group.notional);
    const y = priceSeries.priceToCoordinate(bubbleVwap(cluster.group));
    if (x == null || y == null) continue;
    items.push({ group: cluster.group, x, y, r: cluster.r * ratio, raw: cluster.raw * ratio, scale: view.scale });
  }
  return items;
}

function mergeBubbles(basis, scale, until, min, max, clamp, kindFor) {
  const ref = bubbleRef[state.bubbleSize], cap = Number.isFinite(max) ? ref * (max / 4) ** 2 : Infinity;
  const items = [];
  for (const order of bubbleOrdersUntil(until)) {
    const vwap = bubbleVwap(order);
    if (!(vwap > 0) || !(bubbleNet(order).size > 0)) continue;
    const measure = bubbleMeasure(order);
    const raw = bubbleRawRadius(measure, ref) * scale;
    items.push({ order, measure, raw, r: clamp(raw / scale) * scale,
      x: order.weighted / order.notional * basis.spacing, y: bubbleY(basis, vwap) });
  }
  items.sort((a, b) => b.measure - a.measure);
  let cellSize = 2 * max * scale;
  if (!Number.isFinite(cellSize)) cellSize = 2 * items.reduce((most, entry) => Math.max(most, entry.r), 0);
  cellSize = Math.max(1, cellSize);
  const keyOf = (cx, cy) => cx * 2_097_152 + cy;
  const cells = new Map();
  const index = (cluster) => {
    cluster.cell = keyOf(Math.floor(cluster.x / cellSize), Math.floor(cluster.y / cellSize));
    let list = cells.get(cluster.cell);
    if (!list) cells.set(cluster.cell, list = []);
    list.push(cluster);
  };
  const unindex = (cluster) => {
    const list = cells.get(cluster.cell);
    list.splice(list.indexOf(cluster), 1);
  };
  const clusters = [];
  let biggest = 0;
  let item = null, target = null, best = Infinity;
  const consider = (c) => {
    const dx = c.x - item.x, dy = c.y - item.y, distance = dx * dx + dy * dy, touch = c.r + item.r;
    if (distance >= touch * touch || distance > best || (distance === best && c.id > target.id)) return;
    const next = bubbleMeasure(c.group, item.order);
    if (next > cap && !(next < c.measure)) return;
    target = c;
    best = distance;
  };
  for (item of items) {
    target = null;
    best = Infinity;
    const reach = Math.max(1, Math.ceil((biggest + item.r) / cellSize));
    if (reach > 1 && (2 * reach + 1) ** 2 > clusters.length) clusters.forEach(consider);
    else {
      const cx = Math.floor(item.x / cellSize), cy = Math.floor(item.y / cellSize);
      for (let dx = -reach; dx <= reach; dx += 1) {
        for (let dy = -reach; dy <= reach; dy += 1) cells.get(keyOf(cx + dx, cy + dy))?.forEach(consider);
      }
    }
    const order = item.order;
    if (!target) {
      const group = emptyBubble(order.kind, order.firstI);
      absorbBubble(group, order);
      const cluster = { x: item.x, y: item.y, r: item.r, raw: item.raw, measure: item.measure, group, id: clusters.length };
      clusters.push(cluster);
      index(cluster);
      biggest = Math.max(biggest, cluster.r);
      continue;
    }
    absorbBubble(target.group, order);
    target.group.kind = kindFor(target.group);
    unindex(target);
    target.x = target.group.weighted / target.group.notional * basis.spacing;
    target.y = bubbleY(basis, bubbleVwap(target.group));
    target.measure = bubbleMeasure(target.group);
    target.raw = bubbleRawRadius(target.measure, ref) * scale;
    target.r = clamp(target.raw / scale) * scale;
    index(target);
    biggest = Math.max(biggest, target.r);
  }
  return clusters.filter(({ group }) => bubbleNet(group).size > 0 && bubbleVwap(group) > 0)
    .map(({ group, r, raw }) => ({ group, r, raw }));
}

function bubbleItems() {
  const view = bubbleView();
  if (!view || !bubbleParts.length || !bubbleRef) return [];
  const until = replayNowSec();
  if (state.bubbleGroup === "cluster") return clusterBubbles(view, until);
  const timeScale = priceChart.timeScale(), ref = bubbleRef[state.bubbleSize];
  return bubbleOrdersUntil(until).filter((order) => bubbleInView(order, view))
    .map((order) => placeBubble(order, timeScale, ref, view.scale)).filter(Boolean);
}

function bubbleLabel(group) {
  const pct = bubbleNet(group).pct;
  const share = `${pct.toFixed(pct >= 100 ? 0 : pct >= 10 ? 1 : 2)}%`;
  const count = group.orders.size > 1 ? ` · ${t("bubble.orders", group.orders.size)}` : "";
  return `${group.kind.side === "B" ? "B" : "S"} ${share}${count} @${bubbleMoney(bubbleVwap(group)).slice(1)}`;
}

function drawBubbles({ context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr }) {
  drawnBubbles = state.fillStyle === "bubble" ? [...bubbleItems()].sort((a, b) => b.r - a.r) : [];
  drawnBubblesTimeline = state.timeline;
  drawnBubbleLabels = [];
  bubbleLabelBoxes = [];
  hoverBubbleCount = 0;
  if (!drawnBubbles.length) return;
  const hovered = state.hoverOids;
  const hoveredGroups = new Set(!hovered.size ? [] : drawnBubbles.map((bubble) => bubble.group)
    .filter((group) => [...group.orders].some((order) => hovered.has(String(order)))));
  hoverBubbleCount = hoveredGroups.size;
  const colorOf = (group) => (hoveredGroups.has(group) ? brightColor(group.kind.color) : group.kind.color);
  ctx.save();
  for (const { group, x, y, r } of drawnBubbles) {
    ctx.beginPath();
    ctx.arc(x * hpr, y * vpr, r * hpr, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle = colorOf(group);
    ctx.globalAlpha = 0.3;
    ctx.fill();
    ctx.lineWidth = Math.max(1, Math.round(hpr));
    ctx.globalAlpha = 0.95;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (state.fillText) {
    ctx.font = `${Math.round(11 * vpr)}px system-ui, sans-serif`;
    ctx.textBaseline = "middle";
    const limit = drawnBubbles.length <= BUBBLE_LABEL_ALL ? drawnBubbles.length : BUBBLE_LABELS;
    const placed = [];
    for (const { group, x, y, r } of drawnBubbles) {
      if (placed.length >= limit) break;
      const text = bubbleLabel(group);
      const width = ctx.measureText(text).width / hpr;
      const box = { left: x + r + 1, right: x + r + 10 + width, top: y - 9, bottom: y + 9 };
      if (placed.some((other) => box.left < other.right && box.right > other.left
          && box.top < other.bottom && box.bottom > other.top)) continue;
      placed.push(box);
      drawnBubbleLabels.push(text);
      bubbleLabelBoxes.push({ group, ...box });
      ctx.fillStyle = themeColor("--label-bg", "rgba(13, 16, 21, 0.78)");
      ctx.fillRect(box.left * hpr, box.top * vpr, (box.right - box.left) * hpr, (box.bottom - box.top) * vpr);
      ctx.fillStyle = colorOf(group);
      ctx.fillText(text, (box.left + 4) * hpr, y * vpr);
    }
  }
  ctx.restore();
}

function makeBubblePrimitive() {
  return {
    attached({ requestUpdate }) { bubbleRequestUpdate = requestUpdate; },
    detached() { bubbleRequestUpdate = null; },
    updateAllViews() {},
    paneViews: () => [{
      zOrder: () => "top",
      renderer: () => ({ draw: (target) => target.useBitmapCoordinateSpace(drawBubbles) }),
    }],
  };
}

let cashFlows = [];
let cashFlowRequestUpdate = null;
const CASH_FLOW_COLORS = { deposit: "#26a69a", withdraw: "#ffa726" };
const CASH_LABEL_TOP = 46;

function validCashFlow(row) {
  return Boolean(row) && Number.isSafeInteger(row.time) && (row.type === "deposit" || row.type === "withdraw")
    && Number.isFinite(row.amount) && row.amount > 0 && typeof row.asset === "string" && row.asset !== "";
}

async function loadCashFlows() {
  const get = globalThis.TradeVizData?.getCashFlows;
  if (typeof get !== "function") return;
  try {
    const rows = await get();
    cashFlows = (Array.isArray(rows) ? rows : []).filter(validCashFlow).sort((a, b) => a.time - b.time);
  } catch (error) {
    console.error(error);
    cashFlows = [];
  }
  $("chk-cash-flows").closest("label").hidden = cashFlows.length === 0;
  cashFlowRequestUpdate?.();
}

function fmtCashAmount(row) {
  const digits = row.asset === "BTC" ? 4 : 2;
  return `${row.amount.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${row.asset}`;
}

function cashFlowLogical(bars, time) {
  const i = bisectLeq(bars, time, "t");
  if (i < 0) return null;
  const step = (bars[i + 1]?.t ?? bars[i].t + (bars[i].t - (bars[i - 1]?.t ?? bars[i].t))) - bars[i].t;
  if (!(step > 0) || time >= bars[i].t + step) return null;
  return i;
}

function drawCashFlows({ context: ctx, bitmapSize, horizontalPixelRatio: hpr, verticalPixelRatio: vpr }) {
  const bars = state.timeline?.bars;
  if (!state.showCashFlows || !cashFlows.length || !bars?.length) return;
  const timeScale = priceChart.timeScale();
  const width = bitmapSize.width / hpr;
  const items = [];
  for (const row of cashFlows) {
    const logical = cashFlowLogical(bars, row.time);
    const x = logical === null ? null : bubbleLogicalX(timeScale, logical);
    if (x != null && x >= 0 && x <= width) items.push({ row, x });
  }
  if (!items.length) return;
  ctx.save();
  const lineWidth = Math.max(1, Math.round(hpr));
  ctx.lineWidth = lineWidth;
  ctx.font = `${Math.round(11 * vpr)}px system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  const levels = [];
  for (const { row, x } of items) {
    const color = CASH_FLOW_COLORS[row.type];
    const px = Math.round(x * hpr) + (lineWidth % 2) / 2;
    ctx.setLineDash([4 * hpr, 4 * hpr]);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, bitmapSize.height);
    ctx.stroke();
    const lines = [t(row.type === "deposit" ? "cash.deposit" : "cash.withdraw", fmtCashAmount(row)), fmtTs(row.time)];
    const boxW = Math.max(...lines.map((line) => ctx.measureText(line).width)) / hpr + 8, boxH = 30;
    const left = x + 3 + boxW <= width ? x + 3 : x - 3 - boxW;
    let level = levels.findIndex((right) => left > right + 4);
    if (level < 0) level = levels.length;
    levels[level] = left + boxW;
    const top = CASH_LABEL_TOP + level * (boxH + 4);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = themeColor("--label-bg", "rgba(13, 16, 21, 0.78)");
    ctx.fillRect(left * hpr, top * vpr, boxW * hpr, boxH * vpr);
    ctx.fillStyle = color;
    ctx.fillText(lines[0], (left + 4) * hpr, (top + 8) * vpr);
    ctx.fillStyle = "#8b949e";
    ctx.fillText(lines[1], (left + 4) * hpr, (top + 22) * vpr);
  }
  ctx.restore();
}

function makeCashFlowPrimitive() {
  return {
    attached({ requestUpdate }) { cashFlowRequestUpdate = requestUpdate; },
    detached() { cashFlowRequestUpdate = null; },
    updateAllViews() {},
    paneViews: () => [{
      zOrder: () => "top",
      renderer: () => ({ draw: (target) => target.useBitmapCoordinateSpace(drawCashFlows) }),
    }],
  };
}

function currentDrawnBubbles() {
  return drawnBubblesTimeline === state.timeline ? drawnBubbles : [];
}

function selectedBubbleBar(point) {
  if (!point || state.fillStyle !== "bubble" || state.fillMarkers === "none") return null;
  const hit = [...currentDrawnBubbles()].reverse().find(({ x, y, r }) => (x - point.x) ** 2 + (y - point.y) ** 2 <= r ** 2);
  if (!hit) return null;
  const group = hit.group;
  const index = group.orders.size > 1 ? group.firstI : Math.round(group.weighted / group.notional);
  return state.timeline?.bars[index] ?? null;
}

function arrowGroup(id) {
  const match = /^fills:(\d+):(maker|taker)(Buy|Sell)$/.exec(id ?? "");
  const bars = state.timeline?.bars;
  if (!match || !bars?.length) return null;
  const i = bisectLeq(bars, Number(match[1]) * 1000, "t");
  if (i < 0 || !bars[i].fills?.length) return null;
  let av = null;
  for (let k = i; k >= 0 && !(av > 0); k -= 1) av = bars[k].av;
  if (!(av > 0)) av = bars.find((bar) => bar.av > 0)?.av;
  if (!(av > 0)) return null;
  const side = match[3] === "Buy" ? "B" : "A", taker = match[2] === "taker";
  const group = emptyBubble(BUBBLE_KINDS[side], i);
  for (const fill of bars[i].fills) {
    const size = Number(fill.sz), px = Number(fill.px);
    if (fill.side !== side || Boolean(fill.crossed) !== taker || !(size > 0 && px > 0)) continue;
    addBubbleFill(group, i, Math.floor(bars[i].t / 1000), bubbleOrderId(fill), size, px, av, fill.crossed, fill.liquidation);
  }
  return group.size > 0 ? group : null;
}

function showFillTooltip(param) {
  const tip = $("bubble-tip");
  const point = param?.point;
  const arrow = point && arrowOrders.has(param.hoveredObjectId) ? arrowGroup(param.hoveredObjectId) : null;
  const hit = !arrow && point
    && [...currentDrawnBubbles()].reverse().find(({ x, y, r }) => (x - point.x) ** 2 + (y - point.y) ** 2 <= (r + 3) ** 2);
  const g = arrow ?? hit?.group;
  if (!g) { tip.hidden = true; return; }
  const net = bubbleNet(g), mixed = g.sides.B.size > 0 && g.sides.A.size > 0;
  const bars = state.timeline.bars;
  const first = bars[g.firstI], last = bars[g.lastI];
  const candles = g.lastI - g.firstI + 1;
  const lines = [
    `${t(g.kind.side === "B" ? "bubble.buy" : "bubble.sell")} · ${fmtTs(first.t)}${candles > 1 ? ` → ${fmtTs(last.T ?? last.t)}` : ""}${t("bubble.candles", candles)}`,
    `${g.orders.size > 1 ? t("bubble.orders_long", g.orders.size) : ""}${mixed
      ? t("bubble.net_amount", net.size.toFixed(5), bubbleMoney(net.notional), `${net.pct.toFixed(net.pct >= 10 ? 1 : 2)}%`)
      : t("bubble.amount", bubbleMoney(net.notional), `${net.pct.toFixed(net.pct >= 10 ? 1 : 2)}%`)}`,
    t("bubble.avg", bubbleMoney(bubbleVwap(g)), bubbleMoney(g.min), bubbleMoney(g.max)),
  ];
  for (const [role, fills] of Object.entries(g.liquidations)) if (fills) lines.push(t(`bubble.liq_${role}`));
  tip.replaceChildren(...lines.map((line) => Object.assign(document.createElement("div"), { textContent: line })));
  const chart = $("chart-price");
  tip.hidden = false;
  const left = chart.offsetLeft + point.x + 14;
  tip.style.left = `${Math.max(chart.offsetLeft + 4, Math.min(left, chart.offsetLeft + chart.clientWidth - tip.offsetWidth - 4))}px`;
  const below = chart.offsetTop + point.y + 14;
  tip.style.top = `${point.y > chart.clientHeight * 0.6 ? below - tip.offsetHeight - 28 : below}px`;
}

let _rafPending = false;

function onCrosshair(param, sourceChart) {
  if (state.pinned) return;
  if (!param || !param.time) return;
  const tSec = typeof param.time === "number" ? param.time : null;
  if (tSec === null) return;
  const tMs = tSec * 1000;
  const idx = bisectLeq(state.timeline.bars, tMs, "t");
  if (idx < 0) return;
  const bar = state.timeline.bars[idx];

  for (const pane of chartPanes()) {
    if (pane.key === sourceChart) continue;
    try {
      pane.chart.setCrosshairPosition(0, param.time, pane.series);
    } catch (e) { }
  }

  if (state.selectedT === bar.t) return;
  state.selectedT = bar.t;

  if (_rafPending) return;
  _rafPending = true;
  requestAnimationFrame(() => {
    if (!_rafPending) return;
    _rafPending = false;
    renderForSelected();
  });
}

function liquidationPriceForBar(bar) {
  if (!bar || !Number.isFinite(bar.c) || bar.c <= 0 || !Number.isFinite(bar.av) || bar.av <= 0
      || !Number.isFinite(bar.lev) || bar.lev === 0) return null;
  const price = bar.c * (1 - 1 / bar.lev);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

function renderLiquidation(bar) {
  selectedLiquidationPrice = state.showLiquidation ? liquidationPriceForBar(bar) : null;
  if (selectedLiquidationPrice === null) {
    if (liquidationLine) priceSeries.removePriceLine(liquidationLine);
    liquidationLine = null;
    return;
  }
  const options = { price: selectedLiquidationPrice, color: "#ef5350", lineWidth: 1,
    lineStyle: LWC.LineStyle.Dashed, axisLabelVisible: true, title: t("chart.liquidation") };
  if (liquidationLine) liquidationLine.applyOptions(options);
  else liquidationLine = priceSeries.createPriceLine(options);
}

function renderForSelected() {
  const bars = state.timeline?.bars;
  if (!bars?.length) { renderLiquidation(null); return; }
  const idx = bisectLeq(bars, state.selectedT, "t");
  const pnlSpec = pnlUnitSpec();
  const pnlLabel = els.selPnl.closest("div").querySelector(".k");
  const pnlLabelKey = state.pnlUnit === "btc" ? "kv.pnl_btc" : "kv.pnl";
  pnlLabel.dataset.i18n = pnlLabelKey;
  pnlLabel.textContent = t(pnlLabelKey);
  if (idx < 0 || state.selectedT > bars[idx].T) {
    renderLiquidation(null);
    renderPriceOhlc(bars, -1);
    els.selTime.textContent = fmtTs(state.selectedT);
    for (const el of [els.selPx, els.selPos, els.selNotional, els.selAvBtc, els.selAv, els.selLev, els.selPnl, els.selPnlReturn]) {
      el.textContent = "—";
      el.className = "v";
    }
    els.selPnlReturnGroup.hidden = true;
    els.ordersTableBody.innerHTML = "";
    els.ordersEmpty.hidden = false;
    _lastOrdersBar = null;
    clearPrimitiveLines();
    clearReplayMarker();
    globalThis.TradeVizSite?.renderSelected?.(null);
    return;
  }
  const bar = bars[idx];
  renderLiquidation(bar);

  renderPriceOhlc(bars, idx);

  els.selTime.textContent = fmtTs(bar.t);
  els.selPx.textContent = fmtUsd(bar.c, 1);
  els.selPos.textContent = bar.pos === null ? "—" : `${fmtBtc(bar.pos)} BTC`;
  els.selPos.className = "v";
  els.selNotional.textContent = bar.notional === null ? "—" : fmtUsd(bar.notional, 0);
  const avBtc = Number.isFinite(bar.av) && Number.isFinite(bar.c) && bar.c > 0 ? bar.av / bar.c : null;
  els.selAvBtc.textContent = avBtc === null ? "—" : `${fmtBtc(avBtc)} BTC`;
  els.selAv.textContent = bar.av === null ? "—" : fmtUsd(bar.av, 0);
  els.selLev.textContent = fmtLev(bar.lev);
  els.selLev.className = "v " + levColor(bar.lev);
  const pnl = pnlSnapshot(bar, state.pnlStart?.bar);
  const pnlValue = pnl[state.pnlUnit];
  els.selPnl.textContent = pnlValue === null
    ? (state.pnlStart && bar.T < state.pnlStart.bar.T ? t("pnl.before_start") : "—")
    : pnlSpec.text(pnlValue);
  els.selPnl.className = "v " + (pnlValue > 0 ? "green" : pnlValue < 0 ? "red" : "");
  const pnlReturn = pnl[state.pnlUnit + "Return"];
  els.selPnlReturn.textContent = fmtReturn(pnlReturn);
  els.selPnlReturn.className = "v " + (pnlReturn > 0 ? "green" : pnlReturn < 0 ? "red" : "");
  els.selPnlReturnGroup.hidden = pnlValue === null;

  drawActiveOrderLines(bar);
  renderOrdersTable(bar);
  globalThis.TradeVizSite?.renderSelected?.(bar);
}

function ordersForBar(bar) {
  const model = globalThis.TradeVizSite?.orderModel ?? OrderLifecycle;
  return model.forBar(state.orders, bar, state.summary?.order_recovery);
}

const ORDERLINE_GROUPS = [
  { side: "buy",  dash: false },
  { side: "buy",  dash: true },
  { side: "sell", dash: false },
  { side: "sell", dash: true },
];

function computeAllOrderSegments() {
  const model = globalThis.TradeVizSite?.orderModel ?? OrderLifecycle;
  return model.projectOrders(state.orders, state.timeline?.bars, {
    recovery: state.summary?.order_recovery,
  });
}

function replayNowSec() {
  const bars = state.timeline && state.timeline.bars;
  if (!bars || !bars.length) return null;
  if (state.replayMode === "history" && state.pinned && state.selectedT != null) {
    return Math.floor(state.selectedT / 1000);
  }
  return Math.floor(bars[bars.length - 1].t / 1000);
}

const MAX_DASH_PIECES_PER_STROKE = 16384;

let orderLineHighlight = false;
function applyOrderLineStyle(ctx, group, hpr, vpr, alphaScale = 1) {
  const { side, dash } = ORDERLINE_GROUPS[group];
  const width = Math.max(1, Math.round(2 * vpr));
  const pattern = dash ? [width, Math.round(1.5 * width)] : [];
  ctx.lineWidth = width;
  ctx.strokeStyle = orderLineHighlight ? brightColor(state.orderColors[side]) : state.orderColors[side];
  ctx.globalAlpha = (orderLineHighlight ? 1 : dash ? state.unfilledAlpha : state.filledAlpha ?? 1) * alphaScale;
  ctx.setLineDash(pattern);
  return pattern.reduce((sum, n) => sum + n, 0);
}

function makeDashBatcher(ctx, dashCycle) {
  let dashPieces = 0;
  return (x1, x2, y) => {
    const pieces = dashCycle ? Math.ceil((x2 - x1) / dashCycle) + 1 : 0;
    if (dashPieces && dashPieces + pieces > MAX_DASH_PIECES_PER_STROKE) {
      ctx.stroke();
      ctx.beginPath();
      dashPieces = 0;
    }
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    dashPieces += pieces;
  };
}

function makeOrderLinesPrimitive() {
  const st = { groups: [[], [], [], []], chart: null, series: null, requestUpdate: null };
  const renderer = {
    draw(target) {
      const chart = st.chart, series = st.series;
      if (!chart || !series) return;
      const ts = chart.timeScale();
      const nowSec = replayNowSec();
      const refSec = (state.selectedT != null) ? Math.floor(state.selectedT / 1000) : nowSec;
      target.useBitmapCoordinateSpace(scope => {
        const ctx = scope.context;
        const hpr = scope.horizontalPixelRatio, vpr = scope.verticalPixelRatio;
        const rightEdge = scope.mediaSize.width * hpr;
        const bottomEdge = scope.mediaSize.height * vpr;
        ctx.save();
        ctx.lineWidth = Math.max(1, Math.round(2 * vpr));
        const strokePadding = ctx.lineWidth / 2;
        const hits = [];
        const hit = (oid, bx1, bx2, by) => hits.push({ oid, x1: Math.max(0, bx1) / hpr, x2: bx2 / hpr, y: by / vpr });
        const fullLineMode = (state.orderLineMode === "full");
        for (let g = 0; g < 4; g++) {
          const arr = st.groups[g];
          if (!arr || !arr.length) continue;
          const dashCycle = applyOrderLineStyle(ctx, g, hpr, vpr);
          ctx.beginPath();
          const appendLine = makeDashBatcher(ctx, dashCycle);
          for (const seg of arr) {
            if (nowSec != null && seg.t1 > nowSec) continue;
            const y = series.priceToCoordinate(seg.px);
            if (y == null) continue;
            const by = y * vpr;
            if (by < -strokePadding || by > bottomEdge + strokePadding) continue;
            if (fullLineMode) {
              const activeAtRef = seg.active || (refSec == null) || ((seg.t1 <= refSec) && (seg.open || seg.t2 > refSec));
              if (!activeAtRef) continue;
              appendLine(0, rightEdge, by);
              hit(seg.oid, 0, rightEdge, by);
              continue;
            }
            const x1 = ts.timeToCoordinate(seg.t1);
            if (x1 == null) continue;
            let endSec = seg.open ? nowSec : seg.t2;
            if (nowSec != null && (endSec == null || endSec > nowSec)) endSec = nowSec;
            const x2 = (endSec != null) ? ts.timeToCoordinate(endSec) : scope.mediaSize.width;
            if (x2 == null) continue;
            let bx1 = x1 * hpr, bx2 = x2 * hpr;
            if (bx2 - bx1 < 2 * hpr) bx2 = bx1 + 2 * hpr;
            if (bx1 >= rightEdge || bx2 <= 0) continue;
            if (bx2 > rightEdge) bx2 = rightEdge;
            if (bx1 < 0) bx1 = dashCycle ? -((-bx1) % dashCycle) : 0;
            appendLine(bx1, bx2, by);
            hit(seg.oid, bx1, bx2, by);
          }
          ctx.stroke();
        }
        ctx.restore();
        const overlay = globalThis.TradeVizSite?.drawOrderOverlay;
        if (overlay) {
          ctx.save();
          overlay(ctx, { scope, timeScale: ts, series, groups: st.groups, nowSec, refSec, fullLineMode, hit });
          ctx.restore();
        }
        orderLineHits = hits;
      });
    },
  };
  const paneView = { renderer: () => renderer, zOrder: () => "top" };
  return {
    attached(p) { st.chart = p.chart; st.series = p.series; st.requestUpdate = p.requestUpdate; },
    detached() { st.chart = null; st.series = null; },
    paneViews() { return [paneView]; },
    updateAllViews() {},
    setGroups(groups) {
      st.groups = groups;
      if (st.requestUpdate) st.requestUpdate();
    },
    getGroups() { return st.groups; },
  };
}

function orderSegmentBitmap(seg, ts, nowSec, refSec, scope, dashCycle) {
  const hpr = scope.horizontalPixelRatio, vpr = scope.verticalPixelRatio;
  const rightEdge = scope.mediaSize.width * hpr, bottomEdge = scope.mediaSize.height * vpr;
  const strokePadding = Math.max(1, Math.round(2 * vpr)) / 2;
  if (nowSec != null && seg.t1 > nowSec) return null;
  const y = priceSeries.priceToCoordinate(seg.px);
  if (y == null) return null;
  const by = y * vpr;
  if (by < -strokePadding || by > bottomEdge + strokePadding) return null;
  if (state.orderLineMode === "full") {
    const active = seg.active || refSec == null || ((seg.t1 <= refSec) && (seg.open || seg.t2 > refSec));
    return active ? { bx1: 0, bx2: rightEdge, by } : null;
  }
  const x1 = ts.timeToCoordinate(seg.t1);
  if (x1 == null) return null;
  let endSec = seg.open ? nowSec : seg.t2;
  if (nowSec != null && (endSec == null || endSec > nowSec)) endSec = nowSec;
  const x2 = (endSec != null) ? ts.timeToCoordinate(endSec) : scope.mediaSize.width;
  if (x2 == null) return null;
  let bx1 = x1 * hpr, bx2 = x2 * hpr;
  if (bx2 - bx1 < 2 * hpr) bx2 = bx1 + 2 * hpr;
  if (bx1 >= rightEdge || bx2 <= 0) return null;
  if (bx2 > rightEdge) bx2 = rightEdge;
  if (bx1 < 0) bx1 = dashCycle ? -((-bx1) % dashCycle) : 0;
  return { bx1, bx2, by };
}

const HOVER_BRIGHTEN = 0.12;

function parseHexColor(color) {
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(color ?? "");
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [n >> 16, (n >> 8) & 255, n & 255, match[2] ? parseInt(match[2], 16) / 255 : 1];
}
const hexByte = (value) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0");
function brightColor(color) {
  const rgba = parseHexColor(color);
  if (!rgba) return color;
  const [r, g, b] = rgba.slice(0, 3).map((value) => value / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const light = Math.min(1, l + HOVER_BRIGHTEN), a = s * Math.min(light, 1 - light);
  const f = (n) => { const k = (n + h / 30) % 12; return light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return `#${hexByte(f(0) * 255)}${hexByte(f(8) * 255)}${hexByte(f(4) * 255)}`;
}
const hoverMarkColor = (color, id) => (hoveredArrowIds.has(id) ? brightColor(color) : color);
let hoverArrowCount = 0;
let hoverBubbleCount = 0;

function makeOrderHoverPrimitive() {
  const st = { chart: null, series: null, requestUpdate: null, drawn: { lines: 0 } };
  const renderer = {
    draw(target) {
      st.drawn = { lines: 0 };
      const oids = state.hoverOids;
      if (!oids.size || !st.chart || !st.series) return;
      const ts = st.chart.timeScale();
      const nowSec = replayNowSec();
      const refSec = state.selectedT != null ? Math.floor(state.selectedT / 1000) : nowSec;
      const groups = orderLinesPrimitive?.getGroups() ?? [];
      target.useBitmapCoordinateSpace((scope) => {
        const ctx = scope.context, hpr = scope.horizontalPixelRatio, vpr = scope.verticalPixelRatio;
        ctx.save();
        for (let g = 0; g < Math.min(groups.length, ORDERLINE_GROUPS.length); g++) {
          for (const seg of groups[g] ?? []) {
            if (!oids.has(String(seg.oid))) continue;
            const dashCycle = applyOrderLineStyle(ctx, g, hpr, vpr);
            const at = orderSegmentBitmap(seg, ts, nowSec, refSec, scope, dashCycle);
            if (!at) continue;
            ctx.strokeStyle = brightColor(state.orderColors[ORDERLINE_GROUPS[g].side]);
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.moveTo(at.bx1, at.by);
            ctx.lineTo(at.bx2, at.by);
            ctx.stroke();
            st.drawn.lines++;
          }
        }
        ctx.restore();
        const highlight = globalThis.TradeVizSite?.highlightOrderOverlay;
        if (!highlight) return;
        ctx.save();
        orderLineHighlight = true;
        try {
          st.drawn.overlay = highlight(ctx, { scope, timeScale: ts, series: st.series, groups, nowSec, refSec,
            fullLineMode: state.orderLineMode === "full", oid: state.hoverOid, oids }) ?? 0;
        } finally {
          orderLineHighlight = false;
          ctx.restore();
        }
      });
    },
  };
  const paneView = { renderer: () => renderer, zOrder: () => "top" };
  return {
    attached(p) { st.chart = p.chart; st.series = p.series; st.requestUpdate = p.requestUpdate; },
    detached() { st.chart = null; st.series = null; st.requestUpdate = null; },
    paneViews() { return [paneView]; },
    updateAllViews() {},
    update() { st.requestUpdate?.(); },
    drawn() { return { ...st.drawn, bubbles: hoverBubbleCount, arrows: hoverArrowCount }; },
  };
}

let orderHoverSource = null;

function setOrderHover(ids, source = "table") {
  const next = new Set(ids == null ? [] : typeof ids === "object" ? [...ids].map(String) : [String(ids)]);
  if (!next.size && orderHoverSource !== null && orderHoverSource !== source) return;
  orderHoverSource = next.size ? source : null;
  if (next.size === state.hoverOids.size && [...next].every((oid) => state.hoverOids.has(oid))) return;
  state.hoverOids = next;
  state.hoverOid = next.size ? next.values().next().value : null;
  for (const row of els.ordersTableBody.querySelectorAll("tr[data-oid]")) {
    row.classList.toggle("order-hover", next.has(row.dataset.oid));
  }
  revealHoveredRow();
  orderHoverPrimitive?.update();
  bubbleRequestUpdate?.();
  if (state.fillStyle !== "bubble" && state.timeline) setFillArrowMarkers();
}

function revealHoveredRow() {
  if (orderHoverSource !== "chart") return;
  const row = els.ordersTableBody.querySelector("tr.order-hover");
  const panel = row?.closest(".panel");
  if (!panel || !/(auto|scroll)/.test(getComputedStyle(panel).overflowY) || panel.scrollHeight <= panel.clientHeight) return;
  const r = row.getBoundingClientRect();
  const top = panel.getBoundingClientRect().top + panel.clientTop, bottom = top + panel.clientHeight;
  if (r.top < top) panel.scrollTop -= top - r.top + 4;
  else if (r.bottom > bottom) panel.scrollTop += r.bottom - bottom + 4;
}

const ORDER_LINE_HIT_PX = 4;
let orderLineHits = [];
let chartPointerType = "mouse";

function orderLineAt(point) {
  const near = orderLineHits.filter((line) => point.x >= line.x1 - 2 && point.x <= line.x2 + 2
    && Math.abs(point.y - line.y) <= ORDER_LINE_HIT_PX);
  if (!near.length) return null;
  const best = Math.min(...near.map((line) => Math.abs(point.y - line.y)));
  return new Set(near.filter((line) => Math.abs(point.y - line.y) <= best + 0.5).map((line) => String(line.oid)));
}

let chartHoverHit = null;
function chartHoverOrders(point, objectId) {
  const arrow = objectId == null ? null : arrowOrders.get(objectId);
  const label = arrow ? null : bubbleLabelBoxes.find((box) => point.x >= box.left && point.x <= box.right
    && point.y >= box.top && point.y <= box.bottom);
  const bubble = arrow || label ? null
    : [...drawnBubbles].reverse().find(({ x, y, r }) => (x - point.x) ** 2 + (y - point.y) ** 2 <= (r + 3) ** 2);
  const line = arrow || label || bubble ? null : orderLineAt(point);
  chartHoverHit = arrow ? "arrow" : label ? "label" : bubble ? "bubble" : line ? "line" : null;
  return arrow ?? label?.group.orders ?? bubble?.group.orders ?? line;
}

function onChartHover(param) {
  if (chartPointerType !== "mouse") return;
  setOrderHover(param?.point ? chartHoverOrders(param.point, param.hoveredObjectId) : null, "chart");
}

function drawActiveOrderLines(bar) {
  if (state.orderLineMode === "full") {
    drawLifecycleOrderLines(bar);
  } else if (state.showAllOrders) {
    if (!state._allOrderSegments) state._allOrderSegments = computeAllOrderSegments();
    orderLinesPrimitive.setGroups(state._allOrderSegments);
    state._primitiveActive = true;
  } else {
    drawLifecycleOrderLines(bar);
  }
}

function clearPrimitiveLines() {
  if (state._primitiveActive && orderLinesPrimitive) {
    orderLinesPrimitive.setGroups([[], [], [], []]);
    state._primitiveActive = false;
  }
}

function drawLifecycleOrderLines(bar) {
  if (!state.timeline?.bars?.length) { clearPrimitiveLines(); return; }
  const model = globalThis.TradeVizSite?.orderModel ?? OrderLifecycle;
  orderLinesPrimitive.setGroups(model.projectOrders(state.orders, state.timeline.bars, {
    recovery: state.summary?.order_recovery, atMs: bar.T ?? bar.t, bar,
  }));
  state._primitiveActive = true;
}

const ORDER_SORT_GETTERS = {
  side: o => (o.side === "B" ? 0 : 1),
  price: o => (o._px ?? 0),
  sz: o => (o._sz || 0),
  notional: o => (o._notional || 0),
  pct: o => (o._pct ?? -1),
  created: o => (o.timestamp || 0),
};

function compareOrders(a, b) {
  for (const { key, dir } of state.ordersSort) {
    const get = ORDER_SORT_GETTERS[key];
    if (!get) continue;
    if (key === "price" && (a._px == null || b._px == null)) {
      if (a._px != null) return -1;
      if (b._px != null) return 1;
      continue;
    }
    const va = get(a), vb = get(b);
    if (va < vb) return -dir;
    if (va > vb) return dir;
  }
  return 0;
}

function orderFillStatsByOid() {
  const memo = orderFillStatsByOid.memo ??= { fills: null, stats: null };
  if (memo.fills === state.fills) return memo.stats;
  const stats = new Map();
  for (const fill of state.fills || []) {
    if (fill.oid === null || fill.oid === undefined) continue;
    let entry = stats.get(fill.oid);
    if (!entry) {
      entry = { size: 0, notional: 0, contracts: 0, liquidity: "maker" };
      stats.set(fill.oid, entry);
    }
    if (fill.crossed) entry.liquidity = "taker";
    const size = Number(fill.sz);
    const price = Number(fill.px);
    if (Number.isFinite(size) && size > 0 && Number.isFinite(price) && price > 0) {
      entry.size += size;
      entry.notional += size * price;
      const contracts = Number(fill.contracts);
      if (Number.isFinite(contracts) && contracts > 0) entry.contracts += contracts;
    }
  }
  Object.assign(memo, { fills: state.fills, stats });
  return stats;
}

function orderTableValues(order, fillStats, accountValue) {
  const orderPrice = order.is_trigger ? order.trigger_px : order.limit_px;
  const orderSize = Number(order.orig_sz || order.sz || 0);
  const completeFills = order.status === "filled"
    && Number.isFinite(orderSize) && orderSize > 0
    && fillStats && fillStats.size > 0
    && Math.abs(fillStats.size - orderSize) <= Math.max(1e-8, orderSize * 1e-6);
  const price = completeFills ? fillStats.notional / fillStats.size : orderPrice;
  const size = completeFills ? fillStats.size : orderSize;
  const notional = completeFills ? fillStats.notional
    : order.status === "filled" ? null : (Number(orderPrice) || 0) * orderSize;
  const pct = notional !== null && accountValue > 0 ? notional / accountValue : null;
  const remaining = order.sz;
  const hasRemaining = remaining != null && remaining !== "" && Number.isFinite(Number(remaining)) && Number(remaining) >= 0;
  const expectedPartial = order.filled_contracts !== undefined
    ? Number(order.filled_contracts) : hasRemaining ? orderSize - Number(remaining) : NaN;
  const observedPartial = order.filled_contracts !== undefined ? fillStats?.contracts : fillStats?.size;
  const partialTotal = order.filled_contracts !== undefined ? Number(order.contracts) : orderSize;
  const partialTolerance = order.filled_contracts !== undefined ? 1e-9 : 1e-6;
  const completePartial = order.status !== "filled" && order.status !== "evidence" && !order.evidence
    && Number.isFinite(partialTotal) && partialTotal > 0
    && Number.isFinite(expectedPartial) && expectedPartial > 0 && expectedPartial <= partialTotal
    && Number.isFinite(observedPartial)
    && Math.abs(observedPartial - expectedPartial) <= Math.max(1e-8, expectedPartial * partialTolerance);
  const executionPrice = (completeFills || completePartial) && !order.evidence && fillStats?.size > 0
    && Number.isFinite(fillStats.notional) && fillStats.notional > 0
    ? fillStats.notional / fillStats.size : null;
  const displayPriceKind = executionPrice !== null ? "execution" : order.status === "filled" ? "missing" : "order";
  const validOrderPrice = Number.isFinite(Number(orderPrice)) && Number(orderPrice) > 0 ? Number(orderPrice) : null;
  const displayPrice = executionPrice ?? (displayPriceKind === "order" ? validOrderPrice : null);
  return {
    price, executionPrice, displayPrice, displayPriceKind, size, notional, pct,
    priceKind: completeFills ? "execution" : order.status === "filled" ? "missing" : "order",
  };
}

function updateOrdersSortIndicators() {
  document.querySelectorAll("#orders-table thead th[data-sort]").forEach(th => {
    const idx = state.ordersSort.findIndex(s => s.key === th.dataset.sort);
    if (idx === -1) { th.innerHTML = th.dataset.label; return; }
    const s = state.ordersSort[idx];
    const lvl = state.ordersSort.length > 1 ? `<sup>${idx + 1}</sup>` : "";
    th.innerHTML = `${th.dataset.label} <span class="sort-ind">${s.dir === 1 ? "▲" : "▼"}${lvl}</span>`;
  });
}

let _lastOrdersBar = null;

function renderOrdersTable(bar) {
  _lastOrdersBar = bar;
  const orders = ordersForBar(bar);
  const fillsByOid = orderFillStatsByOid();
  els.ordersTableBody.innerHTML = "";
  if (!orders.length) {
    els.ordersEmpty.hidden = false;
    return;
  }
  els.ordersEmpty.hidden = true;
  const rows = orders.map(o => {
    const values = orderTableValues(o, fillsByOid.get(o.oid), bar.av);
    return {
      ...o,
      _px: values.displayPrice,
      _sz: values.size,
      _notional: values.notional,
      _pct: values.pct,
      _priceKind: values.displayPriceKind,
      _liquidity: fillsByOid.get(o.oid)?.liquidity || null,
    };
  }).sort(compareOrders);

  for (const o of rows) {
    const tr = document.createElement("tr");
    const isFilled = o.status === "filled";
    const isOpen = o.status === "open" || o.status === "triggered";
    tr.className = (o.side === "B" ? "buy" : "sell") + (!isFilled && !isOpen ? " order-canceled" : "");
    const pctStr = o._pct === null ? "—" : (o._pct * 100).toFixed(2) + "%";
    const statusBadge = isFilled
      ? `<span class="badge ok">${t("badge.filled")}</span>`
      : isOpen
        ? `<span class="badge open">${t("badge.open")}</span>`
        : `<span class="badge canceled">${t("badge.canceled")}</span>`;
    const takerBadge = o._liquidity === "taker"
      ? `<span class="badge taker">${t("badge.taker")}</span>`
      : "";
    const orderPrice = o.is_trigger ? o.trigger_px : o.limit_px;
    const orderPriceLabel = o.is_trigger ? t("tbl.trigger_price") : t("tbl.limit_price");
    const priceTitle = o._priceKind === "execution"
      ? t("tbl.execution_price") + "; " + orderPriceLabel + ": " + fmtUsd(orderPrice, 0)
      : o._priceKind === "missing"
        ? orderPriceLabel + ": " + fmtUsd(orderPrice, 0) + "; " + t("tbl.missing_fills")
        : t("tbl.no_execution") + "; " + orderPriceLabel + ": " + fmtUsd(orderPrice, 0);
    tr.innerHTML = `
      <td class="left side"><span class="side-text">${o.side === "B" ? t("tbl.buy") : t("tbl.sell")}</span> ${statusBadge}${takerBadge}</td>
      <td data-price-kind="${o._priceKind}" title="${priceTitle}">${fmtUsd(o._px, 0)}</td>
      <td>${fmtBtc(o._sz, 5)}</td>
      <td>${fmtUsd(o._notional, 0)}</td>
      <td>${pctStr}</td>
      <td class="muted small created">${fmtTsShort(o.timestamp)}</td>
    `;
    tr.dataset.oid = String(o.oid);
    if (state.hoverOids.has(tr.dataset.oid)) tr.classList.add("order-hover");
    globalThis.TradeVizSite?.decorateOrderRow?.(tr, o, bar);
    els.ordersTableBody.appendChild(tr);
  }
  revealHoveredRow();
}

function updateOrderModeUI() {
  const seg = $("seg-show-all");
  if (seg) seg.classList.toggle("disabled", state.orderLineMode === "full");
}

let formSelectPopup = null;
let formControlId = 0;

const FORM_SELECT_SYMBOLS = {
  infinity: { viewBox: "1 7 22 10", d: "M6 16c5 0 7-8 12-8a4 4 0 0 1 0 8c-5 0-7-8-12-8a4 4 0 1 0 0 8" },
};
function formOptionLabel(option) {
  const text = option?.textContent || "";
  const symbol = FORM_SELECT_SYMBOLS[option?.dataset.symbol];
  if (!symbol) return [document.createTextNode(text)];
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "form-select-symbol");
  svg.setAttribute("viewBox", symbol.viewBox);
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", symbol.d);
  svg.append(path);
  const label = document.createElement("span");
  label.className = "form-select-symbol-text";
  label.textContent = text;
  return [svg, label];
}
function persistFormPreference(element, event) {
  if (!event?.isTrusted) return;
  const control = PREF_CONTROLS.find(pref => pref.id === element.id);
  if (!control) return;
  if (_prefsReady) savePrefs();
  else persistPrefField(control.key, readPref(control));
}
function syncFormControls(root = document) {
  root.querySelectorAll("select, input[type=number]").forEach(el => el._syncFormControl?.());
}

function enhanceFormControls(root = document) {
  for (const select of root.querySelectorAll("select")) {
    if (select._syncFormControl) continue;
    const wrapper = document.createElement("span");
    wrapper.className = "form-select";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "form-select-trigger";
    trigger.id = `${select.id || `form-select-${++formControlId}`}-trigger`;
    trigger.setAttribute("role", "combobox");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    const value = document.createElement("span");
    value.className = "form-select-value";
    const sizer = document.createElement("span");
    sizer.className = "form-select-sizer";
    sizer.setAttribute("aria-hidden", "true");
    trigger.append(value, sizer);
    select.before(wrapper);
    wrapper.append(select, trigger);
    select.hidden = true;
    select._syncFormControl = () => {
      if (formSelectPopup?.select === select) formSelectPopup.close();
      value.replaceChildren(...formOptionLabel(select.selectedOptions[0]));
      trigger.dataset.value = select.value;
      sizer.replaceChildren(...[...select.options].map(option => {
        const label = document.createElement("span");
        label.replaceChildren(...formOptionLabel(option));
        return label;
      }));
      trigger.title = select.title;
      trigger.disabled = select.disabled;
      trigger.setAttribute("aria-label", select.closest(".control-group, .ind-ed-row, .speed")
        ?.querySelector(".label, span")?.textContent || select.title);
    };
    select.addEventListener("change", select._syncFormControl);

    function open() {
      formSelectPopup?.close();
      const options = [...select.options].filter(option => !option.disabled && !option.hidden);
      const popup = document.createElement("div");
      popup.className = "form-select-popup";
      popup.id = `${trigger.id}-options`;
      popup.setAttribute("role", "listbox");
      popup.setAttribute("aria-label", trigger.getAttribute("aria-label"));
      popup.addEventListener("mousedown", event => event.preventDefault());
      let active = Math.max(0, options.findIndex(option => option.selected));
      const items = options.map((option, index) => {
        const item = document.createElement("div");
        item.id = `${popup.id}-${index}`;
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", String(option.selected));
        item.dataset.value = option.value;
        item.replaceChildren(...formOptionLabel(option));
        item.addEventListener("pointermove", () => highlight(index));
        item.addEventListener("click", event => commit(index, event));
        return item;
      });
      popup.append(...items);
      document.body.append(popup);
      const rect = trigger.getBoundingClientRect();
      popup.style.minWidth = `${rect.width}px`;
      const height = Math.min(popup.scrollHeight, 240);
      const below = innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const up = below < height && above > below;
      popup.style.maxHeight = `${Math.min(240, Math.max(40, up ? above : below))}px`;
      popup.style.left = `${Math.max(4, Math.min(rect.left, innerWidth - popup.offsetWidth - 4))}px`;
      popup.style.top = `${up ? Math.max(4, rect.top - popup.offsetHeight - 4) : rect.bottom + 4}px`;
      trigger.setAttribute("aria-expanded", "true");
      trigger.setAttribute("aria-controls", popup.id);
      const listeners = new AbortController();
      function close() {
        listeners.abort();
        popup.remove();
        trigger.setAttribute("aria-expanded", "false");
        trigger.removeAttribute("aria-controls");
        trigger.removeAttribute("aria-activedescendant");
        formSelectPopup = null;
      }
      function highlight(index) {
        active = Math.max(0, Math.min(options.length - 1, index));
        items.forEach((item, i) => item.classList.toggle("highlighted", i === active));
        trigger.setAttribute("aria-activedescendant", items[active].id);
        items[active].scrollIntoView({ block: "nearest" });
      }
      function commit(index = active, event) {
        const changed = select.value !== options[index].value;
        select.value = options[index].value;
        close();
        select._syncFormControl();
        trigger.focus({ preventScroll: true });
        if (changed) {
          select.dispatchEvent(new Event("input", { bubbles: true }));
          select.dispatchEvent(new Event("change", { bubbles: true }));
          persistFormPreference(select, event);
        }
      }
      formSelectPopup = { select, popup, close, highlight, commit,
        move: delta => highlight(active + delta), options };
      highlight(active);
      document.addEventListener("pointerdown", event => {
        if (!wrapper.contains(event.target) && !popup.contains(event.target)) close();
      }, { capture: true, signal: listeners.signal });
      document.addEventListener("scroll", event => {
        if (!popup.contains(event.target)) close();
      }, { capture: true, signal: listeners.signal });
      window.addEventListener("resize", close, { signal: listeners.signal });
    }
    trigger.addEventListener("click", () => {
      if (formSelectPopup?.select === select) formSelectPopup.close();
      else open();
    });
    trigger.addEventListener("blur", () => formSelectPopup?.select === select && formSelectPopup.close());
    let search = "", searchAt = 0;
    trigger.addEventListener("keydown", event => {
      const key = event.key;
      const current = formSelectPopup?.select === select ? formSelectPopup : null;
      if (key === "Escape") { current?.close(); return; }
      if (key === "Tab") { current?.commit(undefined, event); return; }
      if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(key)) {
        event.preventDefault();
        if (!current) { open(); return; }
        if (key === "Enter" || key === " ") current.commit(undefined, event);
        else if (key === "Home" || key === "End") current.highlight(key === "Home" ? 0 : current.options.length - 1);
        else current.move(key === "ArrowDown" ? 1 : -1);
      } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        if (!current) open();
        search = performance.now() - searchAt > 700 ? key : search + key;
        searchAt = performance.now();
        const index = formSelectPopup.options.findIndex(option => option.textContent.toLowerCase().startsWith(search.toLowerCase()));
        if (index >= 0) formSelectPopup.highlight(index);
      }
    });
    select._syncFormControl();
  }
  for (const input of root.querySelectorAll("input[type=number]")) {
    if (input._syncFormControl) continue;
    const wrapper = document.createElement("span");
    wrapper.className = "form-number";
    input.before(wrapper);
    wrapper.append(input);
    const stepper = document.createElement("span");
    stepper.className = "form-number-stepper";
    const buttons = [1, -1].map(direction => {
      const button = document.createElement("button");
      button.type = "button";
      button.tabIndex = -1;
      button.dataset.step = String(direction);
      button.addEventListener("mousedown", event => event.preventDefault());
      button.addEventListener("click", event => {
        if (input.disabled || input.readOnly) return;
        input.focus({ preventScroll: true });
        const previous = input.value;
        input.stepUp(direction);
        if (input.value !== previous) {
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          persistFormPreference(input, event);
        }
      });
      return button;
    });
    stepper.append(...buttons);
    wrapper.append(stepper);
    input._syncFormControl = () => {
      const name = input.title || input.closest(".ind-ed-row")?.firstElementChild.textContent || "";
      buttons.forEach((button, index) => {
        button.setAttribute("aria-label", `${state.lang === "zh" ? ["增加", "减少"][index] : ["Increase", "Decrease"][index]} ${name}`);
        button.disabled = input.disabled || input.readOnly;
      });
    };
    input._syncFormControl();
  }
}

function bindControls() {
  els.ordersTableBody.addEventListener("pointerover", (event) => {
    if (event.pointerType !== "mouse") return;
    setOrderHover(event.target.closest?.("tr[data-oid]")?.dataset.oid ?? null, "table");
  });
  els.ordersTableBody.addEventListener("pointerleave", () => setOrderHover(null, "table"));
  enhanceFormControls();
  bindPnlResponsiveHeader();
  els.segInterval.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", async () => {
      const v = btn.dataset.val;
      await switchTimeline(v);
    });
  });

  els.btnPin.addEventListener("click", () => {
    state.pinned = !state.pinned;
    renderPinState();
    replayScrollAndMark();
  });
  $("seg-pnl-unit").querySelectorAll("button[data-val]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.pnlUnit === btn.dataset.val) return;
      $("seg-pnl-unit").querySelectorAll("button[data-val]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.pnlUnit = btn.dataset.val;
      applyPnlSeries();
      renderForSelected();
      updateOverlayMarker();
    });
  });

  const setPnlPercent = (next) => {
    if (state.pnlPercent === next) return;
    state.pnlPercent = next;
    $("seg-pnl-mode").querySelectorAll("button[data-val]").forEach((button) => {
      const active = (button.dataset.val === "percentage") === next;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    $("btn-pnl-percent-toggle").classList.toggle("active", next);
    $("btn-pnl-percent-toggle").setAttribute("aria-pressed", String(next));
    applyPnlSeries();
    updateOverlayMarker();
  };
  $("seg-pnl-mode").querySelectorAll("button[data-val]").forEach((btn) => {
    btn.addEventListener("click", () => setPnlPercent(btn.dataset.val === "percentage"));
  });
  $("btn-pnl-percent-toggle").addEventListener("click", () => setPnlPercent(!state.pnlPercent));

  els.pnlStartSelected.addEventListener("click", () => {
    els.pnlStartMenu.open = false;
    setPnlStartPicking(true);
    els.pnlStartTrigger.focus({ preventScroll: true });
  });
  els.pnlStartTrigger.addEventListener("click", () => {
    if (state.pnlStartPicking) setPnlStartPicking(false);
  });
  els.pnlStartMenu.addEventListener("toggle", positionPnlStartMenu);
  document.addEventListener("scroll", positionPnlStartMenu, { capture: true, passive: true });
  window.addEventListener("resize", positionPnlStartMenu);
  window.visualViewport?.addEventListener("resize", positionPnlStartMenu);
  window.visualViewport?.addEventListener("scroll", positionPnlStartMenu);
  new ResizeObserver(positionPnlStartMenu).observe(document.querySelector(".pane-pnl"));
  els.pnlStartClear.addEventListener("click", async () => {
    const version = ++pnlStartRequestVersion;
    setPnlStartPicking(false);
    renderPnlStartStatus("pnl.status_loading");
    try {
      const start = await defaultPnlStart();
      if (version === pnlStartRequestVersion) {
        setPnlStart(start, { preservePicking: true });
        els.pnlStartMenu.open = false;
      }
    } catch (error) {
      if (version === pnlStartRequestVersion) renderPnlStartStatus("pnl.status_error");
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (els.pnlStartMenu.open && !els.pnlStartMenu.contains(event.target)) {
      els.pnlStartMenu.open = false;
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (state.pnlStartPicking) {
        setPnlStartPicking(false);
        els.pnlStartTrigger.focus({ preventScroll: true });
      } else if (els.pnlStartMenu.open) {
        els.pnlStartMenu.open = false;
        els.pnlStartTrigger.focus();
      }
    }
  });
  els.btnPinLatest.addEventListener("click", () => {
    stopPlay();
    goToLatest({ pin: true });
  });

  els.btnStepBack.addEventListener("click", () => stepBy(-1));
  els.btnStepFwd.addEventListener("click", () => stepBy(1));

  els.btnPlay.addEventListener("click", () => {
    if (state.playTimer) stopPlay();
    else startPlay();
  });

  bindReplayKeyboard();

  $("chk-show-future").addEventListener("change", (e) => setShowFuture(e.target.checked));
  const savedLiquidation = loadPrefs().showLiquidation;
  if (typeof savedLiquidation === "boolean") {
    state.showLiquidation = savedLiquidation;
    $("chk-liquidation").checked = savedLiquidation;
  }
  $("chk-liquidation").addEventListener("change", (event) => {
    state.showLiquidation = event.target.checked;
    if (event.isTrusted && !_prefsReady) persistPrefField("showLiquidation", state.showLiquidation);
    renderForSelected();
  });
  $("chk-cash-flows").addEventListener("change", (event) => {
    state.showCashFlows = event.target.checked;
    cashFlowRequestUpdate?.();
  });

  const thresholdInput = $("fill-intent-threshold");
  const thresholdControl = PREF_CONTROLS.find(control => control.key === "intentThresholdPct");
  const storedThreshold = loadPrefs().intentThresholdPct;
  if (isValidPref(thresholdControl, storedThreshold)) {
    state.intentThresholdPct = Number(storedThreshold);
    thresholdInput.value = String(state.intentThresholdPct);
  }
  renderFillIntentHelp();
  thresholdInput.addEventListener("input", renderFillIntentHelp);
  thresholdInput.addEventListener("change", (event) => {
    if (!isValidPref(thresholdControl, thresholdInput.value)) {
      thresholdInput.value = String(state.intentThresholdPct);
      renderFillIntentHelp();
      return;
    }
    state.intentThresholdPct = Number(thresholdInput.value);
    renderFillIntentHelp();
    if (event.isTrusted && !_prefsReady) persistPrefField("intentThresholdPct", thresholdInput.value);
    applyFillMarkers();
    if (state.timeline) renderForSelected();
  });

  const fillScope = $("seg-fills-filter");
  const fillControl = PREF_CONTROLS.find(control => control.key === "fillMarkers");
  fillScope.addEventListener("change", () => {
    state.fillMarkers = readPref(fillControl);
    applyFillMarkers();
  });
  const storedScope = loadPrefs().fillMarkers;
  if (isValidPref(fillControl, storedScope)) applyPref(fillControl, storedScope);

  const fillSegs = {
    "seg-fill-style": (val) => { state.fillStyle = val === "bubble" ? "bubble" : "arrow"; },
    "seg-fill-text": (val) => { state.fillText = val !== "off"; },
    "seg-bubble-group": (val) => { state.bubbleGroup = val === "cluster" ? "cluster" : "order"; },
    "seg-bubble-size": (val) => { state.bubbleSize = val === "usd" ? "usd" : "pos"; },
  };
  for (const [id, apply] of Object.entries(fillSegs)) {
    $(id).querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => {
        $(id).querySelectorAll("button").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        apply(btn.dataset.val);
        $("bubble-options").hidden = state.fillStyle !== "bubble";
        applyFillMarkers();
      });
    });
  }

  $("seg-chart-type").querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      $("seg-chart-type").querySelectorAll("button").forEach(b => b.classList.toggle("active", b === btn));
      state.chartType = CHART_TYPES.includes(btn.dataset.val) ? btn.dataset.val : "candles";
      applyChartType();
    });
  });

  $("seg-order-mode").querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      $("seg-order-mode").querySelectorAll("button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.orderLineMode = btn.dataset.val === "full" ? "full" : "lifecycle";
      updateOrderModeUI();
      renderForSelected();
    });
  });

  $("seg-show-all").querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      if ($("seg-show-all").classList.contains("disabled")) return;
      $("seg-show-all").querySelectorAll("button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.showAllOrders = btn.dataset.val === "on";
      renderForSelected();
    });
  });
  updateOrderModeUI();

  $("ind-add").addEventListener("click", () => {
    if (!initialTimelineReady || !_prefsReady) return;
    const type = $("ind-type").value;
    const period = parseInt($("ind-period").value, 10);
    if (!(period >= 1) || period > 1000) return;
    addIndicator(type, period);
  });
  $("ind-period").addEventListener("keydown", e => { if (e.key === "Enter") $("ind-add").click(); });

  const redrawOrders = () => {
    if (state.timeline?.bars?.length) renderForSelected();
  };
  const applyOrderColor = (side, event) => {
    state.orderColors[side] = event.target.value;
    $("order-color-" + side + "-trigger").style.setProperty("--swatch", event.target.value);
    redrawOrders();
  };
  $("order-color-buy").addEventListener("input", e => applyOrderColor("buy", e));
  $("order-color-sell").addEventListener("input", e => applyOrderColor("sell", e));
  globalThis.TradeVizColorText = (key = "order_color.reset") => t(key);
  for (const side of ["buy", "sell"]) {
    const id = "order-color-" + side;
    TradeVizColors.attach({ input: $(id), trigger: $(id + "-trigger"), panel: $(id + "-panel"),
      reset: $(id + "-reset"), defaultColor: DEFAULT_ORDER_COLORS[side], label: () => t(side === "buy" ? "t.color_buy" : "t.color_sell"),
      onCommit: () => {
        if (_prefsReady) savePrefs();
        else persistPrefField(side === "buy" ? "colorBuy" : "colorSell", $(id).value);
      } });
  }
  const unfilledAlpha = $("order-unfilled-alpha");
  const unfilledAlphaVal = $("order-unfilled-alpha-val");
  unfilledAlpha.addEventListener("input", e => {
    const pct = Number(e.target.value);
    state.unfilledAlpha = pct / 100;
    unfilledAlphaVal.textContent = pct + "%";
    if (e.isTrusted && !_prefsReady) persistPrefField("unfilledAlpha", e.target.value);
    redrawOrders();
  });
  const filledAlpha = $("order-filled-alpha");
  const filledAlphaVal = $("order-filled-alpha-val");
  filledAlpha.addEventListener("input", e => {
    const pct = Number(e.target.value);
    state.filledAlpha = pct / 100;
    filledAlphaVal.textContent = pct + "%";
    if (e.isTrusted && !_prefsReady) persistPrefField("filledAlpha", e.target.value);
    redrawOrders();
  });
  for (const slider of [unfilledAlpha, filledAlpha]) {
    const fill = () => slider.style.setProperty("--pct",
      `${(Number(slider.value) - Number(slider.min)) / (Number(slider.max) - Number(slider.min)) * 100}%`);
    slider.addEventListener("input", fill);
    fill();
  }

  $("btn-lang").addEventListener("click", () => setLang(state.lang === "zh" ? "en" : "zh"));

  const saveIfPrefControl = (e) => {
    if (!e.isTrusted) return;
    const control = PREF_CONTROLS.find((pref) => {
      const root = $(pref.id);
      return root && (root === e.target || root.contains(e.target));
    });
    if (!control) return;
    if (_prefsReady) savePrefs();
    else persistPrefField(control.key, readPref(control));
  };
  document.addEventListener("click", saveIfPrefControl);
  document.addEventListener("change", saveIfPrefControl);

  const movableGroups = [els.segInterval, $("seg-chart-type"), els.btnPlay, els.btnPin].map((el) =>
    el.closest(".control-group"),
  );
  const groupHomes = movableGroups.map((node) => ({
    node,
    parent: node.parentNode,
    before: node.nextSibling,
  }));
  let maximizedBar = null;
  const setChartMaximized = (on) => {
    state.chartMaximized = on;
    const wrap = $("chart-price").closest(".chart-wrap");
    if (wrap) {
      wrap.classList.toggle("maximized", on);
      if (on) {
        maximizedBar = document.createElement("div");
        maximizedBar.className = "maximized-controls";
        wrap.insertBefore(maximizedBar, wrap.firstChild);
        for (const group of movableGroups) maximizedBar.appendChild(group);
      } else {
        for (const home of groupHomes) home.parent.insertBefore(home.node, home.before);
        if (maximizedBar) maximizedBar.remove();
        maximizedBar = null;
      }
    }
    $("btn-chart-full").textContent = on ? "✕" : "⛶";
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  };
  $("btn-chart-full").addEventListener("click", () => setChartMaximized(!state.chartMaximized));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.chartMaximized) setChartMaximized(false); });

  $("seg-snapshot").querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      $("seg-snapshot").querySelectorAll("button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.sidebarCollapsed = (btn.dataset.val === "hide");
      document.querySelector("main").classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    });
  });

  document.querySelectorAll("#orders-table thead th[data-sort]").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (state.ordersSort.length && state.ordersSort[0].key === key) {
        state.ordersSort[0].dir = -state.ordersSort[0].dir;
      } else {
        state.ordersSort = [{ key, dir: 1 },
                            ...state.ordersSort.filter(s => s.key !== key)];
      }
      updateOrdersSortIndicators();
      if (_lastOrdersBar) renderOrdersTable(_lastOrdersBar);
    });
  });
  updateOrdersSortIndicators();

  let chartTouchClickUntil = -Infinity;
  for (const { key } of chartPanes()) {
    for (const eventName of ["touchstart", "touchend", "touchcancel"]) {
      $("chart-" + key).addEventListener(eventName, () => {
        chartTouchClickUntil = performance.now() + 1000;
      }, { capture: true, passive: true });
    }
  }
  const choosePnlStartBar = (bar, expectedOpenT = bar?.t) => {
    const start = pnlStartForSelection(bar, expectedOpenT, state.interval, state.pnlDefaultStart);
    if (!start) {
      renderPnlStartStatus("pnl.status_unavailable");
      return false;
    }
    ++pnlStartRequestVersion;
    state.selectedT = expectedOpenT;
    setPnlStart(start);
    if (start.source === "default") renderPnlStartStatus("pnl.status_account_start");
    return true;
  };
  const pinChartBar = (bar) => {
    state.selectedT = bar.t;
    state.pinned = true;
    renderForSelected();
    renderPinState("pin.pinned_click");
    replayScrollAndMark();
  };
  let pnlPickPointer = null, bubblePickPointer = null;
  $("chart-price").addEventListener("pointerdown", (event) => {
    pnlPickPointer = state.pnlStartPicking && event.button === 0
      ? { x: event.clientX, y: event.clientY } : null;
    bubblePickPointer = null;
    if (state.pnlStartPicking || event.button !== 0 || event.pointerType === "touch") return;
    const rect = $("chart-price").querySelector("canvas")?.getBoundingClientRect();
    if (!rect || event.clientX < rect.left || event.clientX > rect.right
        || event.clientY < rect.top || event.clientY > rect.bottom) return;
    const bar = selectedBubbleBar({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    if (bar) bubblePickPointer = { x: event.clientX, y: event.clientY, bar };
  }, true);
  $("chart-price").addEventListener("click", (event) => {
    const bubblePick = bubblePickPointer;
    bubblePickPointer = null;
    if (bubblePick && !state.pnlStartPicking && performance.now() >= chartTouchClickUntil
        && Math.hypot(event.clientX - bubblePick.x, event.clientY - bubblePick.y) <= 8) {
      if (!state.pinned || state.selectedT !== bubblePick.bar.t) pinChartBar(bubblePick.bar);
      return;
    }
    if (!state.pnlStartPicking) return;
    event.stopPropagation();
    event.preventDefault();
    const pointer = pnlPickPointer;
    pnlPickPointer = null;
    if (pointer && Math.hypot(event.clientX - pointer.x,
      event.clientY - pointer.y) > 8) return;
    const rect = $("chart-price").getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const pane = priceChart.paneSize();
    if (x < 0 || x >= pane.width || y < 0 || y >= pane.height) return;
    const fromTouch = performance.now() < chartTouchClickUntil;
    afterChartViewSettles(() => {
      const time = priceChart.timeScale().coordinateToTime(x);
      if (typeof time !== "number") return;
      const index = bisectLeq(state.timeline.bars, time * 1000, "t");
      const bar = index < 0 ? null : state.timeline.bars[index];
      if (!choosePnlStartBar(bar, time * 1000)) return;
      if (fromTouch) return;
      state.pinned = true;
      renderPinState("pin.pinned_click");
      replayScrollAndMark();
    });
  }, true);
  subscribeChartClick(priceChart, param => {
    const fromTouch = performance.now() < chartTouchClickUntil;
    if (state.pnlStartPicking && !fromTouch) return;
    if (fromTouch && !state.pnlStartPicking) return;
    if (!param) return;
    const bubbleBar = !state.pnlStartPicking && selectedBubbleBar(param.point);
    if (!bubbleBar && !param.time) return;
    const tMs = bubbleBar ? bubbleBar.t : param.time * 1000;
    const idx = bisectLeq(state.timeline.bars, tMs, "t");
    const bar = idx < 0 ? null : state.timeline.bars[idx];
    if (state.pnlStartPicking) {
      if (!choosePnlStartBar(bar, tMs)) return;
      return;
    }
    if (!bar) return;
    pinChartBar(bar);
  });

  for (const { key, chart } of chartPanes().slice(1)) {
    const element = $("chart-" + key);
    let down = null;
    element.addEventListener("pointerdown", (event) => {
      down = event.button === 0 && event.pointerType !== "touch" ? { x: event.clientX, y: event.clientY } : null;
    }, true);
    element.addEventListener("click", (event) => {
      const start = down;
      down = null;
      if (!start || state.pnlStartPicking || performance.now() < chartTouchClickUntil) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) return;
      const rect = element.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const pane = chart.paneSize();
      if (x < 0 || x >= pane.width || y < 0 || y >= pane.height) return;
      afterChartViewSettles(() => {
        const time = chart.timeScale().coordinateToTime(x);
        if (typeof time !== "number") return;
        const index = bisectLeq(state.timeline.bars, time * 1000, "t");
        if (index >= 0) pinChartBar(state.timeline.bars[index]);
      });
    });
  }

  const unpinChart = () => {
    if (!state.pinned) return;
    stopPlay();
    state.pinned = false;
    renderPinState();
    replayScrollAndMark();
  };
  for (const { key } of chartPanes()) $("chart-" + key).addEventListener("dblclick", () => afterChartViewSettles(unpinChart));
}

function replayShortcutTarget(el) {
  return Boolean(el) && (el.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)
    || Boolean(el.closest?.('#pnl-start, .form-select, .tb-pop, .tb-trigger, .ind-editor, .pcr-app, [role="menu"], [role="listbox"], [role="separator"]')));
}

function bindReplayKeyboard() {
  let heldKey = null, frame = null, nextAt = 0;
  const release = () => {
    heldKey = null;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };
  const repeat = (now) => {
    frame = null;
    if (!heldKey || document.hidden || replayShortcutTarget(document.activeElement)) { release(); return; }
    if (now >= nextAt) {
      stepBy(heldKey === "ArrowLeft" ? -1 : 1);
      nextAt = performance.now() + 40;
    }
    frame = requestAnimationFrame(repeat);
  };
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing
      || replayShortcutTarget(event.target)) { release(); return; }
    if (!state.timeline?.bars?.length) { release(); return; }
    if (event.code === "Space" || event.key === " ") {
      event.preventDefault();
      if (event.repeat) return;
      if (state.playTimer) stopPlay();
      else startPlay();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      if (event.repeat || heldKey === event.key) return;
      release();
      heldKey = event.key;
      stepBy(heldKey === "ArrowLeft" ? -1 : 1);
      nextAt = performance.now() + 300;
      frame = requestAnimationFrame(repeat);
    }
  });
  document.addEventListener("keyup", (event) => { if (event.key === heldKey) release(); });
  document.addEventListener("focusin", (event) => { if (replayShortcutTarget(event.target)) release(); });
  document.addEventListener("pointerdown", release);
  document.addEventListener("visibilitychange", () => { if (document.hidden) release(); });
  window.addEventListener("blur", release);
}

function stepBy(delta) {
  const bars = state.timeline?.bars;
  if (!bars?.length) return;
  const idx = bisectLeq(bars, state.selectedT, "t");
  const next = Math.max(0, Math.min(bars.length - 1, idx + delta));
  if (state.pinned && state.selectedT === bars[next].t) return;
  state.selectedT = bars[next].t;
  state.pinned = true;
  renderForSelected();
  _rafPending = false;
  renderPinState();
  replayScrollAndMark();
  keepReplayInView(bars[next]);
}

function alignToLatest({ pin, span: wantSpan } = {}) {
  const bars = state.timeline && state.timeline.bars;
  if (!bars || !bars.length) return;
  clearArchivePlaceholder();
  const lastIdx = bars.length - 1;
  state.selectedT = bars[lastIdx].t;
  if (pin) state.pinned = true;
  const r = priceChart.timeScale().getVisibleLogicalRange();
  const span = wantSpan || (r && r.to > r.from ? r.to - r.from : defaultVisibleBars(bars));
  const range = { from: lastIdx - span + 2, to: lastIdx + 2 };
  for (const { chart } of chartPanes()) chart.timeScale().setVisibleLogicalRange(range);
  renderForSelected();
  renderPinState();
  updateOverlayMarker();
}

async function goToLatest({ pin = true, span: wantSpan } = {}) {
  if (!initialTimelineReady || !_prefsReady || state.timelineBusy || !state.timeline?.bars?.length) return;
  const getLatest = globalThis.TradeVizData?.getLatestCandleTime;
  if (typeof getLatest !== "function") { alignToLatest({ pin, span: wantSpan }); return; }
  const interval = state.interval;
  const range = priceChart.timeScale().getVisibleLogicalRange();
  const span = Math.min(MAX_VISIBLE_BARS, wantSpan ||
    (range && range.to > range.from ? range.to - range.from : defaultVisibleBars(state.timeline.bars)));
  const previous = { timeline: state.timeline, view: captureTimeView() };
  state.timelineBusy = true;
  ++state.timelineVersion;
  if (candleRangeLoadTimer !== null) clearTimeout(candleRangeLoadTimer);
  candleRangeLoadTimer = null;
  const buttons = els.segInterval.querySelectorAll("button");
  let loadingShown = false;
  const showLoading = () => {
    if (loadingShown) return;
    loadingShown = true;
    buttons.forEach(button => { button.disabled = true; });
    els.btnPinLatest.disabled = true;
    els.btnPinLatest.setAttribute("aria-busy", "true");
    els.intervalLoading.hidden = false;
    els.segInterval.setAttribute("aria-busy", "true");
  };
  const pendingRangeLoad = candleRangeLoadPromise;
  if (pendingRangeLoad) showLoading();
  const loadingTimer = setTimeout(showLoading, 120);
  try {
    await pendingRangeLoad;
    const latest = await getLatest(interval);
    if (!Number.isFinite(latest)) throw new Error("Latest candle unavailable");
    if (state.timeline.bars.at(-1)?.t === latest) {
      alignToLatest({ pin, span });
      return;
    }
    showLoading();
    const step = INTERVAL_MS[interval];
    await prepareTimelineArchive(interval, { from: latest - (span - 2) * step, to: latest + 2 * step });
    const timeline = await loadJson(`timeline_${interval}`);
    if (timeline.interval !== interval || !timeline.bars?.length) throw new Error("Invalid latest timeline");
    state.timeline = timeline;
    applyTimelineToCharts(null, { preserveVerticalScale: true });
    alignToLatest({ pin, span });
  } catch (error) {
    if (state.timeline !== previous.timeline) {
      state.timeline = previous.timeline;
      applyTimelineToCharts(previous.view);
    }
    console.error("[chart] Latest load failed", error);
  } finally {
    clearTimeout(loadingTimer);
    state.timelineBusy = false;
    buttons.forEach(button => { button.disabled = false; });
    els.btnPinLatest.disabled = false;
    els.btnPinLatest.setAttribute("aria-busy", "false");
    els.intervalLoading.hidden = true;
    els.segInterval.setAttribute("aria-busy", "false");
  }
}

function applyDefaultView() {
  const fullBtn = document.querySelector('#seg-order-mode button[data-val="full"]');
  if (fullBtn && !fullBtn.classList.contains("active")) fullBtn.click();
  const touchFirst = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  alignToLatest({ pin: !touchFirst, span: defaultVisibleBars(state.timeline && state.timeline.bars) });
}

const MIN_PANE_PX = 44;

function boardPixelPeriod(dpr) {
  for (let period = 1; period <= 20; period++) {
    if (Math.abs(period * dpr - Math.round(period * dpr)) < 0.0001) return period;
  }
  return 1;
}

function writeBoardPixel(el, key, value) {
  const next = Math.round(value * 64) / 64;
  const current = parseFloat(el.style.getPropertyValue(key));
  if (Number.isFinite(current) && Math.abs(next - current) <= 1 / 64) return false;
  el.style.setProperty(key, `${next}px`);
  return true;
}

function bindBoardPixelGrid() {
  const root = document.documentElement;
  const controls = document.querySelector(".controls");
  const main = document.querySelector("main");
  const side = main.querySelector(":scope > .side");
  const summary = side.firstElementChild;
  const panes = [...main.querySelectorAll(".chart-wrap")];
  const write = writeBoardPixel;
  let frame = 0;
  let resolution, watchedRatio;
  const align = () => {
    frame = 0;
    const dpr = window.devicePixelRatio || 1;
    if (watchedRatio !== dpr) {
      resolution?.removeEventListener("change", schedule);
      resolution = matchMedia(`(resolution: ${dpr}dppx)`);
      resolution.addEventListener("change", schedule);
      watchedRatio = dpr;
    }
    const period = boardPixelPeriod(dpr);
    const snap = value => Math.round(value / period) * period;
    const gap = Math.max(1, Math.round(parseFloat(getComputedStyle(root).getPropertyValue("--board-gap"))));
    write(root, "--board-gap-px", gap);
    const alignBottom = el => {
      const correction = parseFloat(el.style.getPropertyValue("--pixel-bottom-pad")) || 0;
      const natural = el.getBoundingClientRect().bottom - correction;
      const base = parseFloat(getComputedStyle(el).paddingBottom) - correction;
      const target = snap(natural) - natural >= -base ? snap(natural) : Math.ceil(natural / period) * period;
      write(el, "--pixel-bottom-pad", target - natural);
    };
    alignBottom(controls);
    const sideRect = side.getBoundingClientRect();
    const columns = innerWidth > 1100 && !main.classList.contains("sidebar-collapsed");
    write(side, "--pixel-side-left", columns ? Math.ceil((sideRect.left - gap) / period) * period + gap - sideRect.left : 0);
    const topCorrection = parseFloat(getComputedStyle(side).marginTop) || 0;
    const naturalTop = sideRect.top - topCorrection;
    write(side, "--pixel-side-top", snap(naturalTop - gap) + gap - naturalTop);
    alignBottom(summary);
    for (const pane of panes) {
      const mobileHeight = parseFloat(getComputedStyle(pane).getPropertyValue("--mobile-chart-height"));
      if (Number.isFinite(mobileHeight)) write(pane, "--pixel-mobile-height", snap(mobileHeight));
      const rect = pane.getBoundingClientRect();
      const full = pane.classList.contains("maximized");
      write(pane, "--pixel-chart-top", full ? 0 : snap(rect.top - gap) + gap - rect.top);
      write(pane, "--pixel-chart-bottom", full ? 0 : rect.bottom - snap(rect.bottom));
      write(pane, "--pixel-chart-right", full || !columns ? 0 : rect.right - Math.ceil(rect.right / period) * period);
    }
    for (const divider of main.querySelectorAll(".chart-split, .column-split")) {
      const rect = divider.getBoundingClientRect();
      const surface = divider.previousElementSibling.querySelector(".chart").getBoundingClientRect();
      write(divider, "--pixel-split-offset", divider.classList.contains("chart-split")
        ? surface.bottom - rect.top : surface.right - rect.left);
    }
    root.dataset.boardPixelRatio = String(dpr);
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(align); };
  const observer = new ResizeObserver(schedule);
  for (const el of [controls, main, side, summary, ...panes]) observer.observe(el);
  new MutationObserver(schedule).observe(root, { attributes: true, attributeFilter: ["style"] });
  window.addEventListener("resize", schedule);
  align();
}

function bindDashboardSplitter() {
  const main = document.querySelector("main");
  const bar = main.querySelector(".column-split");
  const charts = main.querySelector(".charts");
  const side = main.querySelector(".side");
  const minChart = 640;
  const minSide = 280;
  const measure = () => ({
    chart: charts.getBoundingClientRect().width,
    side: side.getBoundingClientRect().width,
  });
  const updateAria = () => {
    const { chart, side: sideWidth } = measure();
    const total = chart + sideWidth;
    if (total > 0) bar.setAttribute("aria-valuenow", String(Math.round(sideWidth / total * 100)));
  };
  const setSideWidth = (width, total) => {
    const next = Math.max(minSide, Math.min(total - minChart, width));
    main.style.setProperty("--side-width", next + "px");
    bar.setAttribute("aria-valuenow", String(Math.round(next / total * 100)));
  };
  const sizeObserver = new ResizeObserver(updateAria);
  sizeObserver.observe(charts);
  sizeObserver.observe(side);
  updateAria();
  bar.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key) ||
        main.classList.contains("sidebar-collapsed") ||
        window.matchMedia("(max-width: 1100px)").matches) return;
    const { chart, side: sideWidth } = measure();
    const total = chart + sideWidth;
    event.preventDefault();
    if (total <= minChart + minSide) return;
    setSideWidth(sideWidth + (event.key === "ArrowLeft" ? 16 : -16), total);
  });
  bar.addEventListener("pointerdown", down => {
    if (down.button !== 0 || main.classList.contains("sidebar-collapsed") ||
        window.matchMedia("(max-width: 1100px)").matches) return;
    const { chart, side: sideWidth } = measure();
    const total = chart + sideWidth;
    if (total <= minChart + minSide) return;
    const startX = down.clientX;
    const onMove = move => {
      if (move.pointerId !== down.pointerId) return;
      setSideWidth(sideWidth - (move.clientX - startX), total);
    };
    const onUp = end => {
      if (end.pointerId !== down.pointerId) return;
      bar.removeEventListener("pointermove", onMove);
      bar.removeEventListener("pointerup", onUp);
      bar.removeEventListener("pointercancel", onUp);
      bar.removeEventListener("lostpointercapture", onUp);
      bar.classList.remove("dragging");
      document.body.classList.remove("resizing-columns");
    };
    bar.setPointerCapture(down.pointerId);
    bar.classList.add("dragging");
    document.body.classList.add("resizing-columns");
    bar.addEventListener("pointermove", onMove);
    bar.addEventListener("pointerup", onUp);
    bar.addEventListener("pointercancel", onUp);
    bar.addEventListener("lostpointercapture", onUp);
    down.preventDefault();
  });
}

function paneGrow(el) {
  const value = parseFloat(getComputedStyle(el).flexGrow);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function bindChartSplitters() {
  const panes = [...document.querySelectorAll(".charts > .chart-wrap")];
  for (const bar of document.querySelectorAll(".charts > .chart-split")) {
    bar.addEventListener("pointerdown", (down) => {
      const i = Number(bar.dataset.split);
      const above = panes[i];
      const below = panes[i + 1];
      if (!above || !below) return;
      const startY = down.clientY;
      const hAbove = above.getBoundingClientRect().height;
      const hBelow = below.getBoundingClientRect().height;
      const total = hAbove + hBelow;
      if (total <= 0) return;
      const growTotal = paneGrow(above) + paneGrow(below);

      const onMove = (move) => {
        const dy = Math.max(MIN_PANE_PX - hAbove,
                            Math.min(hBelow - MIN_PANE_PX, move.clientY - startY));
        const share = (hAbove + dy) / total;
        above.style.flexGrow = String(growTotal * share);
        below.style.flexGrow = String(growTotal * (1 - share));
      };
      const onUp = () => {
        bar.removeEventListener("pointermove", onMove);
        bar.removeEventListener("pointerup", onUp);
        bar.removeEventListener("pointercancel", onUp);
        bar.classList.remove("dragging");
        document.body.classList.remove("resizing-panes");
      };
      bar.setPointerCapture(down.pointerId);
      bar.classList.add("dragging");
      document.body.classList.add("resizing-panes");
      bar.addEventListener("pointermove", onMove);
      bar.addEventListener("pointerup", onUp);
      bar.addEventListener("pointercancel", onUp);
      down.preventDefault();
    });
  }
}

function scrollToSelected() {
  const bars = state.timeline.bars;
  const idx = bisectLeq(bars, state.selectedT, "t");
  if (idx < 0) return;
  const r = priceChart.timeScale().getVisibleLogicalRange();
  if (!r) return;
  const margin = (r.to - r.from) * 0.1;
  if (idx < r.from + margin || idx > r.to - margin) {
    const span = r.to - r.from;
    priceChart.timeScale().setVisibleLogicalRange({
      from: idx - span / 2,
      to: idx + span / 2,
    });
  }
}

function makeMarkerPrimitive() {
  const st = { chart: null, series: null, requestUpdate: null, marker: null };
  const priceCoordinate = () => Number.isFinite(st.marker?.value) && st.series
    ? st.series.priceToCoordinate(st.marker.value) : null;
  const priceAxisView = {
    coordinate: () => -1e9,
    fixedCoordinate: () => priceCoordinate() ?? -1e9,
    text: () => Number.isFinite(st.marker?.value) && st.series
      ? st.series.priceFormatter().format(st.marker.value) : "",
    textColor: () => "#ffffff",
    backColor: () => st.chart.options().crosshair.horzLine.labelBackgroundColor,
    visible: () => {
      const y = priceCoordinate();
      return Number.isFinite(y) && y >= 0 && y <= st.chart.paneSize().height
        && st.chart.options().crosshair.horzLine.labelVisible;
    },
    tickVisible: () => false,
  };
  const dashPattern = (w, style) =>
    ({ 0: [], 1: [w, w], 2: [2 * w, 2 * w], 3: [6 * w, 6 * w], 4: [w, 4 * w] })[style] || [];

  const renderer = {
    draw(target) {
      if (!st.marker || !st.chart || !st.series || st.marker.linesVisible === false) return;
      const x = st.chart.timeScale().timeToCoordinate(st.marker.time);
      const y = st.marker.value != null ? st.series.priceToCoordinate(st.marker.value) : null;
      if (x == null && y == null) return;
      const cross = st.chart.options().crosshair;
      target.useBitmapCoordinateSpace((scope) => {
        const ctx = scope.context;
        ctx.save();
        ctx.lineCap = "butt";
        const stroke = (opt, coord, ratio, from, to, vertical) => {
          ctx.lineWidth = Math.floor(opt.width * ratio);
          ctx.strokeStyle = opt.color;
          ctx.setLineDash(dashPattern(ctx.lineWidth, opt.style));
          const at = Math.round(coord * ratio) + (ctx.lineWidth % 2 ? 0.5 : 0);
          ctx.beginPath();
          if (vertical) { ctx.moveTo(at, from); ctx.lineTo(at, to); }
          else { ctx.moveTo(from, at); ctx.lineTo(to, at); }
          ctx.stroke();
        };
        if (x != null) {
          stroke(cross.vertLine, x, scope.horizontalPixelRatio, 0, scope.bitmapSize.height, true);
        }
        if (y != null) {
          stroke(cross.horzLine, y, scope.verticalPixelRatio, 0, scope.bitmapSize.width, false);
        }
        ctx.restore();
      });
    },
  };
  const paneView = { renderer: () => renderer, zOrder: () => "top" };
  return {
    attached(p) { st.chart = p.chart; st.series = p.series; st.requestUpdate = p.requestUpdate; },
    detached() { st.chart = null; st.series = null; st.requestUpdate = null; },
    paneViews() { return [paneView]; },
    priceAxisViews() { return [priceAxisView]; },
    updateAllViews() {},
    setMarker(marker) { st.marker = marker; if (st.requestUpdate) st.requestUpdate(); },
    getMarker() { return st.marker; },
  };
}

function showReplayMarker(bar) {
  const tSec = Math.floor(bar.t / 1000);
  const linesVisible = state.replayMode !== "history";
  if (priceMarker) priceMarker.setMarker({ time: tSec, value: bar.c, linesVisible });
  if (levMarker) levMarker.setMarker({ time: tSec, value: bar.lev != null ? bar.lev : null, linesVisible });
  if (pnlMarker) pnlMarker.setMarker({ time: tSec, value: pnlChartValue(bar), linesVisible });
}
function clearReplayMarker() {
  if (priceMarker) priceMarker.setMarker(null);
  if (levMarker) levMarker.setMarker(null);
  if (pnlMarker) pnlMarker.setMarker(null);
}

function setCrosshairMode(mode) {
  for (const pane of chartPanes()) {
    try {
      if (pane.chart.options().crosshair.mode !== mode) pane.chart.applyOptions({ crosshair: { mode } });
    } catch (e) { }
  }
}

function updateOverlayMarker() {
  const bars = state.timeline && state.timeline.bars;
  const i = bars && bars.length ? bisectLeq(bars, state.selectedT, "t") : -1;
  const marked = state.pinned && i >= 0 && state.selectedT <= bars[i].T;
  if (marked) showReplayMarker(bars[i]);
  else clearReplayMarker();
  renderLatestPriceLine();
}

let latestPriceLineKey = null;
function renderLatestPriceLine() {
  const hide = (state.replayMode !== "history" && state.pinned) || Boolean(state.playTimer);
  const key = hide ? "hidden" : state.chartType;
  if (key === latestPriceLineKey || !priceSeries) return;
  latestPriceLineKey = key;
  const shown = hide ? null : chartTypeSeries();
  for (const series of [priceSeries, priceLineSeries]) {
    series?.applyOptions({ priceLineVisible: series === shown });
  }
}

function replayScrollAndMark() {
  const bars = state.timeline && state.timeline.bars;
  if (!bars || !bars.length) return;
  updateOverlayMarker();
  if (state.replayMode === "history") {
    const nowSec = replayNowSec();
    const i = bisectLeq(bars, nowSec * 1000, "t");
    if (i < 0) return;
    const r = priceChart.timeScale().getVisibleLogicalRange();
    const span = (r && r.to > r.from) ? (r.to - r.from) : defaultVisibleBars(bars);
    priceChart.timeScale().setVisibleLogicalRange({ from: i - span + 1, to: i + 1 });
  } else if (state.pinned) {
    scrollToSelected();
  }
}

function keepReplayInView(bar) {
  if (!bar) return;
  const readings = { price: [bar.h, bar.l], lev: [bar.lev], pnl: [pnlChartValue(bar)] };
  for (const { key, chart, series } of chartPanes()) {
    const pan = verticalPans[key];
    if (!pan || (chart.priceScale("right").options().autoScale && !pan.panned())) continue;
    const height = chart.paneSize().height;
    const outside = readings[key].some((value) => {
      const y = Number.isFinite(value) ? series.priceToCoordinate(value) : null;
      return y != null && (y < 0 || y > height);
    });
    if (outside) pan.reset();
  }
}

function setShowFuture(showFuture) {
  state.replayMode = showFuture ? "overlay" : "history";
  renderForSelected();
  replayScrollAndMark();
}

function currentSpeed() {
  const v = Number(els.playSpeed.value);
  return (v && v > 0) ? v : 2;
}

async function ensureReplayAhead(timer) {
  const interval = state.interval, version = state.timelineVersion;
  const active = () => state.playTimer === timer && state.interval === interval &&
    state.timelineVersion === version && !state.timelineBusy;
  await candleRangeLoadPromise;
  if (!active()) return;
  const bars = state.timeline.bars;
  if (bars[0].t <= state.selectedT && bars.at(-1).t > state.selectedT) return;
  const getLatest = globalThis.TradeVizData?.getLatestCandleTime;
  if (typeof getLatest !== "function") return;
  const latest = await getLatest(interval);
  if (!active()) return;
  if (!Number.isFinite(latest)) throw new Error("Latest replay candle unavailable");
  let from = state.selectedT;
  while (active() && from < latest) {
    const to = Math.min(latest, from + MAX_VISIBLE_BARS * INTERVAL_MS[interval]);
    const result = await loadCandleRange(null, { from, to });
    if (!active()) return;
    if (result === null) throw new Error("Replay candle range unavailable");
    if (state.timeline.bars.at(-1).t > state.selectedT) return;
    from = to;
  }
}

function scheduleNextPlayTick() {
  const speed = currentSpeed();
  const stepPerTick = speed > 40 ? Math.max(1, Math.round(speed / 30)) : 1;
  const intervalMs = Math.max(16, Math.round(stepPerTick * 1000 / speed));
  const timer = setTimeout(async () => {
    if (state.playTimer !== timer) return;
    let bars = state.timeline.bars;
    const beforeLoadIndex = bisectLeq(bars, state.selectedT);
    if (beforeLoadIndex < 0 || beforeLoadIndex >= bars.length - 1) {
      try { await ensureReplayAhead(timer); }
      catch (error) {
        if (state.playTimer === timer) {
          console.error("[chart] Replay range load failed", error);
          stopPlay();
        }
        return;
      }
    }
    if (state.playTimer !== timer) return;
    bars = state.timeline.bars;
    const index = bisectLeq(bars, state.selectedT);
    if (index >= bars.length - 1) { stopPlay(); return; }
    const next = bars[Math.min(bars.length - 1, index + stepPerTick)];
    state.selectedT = next.t;
    renderForSelected();
    replayScrollAndMark();
    keepReplayInView(next);
    els.pinState.textContent = t("pin.playing", fmtTs(state.selectedT));
    scheduleNextPlayTick();
  }, intervalMs);
  state.playTimer = timer;
}

function startPlay() {
  const bars = state.timeline?.bars;
  if (!bars?.length) return;
  state.pinned = true;
  renderPinState();
  scheduleNextPlayTick();
  renderPlayButton();
  updateOverlayMarker();
}

function stopPlay() {
  if (state.playTimer) {
    clearTimeout(state.playTimer);
    state.playTimer = null;
  }
  renderPlayButton();
  renderPinState();
  updateOverlayMarker();
}

async function main() {
  applyStaticI18n();
  document.title = t("app.title");
  renderChartSymbol();
  try {
    bindBoardPixelGrid();
    makeCharts();
    bindControls();
    bindChartSplitters();
    bindDashboardSplitter();
    applyStoredInterval();
    await loadAll();
    renderSummaryCards();
    for (;;) {
      const interval = pendingInitialInterval ?? state.interval;
      pendingInitialInterval = null;
      state.interval = interval;
      let loaded;
      try {
        loaded = await loadTimeline(interval);
      } catch (error) {
        if (pendingInitialInterval && pendingInitialInterval !== interval) continue;
        throw error;
      }
      if (!loaded && !pendingInitialInterval) throw new Error("Initial candle timeline unavailable");
      if (pendingInitialInterval && pendingInitialInterval !== interval) continue;
      if (!loaded) continue;
      break;
    }
    els.intervalLoading.hidden = true;
    els.segInterval.setAttribute("aria-busy", "false");
    els.segInterval.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("active", button.dataset.val === state.interval);
    });
    applyTimelineToCharts();
    initialTimelineReady = true;
    void loadCashFlows();
    applyDefaultView();
    applyStoredPrefs();
    await restorePnlStartPreference();
    applyLang();
    markPrefsReady();
    els.btnPinLatest.disabled = false;
  } catch (e) {
    els.intervalLoading.hidden = true;
    els.segInterval.setAttribute("aria-busy", "false");
    console.error(e);
    document.body.insertAdjacentHTML("afterbegin",
      `<div style="background:#5a1a1a;color:#fff;padding:12px;font-family:monospace">`
      + t("err.load", String(e.message || e))
      + `</div>`);
  }
}

main();
