import { isPastMonth } from './month.util';

describe('month.util', () => {
  it('detects past/future months', () => {
    const now = new Date();
    expect(isPastMonth(now.getFullYear() - 1, 11)).toBe(true);
    expect(isPastMonth(now.getFullYear() + 1, 0)).toBe(false);
    expect(isPastMonth(now.getFullYear(), now.getMonth())).toBe(false);
  });
});
