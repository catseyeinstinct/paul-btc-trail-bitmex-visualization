"use strict";

(function installBitmexSite(global) {
  const RESTART_MINUTE = Date.parse("2022-11-09T12:00:00Z");
  let presets = null;

  function renderSummaryCards(summary) {
    const endsAt = summary.dataset_window?.last_time;
    document.getElementById("card-update").textContent = endsAt ? fmtTs(Date.parse(endsAt)) : "—";
    for (const id of ["footer-boundary-note", "footer-assumption-note", "footer-guess-note"]) {
      const note = document.getElementById(id);
      if (note) note.hidden = !summary.placement_cutoff;
    }
    void renderPnlPresets();
  }

  function renderSelected(bar) {
    const cell = (id) => document.getElementById(id);
    for (const [id, key] of [["sel-lev-spot", "lev_spot"], ["sel-lev-xbtusd", "lev_xbtusd"]]) {
      const value = bar?.[key];
      cell(id).textContent = value != null && value > 0 ? "+" + fmtLev(value) : fmtLev(value);
      cell(id).className = "v";
    }
  }

  async function renderPnlPresets() {
    const container = document.getElementById("pnl-start-presets");
    if (!container) return;
    presets ??= (async () => {
      const restart = await global.TradeVizData.getPnlStartAt(RESTART_MINUTE, "1m").catch(() => null);
      const btc = restart && Number.isFinite(restart.av) && Number.isFinite(restart.c) && restart.av > 0 && restart.c > 0
        ? restart.av / restart.c : null;
      return [{ key: "pnl.preset_restart", openT: RESTART_MINUTE, equityBtc: btc }];
    })().catch((error) => { presets = null; throw error; });
    const list = await presets;
    container.replaceChildren(...list.map((preset) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.openT = String(preset.openT);
      button.textContent = t(preset.key, fmtPnlStartUtc(preset.openT), preset.equityBtc?.toFixed(8) ?? "—");
      button.addEventListener("click", () => applyPnlPreset(preset.openT));
      return button;
    }));
  }

  async function applyPnlPreset(openT) {
    const version = ++pnlStartRequestVersion;
    setPnlStartPicking(false);
    renderPnlStartStatus("pnl.status_loading");
    try {
      const bar = await global.TradeVizData.getPnlStartAt(openT, "1m");
      if (version !== pnlStartRequestVersion) return;
      if (!bar) {
        renderPnlStartStatus("pnl.status_unavailable");
        return;
      }
      setPnlStart({ requestedT: bar.T, bar, source: "minute", interval: "1m" }, { preservePicking: true });
      els.pnlStartMenu.open = false;
    } catch (error) {
      console.error(error);
      if (version === pnlStartRequestVersion) renderPnlStartStatus("pnl.status_error");
    }
  }

  const orderExtension = global.BitmexGuesses?.wrap(global.BitmexOrders) ?? global.BitmexOrders;
  global.TradeVizSite = Object.freeze({
    exportBase: "data/export/",
    i18n: Object.freeze({
      ...global.BitmexGuesses?.i18n,
      "app.title": {
        "zh": "Paul Wei · BitMEX BTC 交易轨迹",
        "en": "Paul Wei · BitMEX BTC Trade Trail"
      },
      "hdr.track_link": {
        "zh": "（Hyperliquid 追踪链接）",
        "en": "(Hyperliquid tracker)"
      },
      "card.closure": {
        "zh": "BitMEX 交易所关闭",
        "en": "BitMEX Exchange Closed"
      },
      "card.update": {
        "zh": "账户最后记录",
        "en": "Last Account Record"
      },
      "card.export": {
        "zh": "账户归档导出",
        "en": "Account Archive Export"
      },
      "chart.symbol": {
        "zh": "XBTUSD",
        "en": "XBTUSD"
      },
      "chart.venue": {
        "zh": "BitMEX",
        "en": "BitMEX"
      },
      "chart.lev": {
        "zh": "杠杆 %（(XBTUSD 合约价值 + 账户价值) / 账户价值，有方向）",
        "en": "Leverage % ((XBTUSD contract value + account value) / account value, signed)"
      },
      "kv.lev_spot": {
        "zh": "其中 BTC 现货",
        "en": "of which BTC spot"
      },
      "kv.lev_xbtusd": {
        "zh": "其中 BTC 合约",
        "en": "of which BTC contract"
      },
      "chart.pnl_detail": {
        "zh": "（账户价值 − 本金与范围外资金流）",
        "en": " (account value − stake and out-of-scope flows)"
      },
      "chart.pnl_period_detail": {
        "zh": "（账户价值变动 − 期间范围外资金流）",
        "en": " (account value change − out-of-scope flows)"
      },
      "chart.pnl": {
        "zh": "现货+合约累积盈亏",
        "en": "Spot + Perp Cumulative PnL"
      },
      "kv.pnl": {
        "zh": "现货+合约累积盈亏 (USD)",
        "en": "Spot + Perp PnL (USD)"
      },
      "kv.pnl_btc": {
        "zh": "现货+合约累积盈亏 (BTC)",
        "en": "Spot + Perp PnL (BTC)"
      },
      "t.pnl_usd": {
        "zh": "以 BTC 钱包余额 + XBTUSD 浮盈计算美元价值变化；现货买卖与兑换按配对的 USDT 实付实收调整本金，出入金、划转和其他合约结算按 BitMEX 事件分钟价调整。XBTUSD 已实现盈亏、手续费和资金费以实际钱包入账为准；不含 USDT 钱包和其他合约浮盈。",
        "en": "USD value change in observed BTC wallet balance plus XBTUSD unrealised PnL. Spot trades and conversions use matched USDT paid or received to adjust capital; deposits, withdrawals, transfers and other-contract settlements use native BitMEX event-minute prices. XBTUSD realised PnL, fees and funding enter on observed wallet posting; USDT wallet and other-contract unrealised PnL are excluded."
      },
      "t.pnl_btc": {
        "zh": "BTC 本位盈亏 = 终点 BTC 钱包及 XBTUSD 浮盈 − 起点同口径 BTC 本位账户价值 − 区间范围外 BTC 流水；现货兑换、出入金及其他合约结算以实际 BTC 入账扣除，不是美元盈亏按现价折算。",
        "en": "Native BTC PnL = ending BTC wallet plus XBTUSD unrealised PnL minus the same starting BTC-denominated account value and non-scope BTC flows. Spot swaps, external cash and other-contract settlements use actual BTC postings, not USD PnL converted at the current price."
      },
      "t.pnl_period_usd": {
        "zh": "以 BTC 钱包余额 + XBTUSD 浮盈计算美元价值变化；现货买卖与兑换按配对的 USDT 实付实收调整本金，出入金、划转和其他合约结算按 BitMEX 事件分钟价调整。XBTUSD 已实现盈亏、手续费和资金费以实际钱包入账为准；不含 USDT 钱包和其他合约浮盈。",
        "en": "USD value change in observed BTC wallet balance plus XBTUSD unrealised PnL. Spot trades and conversions use matched USDT paid or received to adjust capital; deposits, withdrawals, transfers and other-contract settlements use native BitMEX event-minute prices. XBTUSD realised PnL, fees and funding enter on observed wallet posting; USDT wallet and other-contract unrealised PnL are excluded."
      },
      "t.pnl_period_btc": {
        "zh": "BTC 本位盈亏 = 终点 BTC 钱包及 XBTUSD 浮盈 − 起点同口径 BTC 本位账户价值 − 区间范围外 BTC 流水；现货兑换、出入金及其他合约结算以实际 BTC 入账扣除，不是美元盈亏按现价折算。",
        "en": "Native BTC PnL = ending BTC wallet plus XBTUSD unrealised PnL minus the same starting BTC-denominated account value and non-scope BTC flows. Spot swaps, external cash and other-contract settlements use actual BTC postings, not USD PnL converted at the current price."
      },
      "pnl.status_unavailable": {
        "zh": "所选位置没有可用 K 线、有效 BTC 价格或正值账户价值；起点未改变。",
        "en": "No usable candle, valid BTC price or positive account value (this view) is available here; start unchanged."
      },
      "panel.orders": {
        "zh": "订单及事件（本 K 线）",
        "en": "Orders & Events (this candle)"
      },
      "orders.empty": {
        "zh": "该根 K 线内没有订单或订单事件。",
        "en": "No orders or order events during this candle."
      },
      "orders.meta": {
        "zh": "百分比 = 订单名义价值 / 当时账户价值。每条订单的最终命运用 badge 标出：<span class=\"badge ok\">成交</span> / <span class=\"badge open\">在挂</span> / <span class=\"badge canceled\">撤销</span>。标「事件」的是订单事件的独立观测，不代表持续在挂。点表头排序（再点切换升/降，新点的列成为第一优先级，其余降为次级）。默认：买单在上、卖单在下，组内价格从低到高。 ",
        "en": "Percent = order notional / account value at that time. Each order's final fate is tagged: <span class=\"badge ok\">Filled</span> / <span class=\"badge open\">Open</span> / <span class=\"badge canceled\">Canceled</span>. Rows tagged Event are independent observations of order events, not continuous resting intervals. Click a header to sort (click again to flip; the clicked column becomes the primary key, the rest demote). Default: buys on top, sells below, price low→high. "
      },
      "th.created": {
        "zh": "起点",
        "en": "Start"
      },
      "t.fills_taker": {
        "zh": "只显示主动 / taker 成交（Paul 主动发起的）",
        "en": "Only taker fills (Paul-initiated)"
      },
      "t.show_on": {
        "zh": "一次性画出归档中订单各自可证的存活区间，与选中时刻无关；开启「假设挂单时长」时，假设的延长部分用淡线区分",
        "en": "Draw archived orders over each provable interval, independent of the selected time; when Assumed Resting Time is on, assumed extensions appear as faint lines"
      },
      "t.om_lifecycle": {
        "zh": "每条挂单按可证明在挂的区间画线；开启「假设挂单时长」时，假设的延长部分用淡线区分",
        "en": "Draw each order over its provable interval; when Assumed Resting Time is on, assumed extensions appear as faint lines"
      },
      "t.unfilled_alpha": {
        "zh": "未成交挂单线（虚线）画多浓。Paul 撤掉的单很多，满浓度会把成交过的线埋掉，调淡能让它们显出来；想看他挂过哪些单就调回去",
        "en": "How strongly unfilled order lines (dotted) are drawn. Paul canceled a great many orders, so fading them lets the filled ones show; turn it back up to study what he placed"
      },
      "ctl.assume": {
        "zh": "假设挂单时长",
        "en": "Assumed Resting Time"
      },
      "assume.filled": {
        "zh": "成交单",
        "en": "Filled"
      },
      "assume.unfilled": {
        "zh": "未成交",
        "en": "Unfilled"
      },
      "assume.unit": {
        "zh": "天",
        "en": "d"
      },
      "t.assume": {
        "zh": "2023 年 10 月起归档不再记录下单时刻，那之后的挂单默认只剩一个点。按这里设的天数假设它们在结束前已经挂了这么久（两个天数都设为 0 就不补），补出来的部分线型不变（成交单实线、未成交单点线），只是画得更淡——意思是「可能挂过」，不是观测。默认成交单 1 天、未成交单 2 天；和「AI 修复下单时间」同时生效时，每单取更早的起点。被成交记录或历史快照证明的部分照常画，不调淡；假设只会往前补，而且不会越过两个时刻：一是市价最后一次穿过这个价位的时刻——挂着的单被价格穿过就一定会成交，所以它不可能更早就挂在那儿；二是历史快照看到它还挂在别的价位上的时刻。所以设了 10 天，很多单实际补不满：按 5 / 10 天算，约三分之二的单会被穿价截短。市价单、以及一挂上去就主动吃单成交的限价单不补。设天数可以参考实测：成交单挂 5 天以内的，BitMEX 2020–2023 占 99%、Hyperliquid 2025–2026 占 79%；未成交单挂 10 天以内的，分别占 97%、91%；大多数单实际挂得更短（中位数：成交单 1.9 小时 / 1.3 天，未成交单 13.9 小时 / 7.1 小时）。上限 50 天：Hyperliquid 实测最长 52.2 天，BitMEX 同一价位能证明的最长 49.6 天。",
        "en": "From October 2023 the archive stopped recording placement times, so later orders collapse to a single point by default. Each such order is assumed to have rested for the days set here before it ended (set both to 0 to turn this off), drawn in the order's usual style (solid if filled, dotted if not) but fainter - it means \"may have been resting\", not an observation. Filled orders default to 1 day and unfilled orders to 2 days; with AI-restored placement times also ticked, each order takes the earlier start. Anything already proven by fills or historical snapshots is drawn as usual, not faded; the assumption only extends backwards, and never past two moments: the last time the market traded through the order's price (a resting order that the price trades through always fills, so it cannot have been sitting there earlier), and any moment a historical snapshot saw it at a different price. So a 10-day setting often cannot be filled in full - at 5 / 10 days about two thirds of orders are cut short by the trade-through limit. Market orders, and limit orders that took liquidity the moment they were placed, are not extended. For choosing days, measured data: 99% of BitMEX 2020-2023 and 79% of Hyperliquid 2025-2026 filled orders rested 5 days or less; 97% and 91% of unfilled orders rested 10 days or less; most orders rested far less (medians: filled 1.9h / 1.3d, unfilled 13.9h / 7.1h). The cap is 50 days: Hyperliquid's longest measured order lasted 52.2 days, and the longest BitMEX order provably unchanged at one price lasted 49.6 days."
      },
      "t.assume_filled": {
        "zh": "最终成交的单假设挂了多少天（0–50）",
        "en": "Days a filled order is assumed to have rested (0-50)"
      },
      "t.assume_unfilled": {
        "zh": "最终没成交、被撤掉的单假设挂了多少天（0–50）",
        "en": "Days an unfilled (canceled) order is assumed to have rested (0-50)"
      },
      "badge.evidence": {
        "zh": "快照",
        "en": "Snapshot"
      },
      "badge.event": {
        "zh": "事件",
        "en": "Event"
      },
      "badge.new": {
        "zh": "新建",
        "en": "New"
      },
      "badge.replaced": {
        "zh": "改单",
        "en": "Replaced"
      },
      "badge.triggered": {
        "zh": "触发",
        "en": "Triggered"
      },
      "badge.assumed": {
        "zh": "假设",
        "en": "Assumed"
      },
      "badge.partial_canceled": {
        "zh": "部分成交·撤销",
        "en": "Partial fill · canceled"
      },
      "t.event": {
        "zh": "9 月归档的真实订单事件：仅证明所示时刻的价位和数量；不推断此前或之后连续在挂。",
        "en": "Order event from the September archive: price and quantity are observed at this instant; continuous resting before or after it is not inferred."
      },
      "t.event_start": {
        "zh": "9 月归档在此时刻观测到订单状态；零散事件不足以证明它到终态始终未改价。",
        "en": "The September archive observed this order's state at this instant; sparse events do not prove its price was unchanged through the terminal state."
      },
      "t.evidence": {
        "zh": "这一行来自数据仓库的历史快照：快照那一刻这张单还挂着，价格就是这里显示的；之后它改过价，最终以另一个价格成交或撤销，不是归档终态仍在挂。起点是快照记录的最后一次改动，终点是那份快照的数据截止时刻，两端都是观测。",
        "en": "This row comes from a historical snapshot of the data repository: at that moment the order was still resting at the price shown here; it was amended later and finally filled or canceled at another price, not an order still open at the archive end. The start is the last change the snapshot recorded and the end is that snapshot's data cutoff - both are observations."
      },
      "t.assumed": {
        "zh": "这张单在这根 K 线上算「在挂」，只是因为开了「假设挂单时长」。起点列显示的是假设起点，不是观测。",
        "en": "This order counts as live on this bar only because Assumed Resting Time is on. The start shown is the assumed start, not an observation."
      },
      "t.orders_inferred": {
        "zh": "这张单真实挂在盘口上的时间比显示的更长。两种成因：一是归档自 2023 年 10 月起不再记录下单时刻（那之后所有订单都是这种情况）；二是这张单改过价，只保留了最后一个价位和最后一次改单时刻。",
        "en": "This order sat on the book longer than shown. Two causes: the archive stopped recording placement times in October 2023 (every order after that is affected), or the order was amended and only its final price and last amend time survive."
      },
      "tbl.executed_size": {
        "zh": "已成交",
        "en": "Filled"
      },
      "tbl.canceled_remainder": {
        "zh": "剩余撤销",
        "en": "Remainder canceled"
      },
      "chart.placement_cutoff": {
        "zh": "后续订单缺失下单时间",
        "en": "Later orders lack placement times"
      },
      "pnl.preset_restart": {
        "zh": "从 1 BTC 重新开始\n{0}\n实际权益 {1} BTC",
        "en": "Restart from 1 BTC\n{0}\nActual equity {1} BTC"
      },
      "footer.bm_value": {
        "zh": "<strong>账户价值（本视图）</strong> = BTC 钱包余额 + XBTUSD 浮盈，按 BTC 现价折成美元。不包括 USDT 钱包余额和其他合约浮盈；因此不是整个 BitMEX 账户的价值。BTC 钱包余额来自历史权益曲线中的 XBT 钱包字段。",
        "en": "<strong>Account value (this view)</strong> = BTC wallet balance + XBTUSD unrealised PnL, converted at the current BTC price. It excludes the USDT wallet and other contracts’ unrealised PnL, so it is not the whole BitMEX account value. BTC wallet balance comes from the historical equity curve."
      },
      "footer.bm_leverage": {
        "zh": "<strong>实际杠杆（有方向）</strong> =（账户价值对应的美元额 + XBTUSD 有方向合约价值）/ 账户价值对应的美元额；只拿 BTC 现货是 1 倍，同时持有永续合约做多会超过 1 倍，如果持有永续空头会介于 0 与 1 倍之间，1倍以上永续做空时才会变为净空。",
        "en": "<strong>Actual leverage (signed)</strong> = (this view’s account value in USD + signed XBTUSD contract value) / this view’s account value in USD. BTC spot alone is 1×; also holding a long perpetual takes it above 1×; holding a short perpetual puts it between 0 and 1×; only a perpetual short larger than 1× turns it net short."
      },
      "footer.bm_pnl": {
        "zh": "<strong>累计盈亏</strong>只计算 BTC 钱包现货 + BTC 合约，与实际杠杆范围一致。收益率按时间加权（TWR）。",
        "en": "<strong>Cumulative PnL</strong> covers only the BTC wallet and the BTC contract, matching actual leverage. Returns are time-weighted (TWR)."
      },
      "footer.bm_restart_background": {
        "zh": "<strong>从 1 BTC 重新开始：</strong>收益起点选项之一。根据 Paul 自述，在 2022 年 11 月，他从 16.5 BTC 亏到只剩一点几个 BTC。最黑暗的时刻，他选择坚持，只用这仅剩的约 1 BTC 重新起步，后续交易风格也发生改变。",
        "en": "<strong>Restart from 1 BTC:</strong> one of the return start options. According to Paul's own account, by November 2022 his 16.5 BTC had fallen to a little over 1 BTC. At his darkest moment, he chose to keep going and restart with only that remaining roughly 1 BTC. His trading style changed afterwards."
      },
      "footer.bm_order_pct": {
        "zh": "<strong>订单占账户百分比</strong> = 名义价值 / 所选 K 线时刻的 BTC 账户价值，不是整个 BitMEX 账户的价值。",
        "en": "<strong>Order % of account</strong> = notional / BTC account value at the selected candle, not the value of the whole BitMEX account."
      },
      "footer.bm_archive": {
        "zh": "<strong>订单归档与范围。</strong>原始交易数据来自公开仓库 <a href=\"https://github.com/bwjoke/BTC-Trading-Since-2020\" target=\"_blank\" rel=\"noopener\">bwjoke/BTC-Trading-Since-2020</a>；此视图的杠杆及盈亏只含 BTC 钱包现货 + XBTUSD，不应理解为整个账户的总盈亏。",
        "en": "<strong>Order archive and scope.</strong> Raw trades come from the public repository <a href=\"https://github.com/bwjoke/BTC-Trading-Since-2020\" target=\"_blank\" rel=\"noopener\">bwjoke/BTC-Trading-Since-2020</a>; this view’s leverage and PnL cover the BTC wallet and XBTUSD only; they are not total account PnL."
      },
      "footer.bm_lifecycle": {
        "zh": "<strong>订单生命周期并不完整。</strong>订单中途发生改单后只会留下最后一次改单的时间记录。从 2023 年 10 月起归档不再完整记录下单时刻，之后多数挂单只剩最终成交或撤销的时间。后采用数据仓库多份 release 之间的快照对照恢复了少量订单生命周期。",
        "en": "<strong>Order lifetimes are incomplete.</strong> When an order is amended, only the time of its last amendment is kept. From October 2023 the archive no longer consistently records placement times; most later orders retain only their final fill or cancellation time. Snapshots compared across multiple data-repository releases later recovered a small number of order lifetimes."
      },
      "footer.bm_assumption": {
        "zh": "<strong>「假设挂单时长」</strong>由读者设置成交单与未成交单各自的天数（默认成交单 1 天、未成交单 2 天）。",
        "en": "<strong>Assumed Resting Time</strong> lets readers set days separately for filled and unfilled orders (1 and 2 days by default)."
      },
      "footer.bm_indicators": {
        "zh": "<strong>指标：</strong>出入金记录、清算价，可以在「指标」菜单中打开。",
        "en": "<strong>Indicators:</strong> Deposits & withdrawals and Liquidation price can be turned on in the Indicators menu."
      },
      "footer.bm_guesses": {
        "zh": "<strong>「AI 修复下单时间」</strong>（默认勾上）按预先保存的 AI 逐单推断补上下单时间，两者都有时每单取更早的起点。",
        "en": "<strong>AI-restored placement times</strong> (ticked by default) fill in placement times from saved per-order AI inferences; with both on, each order takes the earlier start."
      },
      "footer.thanks": {
        "zh": "<strong>致谢</strong><br>感谢 <a href=\"https://x.com/coolish\" target=\"_blank\" rel=\"noopener noreferrer\">@coolish</a> 的无私分享。<br>图表问题请联系 <a href=\"https://x.com/catseyeinstinct\" target=\"_blank\" rel=\"noopener noreferrer\">@catseyeinstinct</a>。",
        "en": "<strong>Thanks</strong><br>Thanks to <a href=\"https://x.com/coolish\" target=\"_blank\" rel=\"noopener noreferrer\">@coolish</a> for generously sharing the data.<br>For chart issues, contact <a href=\"https://x.com/catseyeinstinct\" target=\"_blank\" rel=\"noopener noreferrer\">@catseyeinstinct</a>."
      }
    }),
    orderModel: orderExtension.model,
    drawOrderOverlay: orderExtension.drawOverlay,
    highlightOrderOverlay: orderExtension.highlightOverlay,
    decorateOrderRow: orderExtension.decorateRow,
    prefControls: Object.freeze([...global.BitmexOrders.prefControls, ...(global.BitmexGuesses?.prefControls ?? [])]),
    defaultPrefs: Object.freeze({ bubbleGroup: "cluster", showAllOrders: "on", orderMode: "lifecycle", orderGuesses: true }),
    renderSummaryCards,
    renderSelected,
  });
})(globalThis);
