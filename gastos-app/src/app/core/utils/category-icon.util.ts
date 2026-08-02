import type { IconNode } from 'lucide';
import {
  Baby,
  Banknote,
  Beef,
  Briefcase,
  Bus,
  Car,
  Clapperboard,
  ClipboardList,
  Coffee,
  CreditCard,
  Droplets,
  Dumbbell,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  Music,
  Package,
  PawPrint,
  Pill,
  Pin,
  Plane,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Star,
  Tv,
  Utensils,
  Wine,
  Wrench,
  Zap,
} from 'lucide';

/** Identificadores Lucide persistidos em `planning_item_categories.icon`. */
export const CATEGORY_ICON_OPTIONS: { icon: string; label: string }[] = [
  { icon: 'shopping-cart', label: 'Mercado' },
  { icon: 'beef', label: 'Talho' },
  { icon: 'house', label: 'Moradia' },
  { icon: 'car', label: 'Transporte' },
  { icon: 'smartphone', label: 'Assinaturas / telecom' },
  { icon: 'banknote', label: 'Salário / receita' },
  { icon: 'credit-card', label: 'Cartão' },
  { icon: 'utensils', label: 'Alimentação / lazer' },
  { icon: 'zap', label: 'Energia / luz' },
  { icon: 'droplets', label: 'Água' },
  { icon: 'heart-pulse', label: 'Saúde' },
  { icon: 'clipboard-list', label: 'Impostos / taxas' },
  { icon: 'wrench', label: 'Serviços' },
  { icon: 'briefcase', label: 'Trabalho / tech' },
  { icon: 'landmark', label: 'Investimento / banco' },
  { icon: 'shopping-bag', label: 'Compras / beleza' },
  { icon: 'gift', label: 'Extra / presente' },
  { icon: 'package', label: 'Outros' },
  { icon: 'pin', label: 'Geral' },
  { icon: 'dumbbell', label: 'Exercícios / fitness' },
];

export const DEFAULT_CATEGORY_ICON = 'pin';

const ALLOWED = new Set(CATEGORY_ICON_OPTIONS.map((o) => o.icon));

const LUCIDE_NODES: Record<string, IconNode> = {
  'shopping-cart': ShoppingCart,
  beef: Beef,
  house: House,
  car: Car,
  smartphone: Smartphone,
  banknote: Banknote,
  'credit-card': CreditCard,
  utensils: Utensils,
  zap: Zap,
  droplets: Droplets,
  tv: Tv,
  clapperboard: Clapperboard,
  music: Music,
  pill: Pill,
  'heart-pulse': HeartPulse,
  plane: Plane,
  'graduation-cap': GraduationCap,
  baby: Baby,
  'paw-print': PawPrint,
  'shopping-bag': ShoppingBag,
  wrench: Wrench,
  'clipboard-list': ClipboardList,
  landmark: Landmark,
  briefcase: Briefcase,
  gift: Gift,
  wine: Wine,
  coffee: Coffee,
  bus: Bus,
  shield: Shield,
  package: Package,
  star: Star,
  pin: Pin,
  dumbbell: Dumbbell,
};

/** Palavras-chave → ícone (categoria ou nome do item fixo). */
const KEYWORD_RULES: [string[], string][] = [
  [['talho', 'açougue', 'acougue', 'carn'], 'beef'],
  [['mercado', 'supermerc'], 'shopping-cart'],
  [['alimenta', 'restaur', 'lazer'], 'utensils'],
  [['moradia', 'aluguel', 'apartamento', 'condom', 'arrend', 'lucila'], 'house'],
  [['transporte', 'uber', 'combust', 'gasolina', 'metro'], 'car'],
  [['assinatura', 'netflix', 'spotify', 'crunch', 'apple', 'drive', 'cursor', 'claude'], 'smartphone'],
  [['telecomunic', 'internet', 'vivo', 'cel '], 'smartphone'],
  [['cartão', 'cartao', 'credito', 'crédito', 'itau', 'itáu', 'santander', 'nubank'], 'credit-card'],
  [['salário', 'salario', 'ordenado'], 'banknote'],
  [['recebimento', 'rendimento', 'coders', 'odontoprev', 'odont'], 'banknote'],
  [['reembolso'], 'banknote'],
  [['extra', 'bônus', 'bonus'], 'gift'],
  [['invest', 'reserva', 'capitaliza'], 'landmark'],
  [['luz pt', 'energia', 'eletric', ' luz'], 'zap'],
  [['água', 'agua', 'água pt'], 'droplets'],
  [['imposto', 'das', 'cau', 'conselho'], 'clipboard-list'],
  [['serviço', 'servico', 'contador'], 'wrench'],
  [['trabalho', 'tech'], 'briefcase'],
  [['exerc', 'ginásio', 'ginasio', 'fitness', 'pilates', 'yoga', 'musculação', 'musculacao'], 'dumbbell'],
  [['saúde', 'saude', 'convênio', 'convenio', 'academia'], 'heart-pulse'],
  [['beleza', 'manicure', 'fotos'], 'shopping-bag'],
  [['outros'], 'package'],
];

function matchIcon(text: string): string | null {
  const n = text.toLowerCase().trim();
  if (!n) return null;
  for (const [keywords, icon] of KEYWORD_RULES) {
    if (keywords.some((kw) => n.includes(kw))) return icon;
  }
  return null;
}

/** Aceita só chaves Lucide conhecidas. */
export function normalizeCategoryIconKey(raw?: string | null): string | null {
  const stored = raw?.trim();
  if (!stored) return null;
  if (stored in LUCIDE_NODES || ALLOWED.has(stored)) return stored;
  return null;
}

export function suggestCategoryIcon(name: string): string {
  return matchIcon(name) ?? DEFAULT_CATEGORY_ICON;
}

export function categoryIcon(
  name?: string | null,
  iconFromDb?: string | null
): string {
  const normalized = normalizeCategoryIconKey(iconFromDb);
  if (normalized) return normalized;
  if (name?.trim()) {
    const suggested = suggestCategoryIcon(name);
    if (suggested !== DEFAULT_CATEGORY_ICON) return suggested;
  }
  return DEFAULT_CATEGORY_ICON;
}

/** Ícone da linha: categoria primeiro, depois nome do item (gastos fixos). */
export function resolveItemIcon(
  categoryName?: string | null,
  categoryIconFromDb?: string | null,
  itemName?: string | null
): string {
  const cat = categoryIcon(categoryName, categoryIconFromDb);
  if (cat !== DEFAULT_CATEGORY_ICON) return cat;
  if (itemName?.trim()) {
    const fromItem = matchIcon(itemName);
    if (fromItem) return fromItem;
  }
  return cat;
}

/** Nós SVG Lucide para renderizar o ícone da categoria. */
export function categoryLucideNodes(iconKey?: string | null): IconNode {
  const key = normalizeCategoryIconKey(iconKey) ?? DEFAULT_CATEGORY_ICON;
  return LUCIDE_NODES[key] ?? Pin;
}
