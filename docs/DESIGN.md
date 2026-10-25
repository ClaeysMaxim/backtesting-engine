# Design

This document records the design decisions behind the engine and why they were made.
`CLAUDE.md` lists the hard constraints; this file explains how the code meets them.
When a decision changes, update it here in the same pull request.

## Scope

- Binance spot market, one symbol per backtest, quoted in USDT.
- Long only: a position is either flat or long. Short selling needs borrow or funding costs
  to be modelled honestly, so it is left out until that is designed.
- Market orders only. Stop and limit orders come later (see "Later").

## Numbers

Floating point cannot represent most decimal prices exactly, and errors such as
`0.03 / 0.01 = 2.9999999999999996` silently change position sizes. The engine therefore
works in integers.

| Value                   | Type     | Unit                                        |
| ----------------------- | -------- | ------------------------------------------- |
| Timestamps              | `number` | epoch milliseconds, UTC                     |
| Candle prices           | `number` | ticks (the instrument's price tick size)    |
| Candle volume           | `number` | quantity steps (the instrument's step size) |
| Order and position size | `bigint` | quantity steps                              |
| Money (cash, fees, PnL) | `bigint` | atoms: 1e-8 of the quote asset (USDT)       |

- **Why `bigint` for accounting:** a `number` is only exact up to 2^53. Multiplying a price
  in ticks by a quantity in steps can pass that limit, and JavaScript then loses precision
  without an error. `bigint` cannot overflow silently.
- **Why `number` for candles:** prices in ticks and timestamps stay far below 2^53, and
  millions of `bigint` values would cost much more memory. Every candle field is checked
  with `Number.isSafeInteger` when it is created, and converted to `bigint` where it enters
  the accounting.
- **Why atoms of 1e-8:** the notional of a fill is `price ticks × quantity steps × tick size ×
step size`. For BTCUSDT that is `0.01 × 0.00001 = 1e-7` USDT per tick-step, which is
  exactly 10 atoms. As long as `tick size × step size` is a multiple of 1e-8, every notional
  is an exact integer number of atoms. Instruments that break this rule are rejected.
- **Tick size and step size are parsed from decimal strings** (as Binance publishes them),
  never through `parseFloat`.

## Rounding

Every rounding step goes against the trader. Results are then conservative and, because the
rule is fixed, deterministic.

- Fee: `ceil(notional × fee bps / 10 000)` atoms.
- Slippage: a whole number of ticks, added to the price of a buy and subtracted from a sell.
- Quantity: when an order is sized from an amount of cash, it is rounded down to whole
  steps, so it never spends more than that amount.

## Fill model

- A strategy can only place orders after a candle has closed. A market order placed at the
  close of candle `t` fills at the open of candle `t + 1`, plus slippage.
- An order that cannot be paid for (cash below notional plus fee) is rejected, not resized.
- There is no fill on the last candle of the data, because there is no next open.

## No look-ahead

- The strategy receives only closed candles. The engine never passes the current, still
  forming candle or any later candle.
- The engine test suite includes a "change the future" test: change every candle after a
  cut-off, rerun, and assert that every decision and fill before the cut-off is identical.
  A mutation test injects a deliberate leak to prove that the test catches it.

## Accounting

- The position keeps its total cost basis in atoms instead of an average price, so partial
  sells stay exact.
- Equity is marked to market at the close of every candle, not only when a trade closes.
- A position that is still open at the end of the data is reported as open, marked at the
  last close. It is never dropped silently.
- Invariant, checked with property-based tests: `cash + position value = starting cash +
realised PnL + unrealised PnL - fees`, for any sequence of fills.

## Data

- Source: Binance public market data (data.binance.vision). Downloads are verified against
  the published checksum files. To verify in phase 3: the timestamp unit of spot klines
  (milliseconds or microseconds) for recent data.
- Validation reports duplicates, gaps, unsorted rows and impossible candles
  (`low > open`, `high < close`, negative volume). Gaps are reported, never interpolated:
  filling them would invent prices.
- Everything is converted to UTC epoch milliseconds when it is read. Crypto trades 24/7, so
  there are no sessions or daylight saving time to handle.

## Metrics

- Returns come from the marked-to-market equity curve, net of fees.
- Sharpe is annualised with the real number of bars per year for the timeframe
  (for example `365 × 24` for hourly bars), not with 252.
- Drawdown is measured from the running peak before it, not from the all-time peak.
- Profit factor is undefined when there are no losing trades; it is not replaced by a number.
- A trade with a PnL of exactly zero counts as break-even, not as a win or a loss.

## Determinism

- No `Math.random()`, `Date.now()`, `new Date()` without arguments, `performance.now()`,
  `Intl` or `toLocale*()` in `src/`. ESLint enforces this. Randomness only comes from a
  seeded generator passed in explicitly.
- Tests run in the `Pacific/Chatham` time zone (UTC+12:45 or +13:45), so any accidental
  use of local time fails instead of passing on a UTC machine.
- The result hash is computed over the integer ledger (fills, cash, positions, equity per
  candle). Metrics that need floating point, such as Sharpe, are reported but not hashed.
  CI checks that the hash is identical on Linux, Windows and macOS.

## Reference validation

- Compare a simple strategy with an established library on the same data: an SMA crossover
  with market orders and no stops.
- The crossover compares sums instead of averages (`sumFast × slowLength` against
  `sumSlow × fastLength`), so the signal is exact in integers.
- Trades must match exactly; PnL is compared with a tolerance, because the reference library
  works in floating point.

## Strategy research (phase 7)

- The pass criterion is fixed before a strategy is run, not chosen afterwards.
- Walk-forward validation: a model is only trained on trades that have fully closed before
  the test window starts.
- Costs are stressed above the recorded fees and slippage. A strategy that only works at
  minimum cost is not an edge.
- A random-walk baseline shows what chance alone produces.
- One passing run among many is a lead, not a result: it has to hold on other symbols or
  later periods.

## Later

- Stop and limit orders. When the stop and the target both fall inside one candle, assume
  the stop was hit first. A gap through the stop fills at the open, not at the stop price.
- Several symbols in one portfolio, and other quote assets.
- Short positions with borrow or funding costs.
