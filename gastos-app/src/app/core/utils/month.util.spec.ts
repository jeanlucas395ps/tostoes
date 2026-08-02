import { isPastMonth } from './month.util';

describe('month.util', () => {
  describe('isPastMonth', () => {
    it('returns true for previous year', () => {
      const now = new Date();
      expect(isPastMonth(now.getFullYear() - 1, 11)).toBe(true);
    });

    it('returns false for future year', () => {
      const now = new Date();
      expect(isPastMonth(now.getFullYear() + 1, 0)).toBe(false);
    });

    it('returns true for earlier month in current year', () => {
      const now = new Date();
      if (now.getMonth() === 0) {
        expect(isPastMonth(now.getFullYear(), 0)).toBe(false);
      } else {
        expect(isPastMonth(now.getFullYear(), now.getMonth() - 1)).toBe(true);
      }
    });

    it('returns false for current month', () => {
      const now = new Date();
      expect(isPastMonth(now.getFullYear(), now.getMonth())).toBe(false);
    });

    it('returns false for later month in current year', () => {
      const now = new Date();
      if (now.getMonth() === 11) {
        expect(isPastMonth(now.getFullYear() + 1, 0)).toBe(false);
      } else {
        expect(isPastMonth(now.getFullYear(), now.getMonth() + 1)).toBe(false);
      }
    });
  });
});
