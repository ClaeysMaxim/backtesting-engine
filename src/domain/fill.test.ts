import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ATOMS_PER_UNIT, parseAtoms } from './atoms.ts';
import { type Candle, createCandle } from './candle.ts';
import { type Costs, fillMarketOrder, type Side } from './fill.ts';
import { createInstrument } from './instrument.ts';

const btcusdt = createInstrument({
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  tickSize: '0.01',
  stepSize: '0.00001',
});

function candleOpeningAt(open: bigint): Candle {
  return createCandle({
    openTime: 1_748_736_000_000,
    closeTime: 1_748_739_600_000,
    open,
    high: open,
    low: open,
    close: open,
    volume: 0n,
  });
}

const next = candleOpeningAt(parseAtoms('104591.88'));
const costs: Costs = { feeBps: 10n, slippageTicks: 2n };

describe('fillMarketOrder', () => {
  it('fills a buy at the open plus slippage and charges the fee', () => {
    const fill = fillMarketOrder(
      { side: 'buy', quantity: parseAtoms('0.001') },
      next,
      btcusdt,
      costs,
    );

    expect(fill).toEqual({
      time: next.openTime,
      side: 'buy',
      quantity: parseAtoms('0.001'),
      price: parseAtoms('104591.90'),
      notional: parseAtoms('104.5919'),
      fee: parseAtoms('0.1045919'),
    });
    expect(Object.isFrozen(fill)).toBe(true);
  });

  it('fills a sell at the open minus slippage', () => {
    const fill = fillMarketOrder(
      { side: 'sell', quantity: parseAtoms('0.001') },
      next,
      btcusdt,
      costs,
    );

    expect(fill.price).toBe(parseAtoms('104591.86'));
    expect(fill.notional).toBe(parseAtoms('104.59186'));
    expect(fill.fee).toBe(parseAtoms('0.10459186'));
  });

  it('rounds an inexact notional and fee against the trader', () => {
    const coarse = createInstrument({
      baseAsset: 'XYZ',
      quoteAsset: 'USDT',
      tickSize: '0.00000001',
      stepSize: '0.5',
    });
    const cheap = candleOpeningAt(3n);
    const order = { quantity: parseAtoms('0.5') };
    const noSlippage = { feeBps: 10n, slippageTicks: 0n };

    // Exact value is 1.5 atoms; the fee is a fraction of an atom.
    const buy = fillMarketOrder(
      { ...order, side: 'buy' },
      cheap,
      coarse,
      noSlippage,
    );
    const sell = fillMarketOrder(
      { ...order, side: 'sell' },
      cheap,
      coarse,
      noSlippage,
    );

    expect([buy.notional, buy.fee]).toEqual([2n, 1n]);
    expect([sell.notional, sell.fee]).toEqual([1n, 1n]);
  });

  it('never lets slippage push a sell below one tick', () => {
    const fill = fillMarketOrder(
      { side: 'sell', quantity: parseAtoms('0.001') },
      candleOpeningAt(btcusdt.tickSize),
      btcusdt,
      { feeBps: 0n, slippageTicks: 5n },
    );

    expect(fill.price).toBe(btcusdt.tickSize);
  });

  it('never moves a sell above the open, even below one tick', () => {
    const fill = fillMarketOrder(
      { side: 'sell', quantity: parseAtoms('0.001') },
      candleOpeningAt(5n),
      btcusdt,
      { feeBps: 0n, slippageTicks: 1n },
    );

    expect(fill.price).toBe(5n);
  });

  it.each([
    ['zero quantity', 0n],
    ['negative quantity', -parseAtoms('0.001')],
    ['quantity off the step size', parseAtoms('0.001') + 1n],
  ])('rejects %s', (_, quantity) => {
    expect(() =>
      fillMarketOrder({ side: 'buy', quantity }, next, btcusdt, costs),
    ).toThrow(RangeError);
  });

  it.each<[string, Costs]>([
    ['a negative fee', { feeBps: -1n, slippageTicks: 0n }],
    ['a fee above 100%', { feeBps: 10_001n, slippageTicks: 0n }],
    ['negative slippage', { feeBps: 0n, slippageTicks: -1n }],
  ])('rejects %s', (_, badCosts) => {
    expect(() =>
      fillMarketOrder(
        { side: 'buy', quantity: parseAtoms('0.001') },
        next,
        btcusdt,
        badCosts,
      ),
    ).toThrow(RangeError);
  });

  const scenario = fc.record({
    side: fc.constantFrom<Side>('buy', 'sell'),
    steps: fc.bigInt({ min: 1n, max: 10n ** 9n }),
    open: fc.bigInt({ min: 1n, max: 10n ** 16n }),
    feeBps: fc.bigInt({ min: 0n, max: 10_000n }),
    slippageTicks: fc.bigInt({ min: 0n, max: 1_000n }),
  });

  it('always rounds price, notional and fee against the trader', () => {
    fc.assert(
      fc.property(scenario, ({ side, steps, open, feeBps, slippageTicks }) => {
        const quantity = steps * btcusdt.stepSize;
        const fill = fillMarketOrder(
          { side, quantity },
          candleOpeningAt(open),
          btcusdt,
          { feeBps, slippageTicks },
        );
        const exactValue = fill.price * quantity;
        const paidEnoughFee = fill.fee * 10_000n >= fill.notional * feeBps;
        if (side === 'buy') {
          return (
            fill.price >= open &&
            fill.notional * ATOMS_PER_UNIT >= exactValue &&
            paidEnoughFee
          );
        }
        return (
          fill.price > 0n &&
          fill.price <= open &&
          fill.notional * ATOMS_PER_UNIT <= exactValue &&
          paidEnoughFee
        );
      }),
    );
  });
});
