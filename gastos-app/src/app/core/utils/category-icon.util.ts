export const CATEGORY_ICON_OPTIONS: { icon: string; label: string }[] = [
  { icon: '🛒', label: 'Mercado' },
  { icon: '🥩', label: 'Talho' },
  { icon: '🏠', label: 'Moradia' },
  { icon: '🚗', label: 'Transporte' },
  { icon: '📱', label: 'Assinaturas / telecom' },
  { icon: '💰', label: 'Salário / receita' },
  { icon: '💳', label: 'Cartão' },
  { icon: '🍽️', label: 'Alimentação / lazer' },
  { icon: '⚡', label: 'Energia / luz' },
  { icon: '💡', label: 'Água' },
  { icon: '🏥', label: 'Saúde' },
  { icon: '📋', label: 'Impostos / taxas' },
  { icon: '🔧', label: 'Serviços' },
  { icon: '💼', label: 'Trabalho / tech' },
  { icon: '🏦', label: 'Investimento / banco' },
  { icon: '🛍️', label: 'Compras / beleza' },
  { icon: '🎁', label: 'Extra / presente' },
  { icon: '📦', label: 'Outros' },
  { icon: '📌', label: 'Geral' },
  { icon: '💪', label: 'Exercícios / fitness' },
];

const ALLOWED = new Set(CATEGORY_ICON_OPTIONS.map((o) => o.icon));

/** Palavras-chave → ícone (categoria ou nome do item fixo). */
const KEYWORD_RULES: [string[], string][] = [
  [['talho', 'açougue', 'acougue', 'carn'], '🥩'],
  [['mercado', 'supermerc'], '🛒'],
  [['alimenta', 'restaur', 'lazer'], '🍽️'],
  [['moradia', 'aluguel', 'apartamento', 'condom', 'arrend', 'lucila'], '🏠'],
  [['transporte', 'uber', 'combust', 'gasolina', 'metro'], '🚗'],
  [['assinatura', 'netflix', 'spotify', 'crunch', 'apple', 'drive', 'cursor', 'claude'], '📱'],
  [['telecomunic', 'internet', 'vivo', 'cel '], '📱'],
  [['cartão', 'cartao', 'credito', 'crédito', 'itau', 'itáu', 'santander', 'nubank'], '💳'],
  [['salário', 'salario', 'ordenado'], '💰'],
  [['recebimento', 'rendimento', 'coders', 'odontoprev', 'odont'], '💰'],
  [['reembolso'], '💰'],
  [['extra', 'bônus', 'bonus'], '🎁'],
  [['invest', 'reserva', 'capitaliza'], '🏦'],
  [['luz pt', 'energia', 'eletric', ' luz'], '⚡'],
  [['água', 'agua', 'água pt'], '💡'],
  [['imposto', 'das', 'cau', 'conselho'], '📋'],
  [['serviço', 'servico', 'contador'], '🔧'],
  [['trabalho', 'tech'], '💼'],
  [['exerc', 'ginásio', 'ginasio', 'fitness', 'pilates', 'yoga', 'musculação', 'musculacao'], '💪'],
  [['saúde', 'saude', 'convênio', 'convenio', 'academia'], '🏥'],
  [['beleza', 'manicure', 'fotos'], '🛍️'],
  [['outros'], '📦'],
];

function matchIcon(text: string): string | null {
  const n = text.toLowerCase().trim();
  if (!n) return null;
  for (const [keywords, icon] of KEYWORD_RULES) {
    if (keywords.some((kw) => n.includes(kw))) return icon;
  }
  return null;
}

export function suggestCategoryIcon(name: string): string {
  return matchIcon(name) ?? '📌';
}

export function categoryIcon(
  name?: string | null,
  iconFromDb?: string | null
): string {
  const stored = iconFromDb?.trim();
  if (stored && ALLOWED.has(stored)) return stored;
  if (name?.trim()) {
    const suggested = suggestCategoryIcon(name);
    if (suggested !== '📌') return suggested;
  }
  return '📌';
}

/** Ícone da linha: categoria primeiro, depois nome do item (gastos fixos). */
export function resolveItemIcon(
  categoryName?: string | null,
  categoryIconFromDb?: string | null,
  itemName?: string | null
): string {
  const cat = categoryIcon(categoryName, categoryIconFromDb);
  if (cat !== '📌') return cat;
  if (itemName?.trim()) {
    const fromItem = matchIcon(itemName);
    if (fromItem) return fromItem;
  }
  return cat;
}
