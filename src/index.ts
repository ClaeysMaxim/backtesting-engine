// Public entry point; modules are re-exported here as they are added.
export {
  ATOM_DECIMALS,
  ATOMS_PER_UNIT,
  notional,
  parseAtoms,
} from './domain/atoms.ts';
export { createCandle } from './domain/candle.ts';
export type { Candle } from './domain/candle.ts';
export { parseDecimal } from './domain/decimal.ts';
export { fillMarketOrder } from './domain/fill.ts';
export type { Costs, Fill, MarketOrder, Side } from './domain/fill.ts';
export { createInstrument, floorToStep } from './domain/instrument.ts';
export type { Instrument, InstrumentSpec } from './domain/instrument.ts';
export {
  applyFill,
  canApplyFill,
  createPortfolio,
  valueAt,
} from './domain/portfolio.ts';
export type { Portfolio, Valuation } from './domain/portfolio.ts';
export { divide } from './domain/rounding.ts';
export type { Rounding } from './domain/rounding.ts';
