# backtesting-engine

Event-driven backtesting engine in TypeScript. Public portfolio project.
Goal: correctness that can be measured and proven, not "get rich" trading.

## Hard constraints
- Must work identically on macOS (ARM) and Windows (x86).
  - No bash-only npm scripts (no rm -rf, no &&-chains that break on Windows).
    Use cross-platform Node scripts or tools instead.
  - Always use node:path / URL for paths, never string concatenation.
- Node version is pinned in .nvmrc (26.12.1). Respect it.
- Determinism: the same backtest on the same data must produce bit-identical
  results on every OS.
  - Money and prices are integers (minor units / ticks), never floats.
  - Timestamps are integer epoch milliseconds in UTC.
  - No Date.now(), Math.random() or locale-dependent formatting inside the
    engine. Randomness only via a seeded RNG passed in explicitly.
- No look-ahead: a strategy only ever sees fully closed candles.
- Never commit secrets. API keys live in .env (already gitignored).
  Provide .env.example when a key is needed.
- Market data lives in data/ (gitignored) and is downloaded by a script.

## How we work
- Small steps. One concept per step. Explain why you chose an approach and
  what the alternatives were, briefly.
- After each step, stop and let me review.
- Write tests alongside the code (Vitest). Engine logic without tests is
  not done.
- TypeScript strict mode. No `any` unless justified in a comment.
- Prefer few dependencies. Ask before adding one and say why it's needed.
- Use current stable versions of tools; don't guess versions from memory,
  check them.

## Git workflow
In this repo Claude may create branches, commit, push, open PRs and merge
them. This overrides any global rule against those actions, for this repo
only.
- One branch per step, created from an up-to-date main
  (e.g. `chore/setup-vitest`, `feat/domain-model`).
- Work on the branch, then stop for my review. Only after my OK: commit,
  push the branch, open a PR and merge it with a merge commit
  (`gh pr merge --merge --delete-branch`).
- Never commit or push directly to main.
- Branch names, commit messages, PR titles and PR descriptions are in
  English, without AI attribution (no Co-Authored-By, no "Generated with").
- The PR description lists the checks that were run (lint, typecheck, tests).

## Roadmap
1. Project setup: TypeScript (strict, ESM), Vitest, linting/formatting,
   GitHub Actions CI running on ubuntu, windows and macos using .nvmrc.
2. Domain model: Candle, Order, Fill, Position, Portfolio (integer money).
3. Data: script to download historical candles from Binance's public
   market data; validation for gaps and duplicates.
4. Engine loop: event-driven, deterministic; fills at next candle open with
   configurable fees and slippage.
5. Metrics: PnL, max drawdown, Sharpe. CI test that a reference backtest
   produces the same result hash on all three OSes.
6. Reference validation: compare results with an established library on
   the same strategy and data (golden files).
7. LLM strategy authoring: natural language -> strategy code, run in a
   sandbox (Docker), with checks for overfitting and look-ahead bias.
8. MCP server exposing data, backtests and results to Claude.
