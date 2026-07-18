import { backoffMs } from './outbox.service';

describe('outbox backoff', () => {
  it('grows exponentially from 2s', () => {
    expect(backoffMs(1)).toBe(2_000);
    expect(backoffMs(2)).toBe(4_000);
    expect(backoffMs(3)).toBe(8_000);
    expect(backoffMs(5)).toBe(32_000);
  });

  it('caps at 5 minutes', () => {
    expect(backoffMs(10)).toBe(300_000);
    expect(backoffMs(30)).toBe(300_000);
  });
});
