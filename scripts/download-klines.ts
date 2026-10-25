import { parseArgs } from 'node:util';

import { monthRange } from '../src/data/binance-archive.ts';
import { downloadArchive } from '../src/data/download.ts';
import { isInterval } from '../src/data/series.ts';

const USAGE =
  'Usage: npm run data:download -- --symbol BTCUSDT --interval 1h --from 2024-01 --to 2024-12 [--data-dir data]';

const { values } = parseArgs({
  options: {
    symbol: { type: 'string' },
    interval: { type: 'string' },
    from: { type: 'string' },
    to: { type: 'string' },
    'data-dir': { type: 'string', default: 'data' },
  },
});
const { symbol, interval, from, to } = values;
if (
  symbol === undefined ||
  interval === undefined ||
  from === undefined ||
  to === undefined
) {
  throw new Error(USAGE);
}
if (!isInterval(interval)) {
  throw new Error(`Unsupported interval "${interval}". ${USAGE}`);
}

for (const month of monthRange(from, to)) {
  const { path, status } = await downloadArchive(
    { symbol, interval, month },
    values['data-dir'],
  );
  console.log(`${month}: ${status} (${path})`);
}
