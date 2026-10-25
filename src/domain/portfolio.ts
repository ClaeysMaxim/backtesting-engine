import { notional } from './atoms.ts';
import type { Fill } from './fill.ts';
import { divide } from './rounding.ts';

/** A long-only position in one instrument plus cash. All amounts in atoms. */
export interface Portfolio {
  readonly startingCash: bigint;
  /** Quote atoms. */
  readonly cash: bigint;
  /** Base atoms held; never negative. */
  readonly quantity: bigint;
  /** Quote atoms paid for the quantity held, fees excluded. */
  readonly costBasis: bigint;
  /** Quote atoms, fees excluded. */
  readonly realisedPnl: bigint;
  /** Quote atoms. */
  readonly feesPaid: bigint;
}

export interface Valuation {
  /** Quote atoms, rounded down. */
  readonly positionValue: bigint;
  readonly unrealisedPnl: bigint;
  readonly equity: bigint;
}

export function createPortfolio(startingCash: bigint): Portfolio {
  if (startingCash < 0n) {
    throw new RangeError(
      `Starting cash must be non-negative, got ${startingCash.toString()}`,
    );
  }
  return Object.freeze({
    startingCash,
    cash: startingCash,
    quantity: 0n,
    costBasis: 0n,
    realisedPnl: 0n,
    feesPaid: 0n,
  });
}

/** A buy must be paid in full, and a sell needs the quantity it sells. */
export function canApplyFill(portfolio: Portfolio, fill: Fill): boolean {
  return fill.side === 'buy'
    ? fill.notional + fill.fee <= portfolio.cash
    : fill.quantity <= portfolio.quantity;
}

export function applyFill(portfolio: Portfolio, fill: Fill): Portfolio {
  if (fill.quantity <= 0n || fill.notional < 0n || fill.fee < 0n) {
    throw new RangeError(
      'Fill quantity must be positive and amounts non-negative',
    );
  }
  if (!canApplyFill(portfolio, fill)) {
    throw new RangeError(
      fill.side === 'buy'
        ? `Cash ${portfolio.cash.toString()} cannot pay ${(fill.notional + fill.fee).toString()}`
        : `Cannot sell ${fill.quantity.toString()} of ${portfolio.quantity.toString()} held`,
    );
  }
  const feesPaid = portfolio.feesPaid + fill.fee;
  if (fill.side === 'buy') {
    return Object.freeze({
      ...portfolio,
      cash: portfolio.cash - fill.notional - fill.fee,
      quantity: portfolio.quantity + fill.quantity,
      costBasis: portfolio.costBasis + fill.notional,
      feesPaid,
    });
  }
  // The share of the cost basis that leaves with a partial sell is rounded up,
  // so realised PnL is never overstated. Selling everything releases it all.
  const released = divide(
    portfolio.costBasis * fill.quantity,
    portfolio.quantity,
    'ceil',
  );
  return Object.freeze({
    ...portfolio,
    cash: portfolio.cash + fill.notional - fill.fee,
    quantity: portfolio.quantity - fill.quantity,
    costBasis: portfolio.costBasis - released,
    realisedPnl: portfolio.realisedPnl + fill.notional - released,
    feesPaid,
  });
}

/** Values the position at `price` quote atoms per base unit. */
export function valueAt(portfolio: Portfolio, price: bigint): Valuation {
  const positionValue = notional(price, portfolio.quantity, 'floor');
  return Object.freeze({
    positionValue,
    unrealisedPnl: positionValue - portfolio.costBasis,
    equity: portfolio.cash + positionValue,
  });
}
