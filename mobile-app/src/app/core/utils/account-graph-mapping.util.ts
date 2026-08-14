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
  bank: { border: '#0057FF', bg: 'rgba(0, 87, 255, 0.08)', text: '#14151A' },
  credit: { border: '#B5760A', bg: 'rgba(245, 165, 36, 0.12)', text: '#14151A' },
  bill: { border: '#B5760A', bg: 'rgba(245, 165, 36, 0.12)', text: '#14151A' },
  investment: { border: '#5A3FD1', bg: 'rgba(124, 92, 252, 0.08)', text: '#14151A' },
  expense: { border: '#E5342B', bg: 'rgba(229, 52, 43, 0.08)', text: '#14151A' },
  income: { border: '#1BAA5C', bg: 'rgba(27, 170, 92, 0.08)', text: '#14151A' },
  goal: { border: '#B5760A', bg: 'rgba(245, 165, 36, 0.12)', text: '#14151A' },
  transfer: { border: '#5B5E6B', bg: 'rgba(107, 110, 122, 0.12)', text: '#14151A' },
  installment: { border: '#B5760A', bg: 'rgba(245, 165, 36, 0.12)', text: '#14151A' },
  balance: { border: '#14151A', bg: '#F8F7F4', text: '#14151A' },
  unassigned: { border: '#8B8E9B', bg: 'rgba(107, 110, 122, 0.10)', text: '#5B5E6B' },
};

const DARK_PALETTE: Record<string, PaletteEntry> = {
  bank: { border: '#B6FF2E', bg: 'rgba(182, 255, 46, 0.14)', text: '#F6F7F3' },
  credit: { border: '#FBBF24', bg: 'rgba(251, 191, 36, 0.16)', text: '#F6F7F3' },
  bill: { border: '#FBBF24', bg: 'rgba(251, 191, 36, 0.16)', text: '#F6F7F3' },
  investment: { border: '#A78BFA', bg: 'rgba(167, 139, 250, 0.14)', text: '#F6F7F3' },
  expense: { border: '#FF6B5E', bg: 'rgba(255, 107, 94, 0.14)', text: '#F6F7F3' },
  income: { border: '#34D399', bg: 'rgba(52, 211, 153, 0.14)', text: '#F6F7F3' },
  goal: { border: '#FBBF24', bg: 'rgba(251, 191, 36, 0.16)', text: '#F6F7F3' },
  transfer: { border: '#9A9DAC', bg: 'rgba(154, 157, 172, 0.14)', text: '#F6F7F3' },
  installment: { border: '#FBBF24', bg: 'rgba(251, 191, 36, 0.16)', text: '#F6F7F3' },
  balance: { border: '#F6F7F3', bg: '#333644', text: '#F6F7F3' },
  unassigned: { border: '#6D707F', bg: 'rgba(154, 157, 172, 0.14)', text: '#9A9DAC' },
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
