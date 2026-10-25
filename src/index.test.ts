import { describe, expect, it } from 'vitest';

describe('entry point', () => {
  it('loads as an ES module through a .ts import', async () => {
    const entry = await import('./index.ts');

    expect(entry).toBeTypeOf('object');
  });
});
