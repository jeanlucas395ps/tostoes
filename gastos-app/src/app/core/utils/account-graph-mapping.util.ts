import { AccountFlowGraphEdge, AccountFlowGraphNode } from '../models/api.models';

export type GraphTheme = 'light' | 'dark';

export interface NodeColorSet {
  bgColor: string;
  borderColor: string;
  textColor: string;
}

/** Blocos: light = branco/borda preta; dark = fundo do tema / borda branca. */
const BLOCK_LIGHT: NodeColorSet = {
  bgColor: '#FFFFFF',
  borderColor: '#14151A',
  textColor: '#14151A',
};

const BLOCK_DARK: NodeColorSet = {
  bgColor: '#23262F',
  borderColor: '#F6F7F3',
  textColor: '#F6F7F3',
};

const AMOUNT_TEXT_LIGHT: Record<string, string> = {
  income: '#1BAA5C',
  expense: '#E5342B',
  leisure: '#E5342B',
  installment: '#E5342B',
  bill: '#E5342B',
  investment: '#5A3FD1',
  goal: '#B5760A',
  transfer: '#5B5E6B',
  balancePos: '#0E8245',
  balanceNeg: '#A8241D',
};

const AMOUNT_TEXT_DARK: Record<string, string> = {
  income: '#34D399',
  expense: '#FF6B5E',
  leisure: '#FF6B5E',
  installment: '#FF6B5E',
  bill: '#FF6B5E',
  investment: '#A78BFA',
  goal: '#FBBF24',
  transfer: '#9A9DAC',
  balancePos: '#6EE7B7',
  balanceNeg: '#FF9086',
};

const HUB_TYPES = new Set(['bank', 'credit', 'investment']);

/** Contas hub (banco/cartão/investimento) vs itens de fluxo (receita/gasto/meta…). */
export function isAccountHubType(type: string): boolean {
  return HUB_TYPES.has(type);
}

const HUB_ID_RE = /^(bank|credit|inv):/;
const FLOW_ID_RE = /^(inc|exp|flow|xfer|goal|unassigned|tx):/;

/** Nó de conta (banco/cartão/investimento) pelo id do grafo. */
export function isHubNodeId(nodeId: string): boolean {
  return HUB_ID_RE.test(nodeId);
}

/** Nó de item de fluxo (receita/gasto/aporte/…) pelo id do grafo. */
export function isFlowNodeId(nodeId: string): boolean {
  return FLOW_ID_RE.test(nodeId);
}

/** Nó de totalização (agrupa itens e pode sair de um banco). */
export function isTotalizerNodeId(nodeId: string): boolean {
  return nodeId.startsWith('tot:');
}

export interface LinkCoherence {
  ok: boolean;
  reason?: string;
}

/**
 * Coerência de ligação estilo Excalidraw: só conta ↔ item.
 * Gasto↔gasto, receita↔receita, banco↔banco etc. são inválidos.
 */
export function canLinkGraphNodes(
  fromId: string,
  toId: string,
  fromType?: string,
  toType?: string
): LinkCoherence {
  if (!fromId || !toId || fromId === toId) {
    return { ok: false, reason: 'Selecione dois blocos diferentes.' };
  }
  if (isTotalizerNodeId(fromId) || isTotalizerNodeId(toId)) {
    const otherId = isTotalizerNodeId(fromId) ? toId : fromId;
    const otherType = isTotalizerNodeId(fromId) ? toType : fromType;
    if (otherId.startsWith('bank:') || otherId.startsWith('credit:')) {
      return { ok: true };
    }
    if (isFlowNodeId(otherId) && (!otherType || ['expense', 'income', 'leisure', 'investment'].includes(otherType))) {
      return { ok: true };
    }
    return { ok: false, reason: 'O totalizador liga itens a um banco ou cartão.' };
  }
  const fromHub = isHubNodeId(fromId);
  const toHub = isHubNodeId(toId);
  if (fromHub && toHub) {
    return { ok: false, reason: 'Contas não se ligam entre si.' };
  }
  if (!fromHub && !toHub) {
    // Recebimento↔recebimento, gasto↔gasto (ou qualquer item↔item) não faz sentido.
    return { ok: false, reason: 'Ligue um item a uma conta (banco/cartão/investimento).' };
  }
  const hubId = fromHub ? fromId : toId;
  const flowId = fromHub ? toId : fromId;
  const flowType = fromHub ? toType : fromType;
  if (!isFlowNodeId(flowId) && flowType && isAccountHubType(flowType)) {
    return { ok: false, reason: 'Ligue um item a uma conta.' };
  }
  // Conta de investimento (inv:) só faz sentido com aporte/investimento.
  if (hubId.startsWith('inv:') && flowType && flowType !== 'investment') {
    return { ok: false, reason: 'Conta de investimento só liga a aportes.' };
  }
  return { ok: true };
}

/** Categorias que o preview do hub pode criar (lazer só aparece se já existir no grafo). */
export const HUB_SPAWN_KINDS: ReadonlyArray<{
  kind: 'income' | 'expense' | 'investment' | 'leisure';
  label: string;
}> = [
  { kind: 'income', label: 'Recebimento' },
  { kind: 'expense', label: 'Gasto' },
  { kind: 'investment', label: 'Investimento' },
];

export const HUB_SPAWN_KIND_LEISURE = {
  kind: 'leisure' as const,
  label: 'Lazer',
};

export function blockColors(theme: GraphTheme): NodeColorSet {
  return theme === 'dark' ? { ...BLOCK_DARK } : { ...BLOCK_LIGHT };
}

/** @deprecated Prefer blockColors — mantido para chamadas existentes; agora ignora tipo/cor da entidade. */
export function nodeColors(
  _type: string,
  theme: GraphTheme,
  _entityColor?: string | null
): NodeColorSet {
  return blockColors(theme);
}

/** Cor do texto do bloco de valor (e saldos) conforme o kind. */
export function amountTextColor(kind: string, theme: GraphTheme, subKind?: string): string {
  const palette = theme === 'dark' ? AMOUNT_TEXT_DARK : AMOUNT_TEXT_LIGHT;
  const key = (subKind && palette[subKind] ? subKind : kind) || 'transfer';
  return palette[key] ?? (theme === 'dark' ? BLOCK_DARK.textColor : BLOCK_LIGHT.textColor);
}

export function balanceTextColor(amountBrl: number, theme: GraphTheme): string {
  const palette = theme === 'dark' ? AMOUNT_TEXT_DARK : AMOUNT_TEXT_LIGHT;
  return amountBrl >= 0 ? palette['balancePos'] : palette['balanceNeg'];
}

/** #RRGGBB → rgba(r,g,b,alpha). */
export function hexRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return hex;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function buildAmountLabel(amountBrl: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(amountBrl);
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
    (n) =>
      ['expense', 'investment', 'goal', 'installment'].includes(n.type) &&
      !banks.some((b) => b.id === n.id) &&
      connectedIds.has(n.id)
  );
  for (const orphan of orphanTargets) {
    const hasBankSource = edges.some((e) => e.to === orphan.id && banks.some((b) => b.id === e.from));
    if (!hasBankSource) {
      balanceLinks.push({ from: totalId, to: orphan.id });
    }
  }

  return { balanceNodes, balanceLinks };
}

export type AmountPlacement = 'between' | 'after-target';

/**
 * Onde colocar o bloco de valor:
 * - item → hub (ex.: receita → banco): entre os dois
 * - hub → item (ex.: banco → gasto/aporte): depois do título do item
 * - demais: entre os dois
 *
 * Usa ids quando disponíveis: nós `flow:` com type investment não são hubs.
 */
export function amountPlacement(
  fromType: string,
  toType: string,
  fromId?: string,
  toId?: string
): AmountPlacement {
  const fromHub = fromId ? isHubNodeId(fromId) : isAccountHubType(fromType);
  const toHub = toId ? isHubNodeId(toId) : isAccountHubType(toType);
  if (fromHub && !toHub) return 'after-target';
  return 'between';
}

export interface AmountSplitResult {
  amountNodeId: string;
  /** Se o valor ficou “pendurado” após o item de destino, esse id deve substituir o item em ligações de saldo. */
  appendAfterTargetId: string | null;
  edgeIds: [string, string];
}

/** Ids e metadados para partir uma aresta com valor em nó intermediário. */
export function planAmountSplit(edge: AccountFlowGraphEdge, fromType: string, toType: string): AmountSplitResult {
  const amountNodeId = `__amt_${edge.refId}_${edge.from}_${edge.to}`;
  const base = `e_${edge.refId}_${edge.from}_${edge.to}`;
  const placement = amountPlacement(fromType, toType, edge.from, edge.to);
  return {
    amountNodeId,
    appendAfterTargetId: placement === 'after-target' ? edge.to : null,
    edgeIds: [`${base}_a`, `${base}_b`],
  };
}

/**
 * Cor de fundo do bloco título: só bancos/cartões usam a cor da conta (opacidade baixa).
 * Demais blocos ficam no esquema monocromático.
 */
export function titleBlockColors(
  type: string,
  theme: GraphTheme,
  entityColor?: string | null
): NodeColorSet {
  const base = blockColors(theme);
  if ((type === 'bank' || type === 'credit') && entityColor) {
    return {
      ...base,
      bgColor: hexRgba(entityColor, theme === 'dark' ? 0.32 : 0.2),
    };
  }
  return base;
}

/** Resolve o id original da aresta da API a partir do id sintético `_a` / `_b`. */
export function matchOriginalEdgeId(cyEdgeId: string, edge: AccountFlowGraphEdge): boolean {
  const base = `e_${edge.refId}_${edge.from}_${edge.to}`;
  return cyEdgeId === base || cyEdgeId === `${base}_a` || cyEdgeId === `${base}_b`;
}
