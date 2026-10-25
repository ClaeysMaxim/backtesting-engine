import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { parseAtoms } from './atoms.ts';
import { createCandle } from './candle.ts';
import { type Costs, type Fill, fillMarketOrder, type Side } from './fill.ts';
import { createInstrument } from './instrument.ts';
import {
  applyFill,
  canApplyFill,
  createPortfolio,
  type Portfolio,
  valueAt,
} from './portfolio.ts';

const btcusdt = createInstrument({
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  tickSize: '0.01',
  stepSize: '0.00001',
});

function trade(side: Side, quantity: bigint, open: bigint, costs: Costs): Fill {
  const candle = createCandle({
    openTime: 0,
    closeTime: 3_600_000,
    open,
    high: open,
    low: open,
    close: open,
    volume: 0n,
  });
  return fillMarketOrder({ side, quantity }, candle, btcusdt, costs);
}

function rawFill(side: Side, quantity: bigint, value: bigint, fee = 0n): Fill {
  return { time: 0, side, quantity, price: 1n, notional: value, fee };
}

const usual: Costs = { feeBps: 10n, slippageTicks: 2n };

describe('createPortfolio', () => {
  it('starts with cash only', () => {
    const portfolio = createPortfolio(parseAtoms('1000'));

    expect(portfolio).toEqual({
      startingCash: parseAtoms('1000'),
      cash: parseAtoms('1000'),
      quantity: 0n,
      costBasis: 0n,
      realisedPnl: 0n,
      feesPaid: 0n,
    });
    expect(Object.isFrozen(portfolio)).toBe(true);
  });

  it('rejects negative starting cash', () => {
    expect(() => createPortfolio(-1n)).toThrow(RangeError);
  });
});

describe('applyFill', () => {
  const start = createPortfolio(parseAtoms('1000'));
  const buy = trade('buy', parseAtoms('0.001'), parseAtoms('104591.88'), usual);

  it('pays notional and fee for a buy and records the cost basis', () => {
    const after = applyFill(start, buy);

    expect(after).toEqual({
      startingCash: parseAtoms('1000'),
      cash: parseAtoms('895.3035081'),
      quantity: parseAtoms('0.001'),
      costBasis: parseAtoms('104.5919'),
      realisedPnl: 0n,
      feesPaid: parseAtoms('0.1045919'),
    });
    expect(Object.isFrozen(after)).toBe(true);
  });

  it('realises PnL and releases the whole cost basis on a full sell', () => {
    const sell = trade(
      'sell',
      parseAtoms('0.001'),
      parseAtoms('110000'),
      usual,
    );
    const after = applyFill(applyFill(start, buy), sell);

    expect(sell.notional).toBe(parseAtoms('109.99998'));
    expect(after.quantity).toBe(0n);
    expect(after.costBasis).toBe(0n);
    expect(after.realisedPnl).toBe(
      parseAtoms('109.99998') - parseAtoms('104.5919'),
    );
    expect(after.feesPaid).toBe(buy.fee + sell.fee);
    expect(after.cash).toBe(
      parseAtoms('1000') - buy.notional - buy.fee + sell.notional - sell.fee,
    );
  });

  it('rounds the released cost basis up on a partial sell', () => {
    const held = applyFill(createPortfolio(100n), rawFill('buy', 3n, 10n));
    const after = applyFill(held, rawFill('sell', 1n, 5n));

    // A third of 10 is 3.33; releasing 4 keeps the realised PnL conservative.
    expect(after.costBasis).toBe(6n);
    expect(after.realisedPnl).toBe(1n);
  });

  it('accepts a buy that uses the last atom of cash', () => {
    const exact = createPortfolio(buy.notional + buy.fee);

    expect(applyFill(exact, buy).cash).toBe(0n);
  });

  it.each<[string, Portfolio, Fill]>([
    ['a buy one atom short', createPortfolio(buy.notional + buy.fee - 1n), buy],
    ['a sell with nothing held', start, rawFill('sell', 1n, 1n)],
    [
      'a sell above the quantity held',
      applyFill(createPortfolio(100n), rawFill('buy', 2n, 10n)),
      rawFill('sell', 3n, 1n),
    ],
  ])('rejects %s', (_, portfolio, fill) => {
    expect(canApplyFill(portfolio, fill)).toBe(false);
    expect(() => applyFill(portfolio, fill)).toThrow(RangeError);
  });

  it.each<[string, Fill]>([
    ['a zero quantity', rawFill('buy', 0n, 0n)],
    ['a negative notional', rawFill('buy', 1n, -1n)],
    ['a negative fee', rawFill('buy', 1n, 1n, -1n)],
  ])('rejects a fill with %s', (_, fill) => {
    expect(() => applyFill(start, fill)).toThrow(RangeError);
  });
});

describe('valueAt', () => {
  it('marks the position to market, rounding down', () => {
    const start = createPortfolio(parseAtoms('1000'));
    const buy = trade(
      'buy',
      parseAtoms('0.001'),
      parseAtoms('104591.88'),
      usual,
    );
    const held = applyFill(start, buy);

    // 0.001 BTC at 110000.00000001 is 110.00000000001 USDT, below one atom more.
    expect(valueAt(held, parseAtoms('110000.00000001'))).toEqual({
      positionValue: parseAtoms('110'),
      unrealisedPnl: parseAtoms('110') - parseAtoms('104.5919'),
      equity: held.cash + parseAtoms('110'),
    });
  });
});

describe('accounting invariants', () => {
  interface Operation extends Costs {
    readonly side: Side;
    readonly steps: bigint;
    readonly open: bigint;
  }

  const step = btcusdt.stepSize;
  const operation: fc.Arbitrary<Operation> = fc.record({
    side: fc.constantFrom<Side>('buy', 'sell'),
    steps: fc.bigInt({ min: 1n, max: 100_000n }),
    open: fc.bigInt({ min: 1n, max: parseAtoms('200000') }),
    feeBps: fc.bigInt({ min: 0n, max: 100n }),
    slippageTicks: fc.bigInt({ min: 0n, max: 10n }),
  });
  const run = fc.record({
    startingCash: fc.bigInt({ min: 0n, max: parseAtoms('100000') }),
    operations: fc.array(operation, { maxLength: 30 }),
    markPrice: fc.bigInt({ min: 1n, max: parseAtoms('200000') }),
  });

  // Sells are capped at the quantity held so that most of them apply.
  function nextFill(portfolio: Portfolio, op: Operation): Fill | undefined {
    const wanted = op.steps * step;
    const quantity =
      op.side === 'sell' && wanted > portfolio.quantity
        ? portfolio.quantity
        : wanted;
    if (quantity === 0n) {
      return undefined;
    }
    return trade(op.side, quantity, op.open, op);
  }

  it('keeps cash + position value = start + realised + unrealised - fees', () => {
    fc.assert(
      fc.property(run, ({ startingCash, operations, markPrice }) => {
        let portfolio = createPortfolio(startingCash);
        for (const op of operations) {
          const fill = nextFill(portfolio, op);
          if (fill !== undefined && canApplyFill(portfolio, fill)) {
            portfolio = applyFill(portfolio, fill);
          }
          const { positionValue, unrealisedPnl } = valueAt(
            portfolio,
            markPrice,
          );
          const holds =
            portfolio.cash + positionValue ===
              portfolio.startingCash +
                portfolio.realisedPnl +
                unrealisedPnl -
                portfolio.feesPaid &&
            portfolio.cash >= 0n &&
            portfolio.quantity >= 0n &&
            portfolio.costBasis >= 0n;
          if (!holds) {
            return false;
          }
        }
        return true;
      }),
    );
  });

  it('never makes money when every trade happens at the mark price', () => {
    fc.assert(
      fc.property(run, ({ startingCash, operations, markPrice }) => {
        let portfolio = createPortfolio(startingCash);
        let equity = startingCash;
        for (const op of operations) {
          const fill = nextFill(portfolio, { ...op, open: markPrice });
          if (fill !== undefined && canApplyFill(portfolio, fill)) {
            portfolio = applyFill(portfolio, fill);
          }
          const next = valueAt(portfolio, markPrice).equity;
          if (next > equity) {
            return false;
          }
          equity = next;
        }
        return true;
      }),
    );
  });
});
