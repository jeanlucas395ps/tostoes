import {
  accountTypeShortLabel,
  nodeDisplayName,
  nodeTypeLabel,
} from './account-labels.util';

describe('account-labels.util', () => {
  describe('nodeTypeLabel', () => {
    it('maps known types', () => {
      expect(nodeTypeLabel('credit')).toBe('CARTÃO');
      expect(nodeTypeLabel('expense')).toBe('GASTO');
      expect(nodeTypeLabel('bill')).toBe('FATURA');
      expect(nodeTypeLabel('installment')).toBe('PARCELA');
      expect(nodeTypeLabel('transfer')).toBe('TRANSF.');
    });

    it('marks unassigned', () => {
      expect(nodeTypeLabel('expense', true)).toBe('A DEFINIR');
    });

    it('uppercases unknown', () => {
      expect(nodeTypeLabel('foo')).toBe('FOO');
    });
  });

  describe('nodeDisplayName', () => {
    it('uses second line when present', () => {
      expect(nodeDisplayName('GASTO\nMercado', 'x')).toBe('Mercado');
    });

    it('uses first line otherwise', () => {
      expect(nodeDisplayName('Mercado', 'x')).toBe('Mercado');
    });

    it('falls back when second line empty', () => {
      expect(nodeDisplayName('TÍTULO\n', 'x')).toBe('x');
    });

    it('falls back', () => {
      expect(nodeDisplayName(undefined, 'fallback')).toBe('fallback');
    });
  });

  describe('accountTypeShortLabel', () => {
    it('labels account types', () => {
      expect(accountTypeShortLabel('credit')).toBe('Cartão');
      expect(accountTypeShortLabel('investment')).toBe('Invest.');
      expect(accountTypeShortLabel('bank')).toBe('Banco');
      expect(accountTypeShortLabel('other')).toBe('Banco');
    });
  });
});
