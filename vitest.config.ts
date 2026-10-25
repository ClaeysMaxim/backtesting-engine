import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // A zone far from UTC with a 45-minute offset, so any accidental use of local time
    // shifts dates and fails tests instead of passing by luck on a UTC machine.
    env: { TZ: 'Pacific/Chatham' },
  },
});
