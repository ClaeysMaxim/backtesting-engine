export type Rounding = 'floor' | 'ceil';

export function divide(
  numerator: bigint,
  denominator: bigint,
  rounding: Rounding,
): bigint {
  if (denominator <= 0n) {
    throw new RangeError(
      `Denominator must be positive, got ${denominator.toString()}`,
    );
  }
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n) {
    return quotient;
  }
  // bigint division truncates toward zero. With a positive denominator the
  // remainder has the numerator's sign, which says which neighbour to pick.
  if (rounding === 'floor') {
    return remainder < 0n ? quotient - 1n : quotient;
  }
  return remainder > 0n ? quotient + 1n : quotient;
}
