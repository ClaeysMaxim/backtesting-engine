# backtesting-engine

[![CI](https://github.com/ClaeysMaxim/backtesting-engine/actions/workflows/ci.yml/badge.svg)](https://github.com/ClaeysMaxim/backtesting-engine/actions/workflows/ci.yml)

An event-driven backtesting engine in TypeScript, built for correctness that can be measured
and proven rather than for chasing returns.

- **Deterministic:** the same backtest on the same data gives bit-identical results on Linux,
  Windows and macOS. Money and prices are integers, timestamps are UTC epoch milliseconds,
  and there is no hidden clock or randomness.
- **No look-ahead:** a strategy only sees closed candles, and orders fill at the next open.
- **Conservative:** fees, slippage and sizing always round against the trader.

The reasoning behind these choices is in [docs/DESIGN.md](docs/DESIGN.md).

## Status

Work in progress.

- Done: project setup (TypeScript, tests, linting, CI on three operating systems) and the
  domain model (exact decimal parsing, instruments, candles, market order fills and a
  long-only portfolio), with property-based tests for the accounting.
- Next: downloading and validating historical candles from Binance's public market data.

## Getting started

Requirements: Node.js as pinned in [.nvmrc](.nvmrc). With nvm:

```sh
nvm install
nvm use
npm ci
```

## Scripts

| Command                | What it does                                            |
| ---------------------- | ------------------------------------------------------- |
| `npm test`             | Run the tests once                                      |
| `npm run test:watch`   | Run the tests in watch mode                             |
| `npm run typecheck`    | Type-check with `tsc` (no build output)                 |
| `npm run lint`         | Lint with ESLint, including the determinism rules       |
| `npm run format`       | Format all files with Prettier                          |
| `npm run format:check` | Check formatting without changing files                 |
| `npm run check`        | Run format check, lint, typecheck and tests, as CI does |

There is no build step: Node runs the TypeScript sources directly, so relative imports use the
`.ts` extension.

## License

[MIT](LICENSE)
