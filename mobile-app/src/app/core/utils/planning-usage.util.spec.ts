import {
  accountMonthActive,
  clampMonthIndexForYear,
  isBeforePlanningUsageStart,
} from './planning-usage.util';

describe('planning-usage.util', () => {
  const start = { year: 2026, month: 6, date: '2026-06-01' };

  it('isBeforePlanningUsageStart', () => {
    expect(isBeforePlanningUsageStart(2020, 1, null)).toBe(false);
    expect(isBeforePlanningUsageStart(2025, 12, start)).toBe(true);
    expect(isBeforePlanningUsageStart(2027, 1, start)).toBe(false);
    expect(isBeforePlanningUsageStart(2026, 5, start)).toBe(true);
    expect(isBeforePlanningUsageStart(2026, 6, start)).toBe(false);
  });

  it('clampMonthIndexForYear', () => {
    expect(clampMonthIndexForYear(2026, 5, null)).toBe(0);
    expect(clampMonthIndexForYear(2025, 5, start)).toBe(0);
    expect(clampMonthIndexForYear(2027, 3, start)).toBe(3);
    expect(clampMonthIndexForYear(2026, 0, start)).toBe(5);
  });

  it('accountMonthActive', () => {
    expect(accountMonthActive(2026, 3, { year: 2026, month: 3, date: '2026-03-01' }, start)).toBe(true);
    expect(accountMonthActive(2026, 5, null, start)).toBe(false);
  });
});
