import { parseDecimal } from './decimal.ts';
import { divide, type Rounding } from './rounding.ts';

/** Decimals of an atom: Binance prices and quantities have at most 8. */
export const ATOM_DECIMALS = 8;
export const ATOMS_PER_UNIT = 10n ** BigInt(ATOM_DECIMALS);

/** Parses a decimal string such as "67123.45000000" into atoms. */
export function parseAtoms(text: string): bigint {
  return parseDecimal(text, ATOM_DECIMALS);
}

/**
 * Value in quote atoms of `quantity` base atoms at `price` quote atoms per
 * base unit. The exact value is rarely a whole atom, so the caller picks the
 * rounding direction.
 */
export function notional(
  price: bigint,
  quantity: bigint,
  rounding: Rounding,
): bigint {
  if (price < 0n || quantity < 0n) {
    throw new RangeError(
      `Price and quantity must be non-negative, got ${price.toString()} and ${quantity.toString()}`,
    );
  }
  return divide(price * quantity, ATOMS_PER_UNIT, rounding);
}
