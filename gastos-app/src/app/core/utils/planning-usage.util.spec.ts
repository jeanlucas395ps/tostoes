import {
  accountMonthActive,
  clampMonthIndexForYear,
  isBeforePlanningUsageStart,
} from './planning-usage.util';

describe('planning-usage.util', () => {
  const start = { year: 2026, month: 6, date: '2026-06-01' };

  describe('isBeforePlanningUsageStart', () => {
    it('returns false when start is null/undefined', () => {
      expect(isBeforePlanningUsageStart(2020, 1, null)).toBe(false);
      expect(isBeforePlanningUsageStart(2020, 1, undefined)).toBe(false);
    });

    it('returns true for year before start', () => {
      expect(isBeforePlanningUsageStart(2025, 12, start)).toBe(true);
    });

    it('returns false for year after start', () => {
      expect(isBeforePlanningUsageStart(2027, 1, start)).toBe(false);
    });

    it('compares month in start year', () => {
      expect(isBeforePlanningUsageStart(2026, 5, start)).toBe(true);
      expect(isBeforePlanningUsageStart(2026, 6, start)).toBe(false);
      expect(isBeforePlanningUsageStart(2026, 7, start)).toBe(false);
    });
  });

  describe('clampMonthIndexForYear', () => {
    it('returns 0 when no start or year before start', () => {
      expect(clampMonthIndexForYear(2026, 5, null)).toBe(0);
      expect(clampMonthIndexForYear(2025, 5, start)).toBe(0);
    });

    it('keeps monthIndex when year after start', () => {
      expect(clampMonthIndexForYear(2027, 3, start)).toBe(3);
    });

    it('clamps to min index in start year', () => {
      expect(clampMonthIndexForYear(2026, 0, start)).toBe(5);
      expect(clampMonthIndexForYear(2026, 8, start)).toBe(8);
      expect(clampMonthIndexForYear(2026, 15, start)).toBe(11);
    });
  });

  describe('accountMonthActive', () => {
    it('uses account start over planning start', () => {
      expect(
        accountMonthActive(2026, 3, { year: 2026, month: 3, date: '2026-03-01' }, start)
      ).toBe(true);
      expect(
        accountMonthActive(2026, 2, { year: 2026, month: 3, date: '2026-03-01' }, start)
      ).toBe(false);
    });

    it('falls back to planning start', () => {
      expect(accountMonthActive(2026, 6, null, start)).toBe(true);
      expect(accountMonthActive(2026, 5, null, start)).toBe(false);
    });
  });
});
