# Paul BTC Trail · BitMEX

Paul Wei（[@coolish](https://x.com/coolish)）2020–2026 年在 BitMEX 上的 BTC（XBTUSD）交易可视化：K 线上标出他的成交和挂单，并显示任一时刻的仓位、账户价值、杠杆和盈亏。

在线访问：<https://paul-bitmex.catseye.today/>

## 运行

需要 [Node.js](https://nodejs.org/)，不用安装任何依赖：

```bash
node serve.mjs
```

浏览器打开 <http://127.0.0.1:8000/>。换端口：`node serve.mjs 9000`。

页面是纯静态文件，也可以用任何静态文件服务器，把 `public/` 当作网站根目录。直接双击 `index.html` 打开会读不到数据。

## 使用

- 鼠标在图上移动，右侧显示那一刻的仓位、挂单和账户；单击钉住时间，双击图表取消。
- 顶部切换 K 线周期（1 分钟到 1 周）。回放：空格键播放 / 暂停，← → 逐根移动。
- 成交标记、挂单显示、技术指标等在顶部工具栏设置；右上角切换中文 / English。
- 各项数字的计算口径见页面底部的「关于数据 / 指标说明」。
- 2023-09-17 以后的订单在原始数据里没有下单时间。页面默认用 AI 推断的下单时间和「假设挂单时长」往前补出这一段，画得更淡。补出的部分不是交易所记录：取消「AI 修复下单时间」里的「显示推断」、把假设天数设为 0，就只显示原始记录。

## 数据

页面只读 `public/data/` 下的文件：

- `source/`：账户数据，2020-05-01 至 2026-07-23。包括成交、订单、资金费、钱包记录，以及推算订单起止时间用的辅助数据。
- `archive/`：XBTUSD K 线，1 分钟到 1 周，截至 2026-09-16。`candle-catalog.json` 是分片索引。
- `llm-guesses/`：AI 推断的下单时间。

账户数据来自 [bwjoke/BTC-Trading-Since-2020](https://github.com/bwjoke/BTC-Trading-Since-2020)（BitMEX 账户归档导出），原始文件是 CSV。这里预先把用到的部分转成了 JSON 数组：只保留 XBTUSD 的行和用到的列，字段含义和单位都沿用 BitMEX（数量是合约张数，手续费和盈亏是聪）。字段顺序写在 `source/source-manifest.json`。

页面加载时，会把 BitMEX 的成交和订单转换成 Hyperliquid 的格式，再交给和 Hyperliquid 版相同的图表。字段名和单位沿用 Hyperliquid [info 接口](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint)：`side`（B 买 / A 卖）、`px`（USD）、`sz`（BTC）、`oid`、`crossed`（是否吃单）、`limit_px`、`status`、`timestamp` 等。BitMEX 独有的信息放在额外字段里，比如合约张数 `contracts`（1 张 = 1 USD）；`fee` 和 `closed_pnl` 以 BTC 计。

<details>
<summary>样例</summary>

`source/fills.json` 的一行，字段为 `[t, qty, px, commXBt, rpnlXBt, taker, ordId]`。qty 为正是买入，commXBt 和 rpnlXBt 的单位是聪：

```json
[1588336459019, 9666, 8825.5, -24643, 0, 0, "cd2c2344-9b17-3fae-bece-460edb95019d"]
```

转换后（节选）：

```json
{"tid": 9, "oid": 5, "time": 1588336459019, "side": "B", "px": 8825.5, "sz": 1.0952353974279077,
 "crossed": false, "dir": "Buy", "closed_pnl": 0, "fee": -0.00024643, "contracts": 9666}
```

`source/orders.json` 里对应的订单，字段为 `[t, transactT, status, qty, px, cumQty, avgPx, ordType, ordId, stopPx]`。status 的取值见 `source-manifest.json`，0 是 Filled：

```json
[1588336459019, 1588326939750, 0, 9666, 8825.5, 9666, 8825.5, "Limit", "cd2c2344-9b17-3fae-bece-460edb95019d", 0]
```

转换后（节选）：

```json
{"oid": 5, "side": "B", "limit_px": 8825.5, "sz": 0, "orig_sz": 1.0952353974279077, "order_type": "Limit",
 "status": "filled", "timestamp": 1588326939750, "status_timestamp": 1588336459019, "contracts": 9666}
```

`archive/` 里的 K 线每根是 `[t, o, h, l, c, v]`，t 是开盘时间（UTC 毫秒）：

```json
[1789516800000, 75560, 76095.46, 75320.4, 76095.46, 10741200]
```

</details>

## 许可

代码采用 [MIT](LICENSE) 许可。

`public/data/` 下的数据不在此许可范围内：账户数据来自 [bwjoke/BTC-Trading-Since-2020](https://github.com/bwjoke/BTC-Trading-Since-2020)，K 线来自 BitMEX 公开行情。

第三方组件沿用各自的许可：[TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts)（Apache-2.0）、[Pickr](https://github.com/simonwep/pickr)（MIT）、[Lucide](https://lucide.dev) 图标（ISC），声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

---

## English

A visualization of Paul Wei's ([@coolish](https://x.com/coolish)) BTC (XBTUSD) trading on BitMEX, 2020–2026: his fills and orders on the candles, plus position, account value, leverage and PnL at any moment. Live site: <https://paul-bitmex.catseye.today/>.

**Run.** With [Node.js](https://nodejs.org/) and no dependencies: `node serve.mjs`, then open <http://127.0.0.1:8000/> (`node serve.mjs 9000` for another port). Any static file server works with `public/` as the site root; opening `index.html` directly from disk does not.

**Use.** Hover a candle to see that moment; click to pin it, double-click to release. Space plays or pauses the replay, ← → step one candle. The page footer explains every figure. Orders after 2023-09-17 have no placement time in the source data. By default the page fills that span, drawn fainter, from AI-inferred placement times and an assumed resting time. Neither is an exchange record: untick "Show inferred" under "AI-restored placement times" and set the assumed days to 0 to see only the original records.

**Data.** Everything the page reads is in `public/data/`. Account data (2020-05-01 to 2026-07-23) comes from the CSV files in [bwjoke/BTC-Trading-Since-2020](https://github.com/bwjoke/BTC-Trading-Since-2020). The parts the page uses (XBTUSD rows, needed columns) were converted ahead of time into JSON arrays that keep BitMEX's field meanings and units (contracts, satoshis); the field order is listed in `source/source-manifest.json`. On load, the page converts BitMEX fills and orders into the Hyperliquid format (field names and units follow the Hyperliquid [info endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint), e.g. `sz` in BTC) and draws them with the same charts as the Hyperliquid version. BitMEX-only details travel in extra fields, such as the contract count `contracts` (1 contract = 1 USD); `fee` and `closed_pnl` are in BTC. Candles in `archive/` (to 2026-09-16) are `[t, o, h, l, c, v]` rows. See the samples above.

**License.** The code is under the [MIT License](LICENSE). Data under `public/data/` is not covered: the account data comes from [bwjoke/BTC-Trading-Since-2020](https://github.com/bwjoke/BTC-Trading-Since-2020) and the candles from BitMEX public market data. Third-party components keep their own licenses: Lightweight Charts (Apache-2.0), Pickr (MIT) and Lucide icons (ISC); see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
