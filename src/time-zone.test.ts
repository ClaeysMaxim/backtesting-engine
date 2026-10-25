import { describe, expect, it } from 'vitest';

describe('test environment', () => {
  it('runs in Pacific/Chatham so local-time bugs cannot pass by accident', () => {
    // Chatham is on standard time (UTC+12:45) in July; local or UTC time would give another offset.
    expect(new Date(Date.UTC(2024, 6, 1)).getTimezoneOffset()).toBe(-765);
  });
});
