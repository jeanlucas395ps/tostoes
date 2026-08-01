import {
  entryAmount,
  formatMoney,
  formatMoneyWithBrl,
  previewBrl,
} from './money.util';

describe('money.util', () => {
  describe('formatMoney', () => {
    it('formats BRL by default', () => {
      expect(formatMoney(10)).toContain('10,00');
    });

    it('formats BRL', () => {
      expect(formatMoney(1234.5, 'BRL')).toContain('1.234,50');
    });

    it('formats EUR', () => {
      expect(formatMoney(10.5, 'EUR')).toContain('€');
      expect(formatMoney(10.5, 'EUR')).toContain('10,50');
    });
  });

  describe('formatMoneyWithBrl', () => {
    it('returns only BRL for BRL currency', () => {
      const s = formatMoneyWithBrl(100, 'BRL', 100);
      expect(s).not.toContain('€');
    });

    it('includes BRL equivalent for EUR', () => {
      const s = formatMoneyWithBrl(10, 'EUR', 62);
      expect(s).toContain('€');
      expect(s).toContain('62');
    });
  });

  describe('entryAmount', () => {
    it('prefers amount', () => {
      expect(entryAmount({ amount: 10, suggestedAmount: 20, suggestedAmountBrl: 30 })).toBe(10);
    });

    it('uses suggestedAmount next', () => {
      expect(entryAmount({ suggestedAmount: 20, suggestedAmountBrl: 30 })).toBe(20);
    });

    it('falls back to suggestedAmountBrl', () => {
      expect(entryAmount({ suggestedAmountBrl: 30 })).toBe(30);
    });

    it('falls back to defaultAmountBrl', () => {
      expect(entryAmount({ defaultAmountBrl: 40 })).toBe(40);
    });

    it('returns 0 when empty', () => {
      expect(entryAmount({})).toBe(0);
    });
  });

  describe('previewBrl', () => {
    it('returns same amount for BRL', () => {
      expect(previewBrl(50, 'BRL', 6.2)).toBe(50);
    });

    it('converts EUR with rate', () => {
      expect(previewBrl(10, 'EUR', 6.2)).toBe(62);
    });
  });
});
