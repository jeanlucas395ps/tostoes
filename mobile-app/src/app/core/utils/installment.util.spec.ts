import {
  clampInstallmentCount,
  installmentEndMonth,
  shouldAskInstallmentPrompt,
} from './installment.util';

describe('installment.util', () => {
  it('shouldAskInstallmentPrompt', () => {
    expect(
      shouldAskInstallmentPrompt({
        accountType: 'credit',
        kind: 'expense',
      })
    ).toBe(true);
    expect(
      shouldAskInstallmentPrompt({
        accountType: 'bank',
        kind: 'expense',
      })
    ).toBe(false);
    expect(
      shouldAskInstallmentPrompt({
        accountType: 'credit',
        kind: 'expense',
        isInstallment: true,
      })
    ).toBe(false);
    expect(
      shouldAskInstallmentPrompt({
        accountType: 'credit',
        kind: 'expense',
        isGoal: true,
      })
    ).toBe(false);
    expect(
      shouldAskInstallmentPrompt({
        accountType: 'credit',
        kind: 'expense',
        recurringItemId: 1,
      })
    ).toBe(false);
  });

  it('installmentEndMonth and clamp', () => {
    expect(installmentEndMonth(2026, 6, 6)).toBe('2026-12');
    expect(clampInstallmentCount(1)).toBe(2);
    expect(clampInstallmentCount(100)).toBe(48);
    expect(clampInstallmentCount(12)).toBe(12);
  });
});
