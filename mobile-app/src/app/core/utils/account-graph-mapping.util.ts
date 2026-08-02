import { AccountFlowGraphEdge, AccountFlowGraphNode } from '../models/api.models';

export type GraphTheme = 'light' | 'dark';

export interface NodeColorSet {
  bgColor: string;
  borderColor: string;
  textColor: string;
}

interface PaletteEntry {
  border: string;
  bg: string;
  text: string;
}

const LIGHT_PALETTE: Record<string, PaletteEntry> = {
  bank: { border: '#6B4EE6', bg: 'rgba(107, 78, 230, 0.08)', text: '#1C252E' },
  credit: { border: '#B76E00', bg: 'rgba(255, 171, 0, 0.12)', text: '#1C252E' },
  bill: { border: '#B76E00', bg: 'rgba(255, 171, 0, 0.12)', text: '#1C252E' },
  investment: { border: '#2065D1', bg: 'rgba(32, 101, 209, 0.08)', text: '#1C252E' },
  expense: { border: '#FF5630', bg: 'rgba(255, 86, 48, 0.08)', text: '#1C252E' },
  income: { border: '#22C55E', bg: 'rgba(34, 197, 94, 0.08)', text: '#1C252E' },
  goal: { border: '#B76E00', bg: 'rgba(255, 171, 0, 0.12)', text: '#1C252E' },
  transfer: { border: '#637381', bg: 'rgba(145, 158, 171, 0.12)', text: '#1C252E' },
  installment: { border: '#B76E00', bg: 'rgba(255, 171, 0, 0.12)', text: '#1C252E' },
  balance: { border: '#1C252E', bg: '#F4F6F8', text: '#1C252E' },
  unassigned: { border: '#919EAB', bg: 'rgba(145, 158, 171, 0.10)', text: '#637381' },
};

const DARK_PALETTE: Record<string, PaletteEntry> = {
  bank: { border: '#A78BFA', bg: 'rgba(167, 139, 250, 0.14)', text: '#FFFFFF' },
  credit: { border: '#FFAB00', bg: 'rgba(255, 171, 0, 0.16)', text: '#FFFFFF' },
  bill: { border: '#FFAB00', bg: 'rgba(255, 171, 0, 0.16)', text: '#FFFFFF' },
  investment: { border: '#76B0F1', bg: 'rgba(118, 176, 241, 0.12)', text: '#FFFFFF' },
  expense: { border: '#FFAC82', bg: 'rgba(255, 86, 48, 0.14)', text: '#FFFFFF' },
  income: { border: '#4ADE80', bg: 'rgba(74, 222, 128, 0.12)', text: '#FFFFFF' },
  goal: { border: '#FFAB00', bg: 'rgba(255, 171, 0, 0.16)', text: '#FFFFFF' },
  transfer: { border: '#919EAB', bg: 'rgba(145, 158, 171, 0.14)', text: '#FFFFFF' },
  installment: { border: '#FFAB00', bg: 'rgba(255, 171, 0, 0.16)', text: '#FFFFFF' },
  balance: { border: '#FFFFFF', bg: '#28343F', text: '#FFFFFF' },
  unassigned: { border: '#637381', bg: 'rgba(99, 115, 129, 0.14)', text: '#919EAB' },
};

/** #RRGGBB → rgba(r,g,b,alpha), usada para o fundo translúcido de nós com cor própria (conta/meta). */
export function hexRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return hex;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Cores do nó pelo tipo + tema; contas/metas com cor própria usam-na no fundo/borda. */
export function nodeColors(type: string, theme: GraphTheme, entityColor?: string | null): NodeColorSet {
  const palette = theme === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;
  const entry = palette[type] ?? palette['unassigned'];
  if (entityColor && (type === 'bank' || type === 'credit' || type === 'goal')) {
    return {
      bgColor: hexRgba(entityColor, theme === 'dark' ? 0.14 : 0.08),
      borderColor: entityColor,
      textColor: entry.text,
    };
  }
  return { bgColor: entry.bg, borderColor: entry.border, textColor: entry.text };
}

export function buildAmountLabel(amountBrl: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(
    amountBrl
  );
}

export interface GraphFilterState {
  types: Set<string>;
  accounts: Set<string>;
  categories: Set<string>;
  tabs: Set<string>;
}

export function hasActiveFilters(filters: GraphFilterState): boolean {
  return !!(filters.types.size || filters.accounts.size || filters.categories.size || filters.tabs.size);
}

/** Uma aresta só some se algum filtro ativo não bater com seus dados (AND entre dimensões, OR dentro). */
export function edgeMatchesFilters(edge: AccountFlowGraphEdge, filters: GraphFilterState): boolean {
  if (filters.types.size && !filters.types.has(edge.kind) && !filters.types.has(edge.subKind)) {
    return false;
  }
  if (filters.accounts.size && !filters.accounts.has(edge.from) && !filters.accounts.has(edge.to)) {
    return false;
  }
  if (filters.categories.size) {
    const catKey = edge.itemCategoryId != null ? String(edge.itemCategoryId) : 'geral';
    if (!filters.categories.has(catKey)) return false;
  }
  if (filters.tabs.size) {
    const tabKey = edge.customTabId != null ? String(edge.customTabId) : 'geral';
    if (!filters.tabs.has(tabKey)) return false;
  }
  return true;
}

export interface BalanceNode {
  id: string;
  label: string;
  amountBrl: number;
}

export interface BalanceLink {
  from: string;
  to: string;
}

/** Sintetiza um nó "Saldo" por banco (entradas − saídas conectadas) + um nó "Saldo Total" ligado a destinos órfãos. */
export function computeBalanceNodes(
  nodes: AccountFlowGraphNode[],
  edges: AccountFlowGraphEdge[],
  totals: { inflowBrl: number; outflowBrl: number }
): { balanceNodes: BalanceNode[]; balanceLinks: BalanceLink[] } {
  const banks = nodes.filter((n) => n.type === 'bank');
  const balanceNodes: BalanceNode[] = [];
  const balanceLinks: BalanceLink[] = [];

  for (const bank of banks) {
    const inflow = edges.filter((e) => e.to === bank.id).reduce((s, e) => s + e.amountBrl, 0);
    const outflow = edges.filter((e) => e.from === bank.id).reduce((s, e) => s + e.amountBrl, 0);
    const balanceId = `balance:${bank.id}`;
    balanceNodes.push({ id: balanceId, label: bank.label, amountBrl: inflow - outflow });
    balanceLinks.push({ from: bank.id, to: balanceId });
  }

  const totalId = 'balance:total';
  balanceNodes.push({ id: totalId, label: 'Saldo Total', amountBrl: totals.inflowBrl - totals.outflowBrl });

  const connectedIds = new Set(edges.flatMap((e) => [e.from, e.to]));
  const orphanTargets = nodes.filter(
    (n) => ['expense', 'investment', 'goal', 'installment'].includes(n.type) && !banks.some((b) => b.id === n.id) && connectedIds.has(n.id)
  );
  for (const orphan of orphanTargets) {
    const hasBankSource = edges.some((e) => e.to === orphan.id && banks.some((b) => b.id === e.from));
    if (!hasBankSource) {
      balanceLinks.push({ from: totalId, to: orphan.id });
    }
  }

  return { balanceNodes, balanceLinks };
}
