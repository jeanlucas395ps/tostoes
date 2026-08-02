import {
  CATEGORY_ICON_OPTIONS,
  categoryIcon,
  DEFAULT_CATEGORY_ICON,
  resolveItemIcon,
  suggestCategoryIcon,
} from './category-icon.util';

describe('category-icon.util', () => {
  it('exposes a catalog of lucide keys', () => {
    expect(CATEGORY_ICON_OPTIONS.length).toBeGreaterThan(10);
    expect(CATEGORY_ICON_OPTIONS[0].icon).toBe('shopping-cart');
  });

  describe('suggestCategoryIcon', () => {
    it('maps known keywords', () => {
      expect(suggestCategoryIcon('Mercado')).toBe('shopping-cart');
      expect(suggestCategoryIcon('Netflix assinatura')).toBe('smartphone');
      expect(suggestCategoryIcon('Aluguel')).toBe('house');
      expect(suggestCategoryIcon('Exercícios')).toBe('dumbbell');
    });

    it('falls back to pin', () => {
      expect(suggestCategoryIcon('xyzzy-unknown-999')).toBe(DEFAULT_CATEGORY_ICON);
      expect(suggestCategoryIcon('')).toBe(DEFAULT_CATEGORY_ICON);
      expect(suggestCategoryIcon('   ')).toBe(DEFAULT_CATEGORY_ICON);
    });
  });

  describe('categoryIcon', () => {
    it('keeps allowed lucide key from db', () => {
      expect(categoryIcon('Qualquer', 'shopping-cart')).toBe('shopping-cart');
    });

    it('ignores invalid stored icon and suggests from name', () => {
      expect(categoryIcon('Nubank cartão', '🚫')).toBe('credit-card');
    });

    it('falls back to pin', () => {
      expect(categoryIcon(null, null)).toBe(DEFAULT_CATEGORY_ICON);
      expect(categoryIcon('Geral', null)).toBe(DEFAULT_CATEGORY_ICON);
    });
  });

  describe('resolveItemIcon', () => {
    it('uses item name when category is generic', () => {
      expect(resolveItemIcon('Geral', null, 'Netflix assinatura')).toBe('smartphone');
    });
  });
});
