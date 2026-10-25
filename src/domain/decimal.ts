const PLAIN_DECIMAL = /^(\d+)(?:\.(\d+))?$/;

/**
 * Parses a non-negative decimal string such as "0.01000000" into an integer
 * count of 10^-scale units, without passing through floating point.
 */
export function parseDecimal(text: string, scale: number): bigint {
  if (!Number.isSafeInteger(scale) || scale < 0) {
    throw new RangeError(
      `Scale must be a non-negative integer, got ${String(scale)}`,
    );
  }
  const [, whole, fraction = ''] = PLAIN_DECIMAL.exec(text) ?? [];
  if (whole === undefined) {
    throw new SyntaxError(`Not a plain decimal number: "${text}"`);
  }
  const significant = fraction.replace(/0+$/, '');
  if (significant.length > scale) {
    throw new RangeError(
      `"${text}" has more than ${String(scale)} significant decimal places`,
    );
  }
  return BigInt(whole + significant.padEnd(scale, '0'));
}
