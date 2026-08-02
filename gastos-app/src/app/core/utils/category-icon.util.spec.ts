import {
  CATEGORY_ICON_OPTIONS,
  categoryIcon,
  resolveItemIcon,
  suggestCategoryIcon,
} from './category-icon.util';

describe('category-icon.util', () => {
  it('exposes catalog options', () => {
    expect(CATEGORY_ICON_OPTIONS.length).toBeGreaterThan(10);
    expect(CATEGORY_ICON_OPTIONS[0].icon).toBeTruthy();
  });

  describe('suggestCategoryIcon', () => {
    it('matches known keywords', () => {
      expect(suggestCategoryIcon('Mercado')).toBe('🛒');
      expect(suggestCategoryIcon('Netflix assinatura')).toBe('📱');
      expect(suggestCategoryIcon('Aluguel')).toBe('🏠');
      expect(suggestCategoryIcon('Exercícios')).toBe('💪');
    });

    it('falls back to pin for unknown', () => {
      expect(suggestCategoryIcon('xyzzy-unknown-999')).toBe('📌');
      expect(suggestCategoryIcon('')).toBe('📌');
      expect(suggestCategoryIcon('   ')).toBe('📌');
    });
  });

  describe('categoryIcon', () => {
    it('keeps allowed icon from db', () => {
      expect(categoryIcon('Qualquer', '🛒')).toBe('🛒');
    });

    it('ignores invalid stored icon and suggests from name', () => {
      expect(categoryIcon('Nubank cartão', '🚫')).toBe('💳');
    });

    it('returns pin when nothing matches', () => {
      expect(categoryIcon(null, null)).toBe('📌');
      expect(categoryIcon('Geral', null)).toBe('📌');
    });
  });

  describe('resolveItemIcon', () => {
    it('uses category when specific', () => {
      expect(resolveItemIcon('Mercado', null, 'Item')).toBe('🛒');
    });

    it('falls back to item name when category is generic', () => {
      expect(resolveItemIcon('Geral', null, 'Netflix')).toBe('📱');
    });

    it('returns pin when both generic', () => {
      expect(resolveItemIcon('Geral', null, 'xyz')).toBe('📌');
    });
  });
});
