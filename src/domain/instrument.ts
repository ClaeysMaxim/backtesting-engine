import { parseAtoms } from './atoms.ts';
import { divide } from './rounding.ts';

const ASSET_CODE = /^[A-Z0-9]+$/;

export interface Instrument {
  readonly symbol: string;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  /** Smallest price increment, in quote atoms per base unit. */
  readonly tickSize: bigint;
  /** Smallest quantity increment, in base atoms. */
  readonly stepSize: bigint;
}

/** Instrument rules as Binance publishes them, sizes as decimal strings. */
export interface InstrumentSpec {
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly tickSize: string;
  readonly stepSize: string;
}

export function createInstrument(spec: InstrumentSpec): Instrument {
  const { baseAsset, quoteAsset } = spec;
  for (const asset of [baseAsset, quoteAsset]) {
    if (!ASSET_CODE.test(asset)) {
      throw new RangeError(`Invalid asset code: "${asset}"`);
    }
  }
  if (baseAsset === quoteAsset) {
    throw new RangeError(`Base and quote asset are both ${baseAsset}`);
  }
  const tickSize = parseAtoms(spec.tickSize);
  const stepSize = parseAtoms(spec.stepSize);
  if (tickSize <= 0n || stepSize <= 0n) {
    throw new RangeError(
      `Tick size and step size must be positive, got "${spec.tickSize}" and "${spec.stepSize}"`,
    );
  }
  return Object.freeze({
    symbol: baseAsset + quoteAsset,
    baseAsset,
    quoteAsset,
    tickSize,
    stepSize,
  });
}

/** Largest tradable quantity that does not exceed `quantity` base atoms. */
export function floorToStep(instrument: Instrument, quantity: bigint): bigint {
  if (quantity < 0n) {
    throw new RangeError(
      `Quantity must be non-negative, got ${quantity.toString()}`,
    );
  }
  return divide(quantity, instrument.stepSize, 'floor') * instrument.stepSize;
}
