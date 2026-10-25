import { describe, expect, it } from 'vitest';

import { isMissingFile } from './missing-file.ts';

describe('isMissingFile', () => {
  it('recognises ENOENT', () => {
    expect(
      isMissingFile(Object.assign(new Error('gone'), { code: 'ENOENT' })),
    ).toBe(true);
  });

  it.each([
    [
      'another error code',
      Object.assign(new Error('denied'), { code: 'EACCES' }),
    ],
    ['an error without a code', new Error('plain')],
    ['a non-error value', { code: 'ENOENT' }],
  ])('rejects %s', (_, error) => {
    expect(isMissingFile(error)).toBe(false);
  });
});
