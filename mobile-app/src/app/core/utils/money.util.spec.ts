import {
  currencySymbol,
  entryAmount,
  formatMoney,
  formatMoneyWithBrl,
  isForeignCurrency,
  previewBrl,
} from './money.util';

describe('money.util', () => {
  it('currencySymbol', () => {
    expect(currencySymbol('BRL')).toBe('R$');
    expect(currencySymbol('EUR')).toBe('€');
    expect(currencySymbol('USD')).toBe('US$');
  });

  it('isForeignCurrency', () => {
    expect(isForeignCurrency('EUR')).toBe(true);
    expect(isForeignCurrency('USD')).toBe(true);
    expect(isForeignCurrency('BRL')).toBe(false);
  });

  it('formatMoney BRL EUR USD', () => {
    expect(formatMoney(10)).toContain('10,00');
    expect(formatMoney(10.5, 'EUR')).toContain('€');
    expect(formatMoney(10.5, 'USD')).toContain('US$');
  });

  it('formatMoneyWithBrl', () => {
    expect(formatMoneyWithBrl(100, 'BRL', 100)).not.toContain('€');
    expect(formatMoneyWithBrl(10, 'EUR', 62)).toContain('€');
    expect(formatMoneyWithBrl(10, 'USD', 50)).toContain('US$');
  });

  it('entryAmount', () => {
    expect(entryAmount({ amount: 10, suggestedAmount: 20 })).toBe(10);
    expect(entryAmount({ suggestedAmount: 20 })).toBe(20);
    expect(entryAmount({ suggestedAmountBrl: 30 })).toBe(30);
    expect(entryAmount({ defaultAmountBrl: 40 })).toBe(40);
    expect(entryAmount({})).toBe(0);
  });

  it('previewBrl', () => {
    expect(previewBrl(50, 'BRL', 6.2)).toBe(50);
    expect(previewBrl(10, 'EUR', 6.2)).toBe(62);
    expect(previewBrl(10, 'USD', 5)).toBe(50);
  });
});
