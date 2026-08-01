import {
  clampInstallmentCount,
  installmentEndMonth,
  shouldAskInstallmentPrompt,
} from './installment.util';

describe('installment.util', () => {
  describe('shouldAskInstallmentPrompt', () => {
    it('asks for new variable expense on credit', () => {
      expect(
        shouldAskInstallmentPrompt({
          accountType: 'credit',
          kind: 'expense',
        })
      ).toBeTrue();
    });

    it('skips for bank', () => {
      expect(
        shouldAskInstallmentPrompt({ accountType: 'bank', kind: 'expense' })
      ).toBeFalse();
    });

    it('skips existing installment', () => {
      expect(
        shouldAskInstallmentPrompt({
          accountType: 'credit',
          kind: 'expense',
          isInstallment: true,
        })
      ).toBeFalse();
    });

    it('skips fixed recurring', () => {
      expect(
        shouldAskInstallmentPrompt({
          accountType: 'credit',
          kind: 'expense',
          recurringItemId: 9,
        })
      ).toBeFalse();
    });

    it('skips income', () => {
      expect(
        shouldAskInstallmentPrompt({ accountType: 'credit', kind: 'income' })
      ).toBeFalse();
    });
  });

  describe('installmentEndMonth', () => {
    it('computes end inclusive of N parcels', () => {
      // Jul 2026 + 12x → Jun 2027 (month index 6 + 11)
      expect(installmentEndMonth(2026, 6, 12)).toBe('2027-06');
    });

    it('clamps minimum 2', () => {
      expect(installmentEndMonth(2026, 0, 1)).toBe('2026-02');
    });
  });

  describe('clampInstallmentCount', () => {
    it('clamps range', () => {
      expect(clampInstallmentCount(1)).toBe(2);
      expect(clampInstallmentCount(12)).toBe(12);
      expect(clampInstallmentCount(100)).toBe(48);
      expect(clampInstallmentCount(0)).toBe(2);
      expect(clampInstallmentCount(Number.NaN)).toBe(2);
    });
  });

  describe('installmentEndMonth falsy count', () => {
    it('uses default when count is 0', () => {
      expect(installmentEndMonth(2026, 0, 0)).toBe('2026-02');
    });
  });
});
