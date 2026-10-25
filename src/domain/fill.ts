import { notional } from './atoms.ts';
import type { Candle } from './candle.ts';
import type { Instrument } from './instrument.ts';
import { divide } from './rounding.ts';

export type Side = 'buy' | 'sell';

export interface MarketOrder {
  readonly side: Side;
  /** Base atoms; a positive multiple of the instrument's step size. */
  readonly quantity: bigint;
}

export interface Costs {
  /** Fee in basis points of the notional: 10n is 0.1%. */
  readonly feeBps: bigint;
  /** Whole ticks by which every fill price moves against the trader. */
  readonly slippageTicks: bigint;
}

export interface Fill {
  /** Open time of the candle the order filled on. */
  readonly time: number;
  readonly side: Side;
  readonly quantity: bigint;
  /** Quote atoms per base unit, slippage included. */
  readonly price: bigint;
  /** Quote atoms paid for a buy or received for a sell, before the fee. */
  readonly notional: bigint;
  /** Quote atoms. */
  readonly fee: bigint;
}

const BPS_PER_UNIT = 10_000n;

/**
 * Fills a market order at the open of `candle`, which must be the first
 * candle that opens after the order was placed.
 */
export function fillMarketOrder(
  order: MarketOrder,
  candle: Candle,
  instrument: Instrument,
  costs: Costs,
): Fill {
  const { side, quantity } = order;
  if (quantity <= 0n || quantity % instrument.stepSize !== 0n) {
    throw new RangeError(
      `Quantity must be a positive multiple of ${instrument.stepSize.toString()}, got ${quantity.toString()}`,
    );
  }
  if (costs.feeBps < 0n || costs.feeBps > BPS_PER_UNIT) {
    throw new RangeError(
      `Fee must be between 0 and 10000 bps, got ${costs.feeBps.toString()}`,
    );
  }
  if (costs.slippageTicks < 0n) {
    throw new RangeError(
      `Slippage must be non-negative, got ${costs.slippageTicks.toString()}`,
    );
  }
  const slippage = costs.slippageTicks * instrument.tickSize;
  // Slippage on a sell stops at one tick (or at the open, if that is lower),
  // so the price stays positive and never ends up above the open.
  const lowestSellPrice = bigMin(candle.open, instrument.tickSize);
  const price =
    side === 'buy'
      ? candle.open + slippage
      : bigMax(candle.open - slippage, lowestSellPrice);
  const value = notional(price, quantity, side === 'buy' ? 'ceil' : 'floor');
  const fee = divide(value * costs.feeBps, BPS_PER_UNIT, 'ceil');
  return Object.freeze({
    time: candle.openTime,
    side,
    quantity,
    price,
    notional: value,
    fee,
  });
}

function bigMax(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

function bigMin(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}
