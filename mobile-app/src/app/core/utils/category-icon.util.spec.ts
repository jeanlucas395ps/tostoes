import {
  CATEGORY_ICON_OPTIONS,
  categoryIcon,
  resolveItemIcon,
  suggestCategoryIcon,
} from './category-icon.util';

describe('category-icon.util', () => {
  it('catalog', () => {
    expect(CATEGORY_ICON_OPTIONS.length).toBeGreaterThan(5);
  });

  it('suggest and resolve', () => {
    expect(suggestCategoryIcon('Mercado')).toBe('🛒');
    expect(suggestCategoryIcon('xyzzy')).toBe('📌');
    expect(categoryIcon('X', '🛒')).toBe('🛒');
    expect(categoryIcon('Nubank cartão', '🚫')).toBe('💳');
    expect(resolveItemIcon('Geral', null, 'Netflix')).toBe('📱');
    expect(resolveItemIcon(null, null, null)).toBe('📌');
  });
});
