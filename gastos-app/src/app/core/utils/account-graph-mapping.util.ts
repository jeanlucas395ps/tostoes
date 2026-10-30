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
  // Conta de investimento: aporte, meta, recebimento (ex. rendimento) ou gasto.
  if (hubId.startsWith('inv:') && flowType) {
    const okWithInv = ['investment', 'goal', 'income', 'expense', 'leisure'].includes(flowType);
    if (!okWithInv) {
      return {
        ok: false,
        reason: 'Conta de investimento liga a aporte, meta, recebimento ou gasto.',
      };
    }
  }
  // Aporte: sai de banco (corrente) e entra só em conta do tipo investimento.
  if (flowType === 'investment') {
    if (hubId.startsWith('inv:') || hubId.startsWith('bank:')) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: 'Aporte liga a um banco (saída) ou a uma conta de investimento (destino).',
    };
  }
  if (flowType === 'transfer') {
    if (hubId.startsWith('bank:') || hubId.startsWith('credit:')) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: 'Transferência liga a banco ou cartão.',
    };
  }
  return { ok: true };
}

/** Categorias que o preview do hub pode criar. */
export const HUB_SPAWN_KINDS: ReadonlyArray<{
  kind: 'income' | 'expense' | 'investment';
  label: string;
}> = [
  { kind: 'income', label: 'Recebimento' },
  { kind: 'expense', label: 'Gasto' },
  { kind: 'investment', label: 'Investimento' },
];

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

const OUTFLOW_KINDS = new Set(['expense', 'leisure', 'investment']);

/** Saída que entra no saldo da conta e no total da barra. Transferência fica de fora. */
export function isGraphOutflowKind(kind: string): boolean {
  return OUTFLOW_KINDS.has(kind);
}

export interface AccountFlowBalance {
  accountId: string;
  label: string;
  balance: number;
  destIds: string[];
}

/**
 * Saldo por banco e cartão: entradas (income) − saídas (gasto, lazer, aporte).
 * Conta de investimento NÃO tem totalizador ligado ao Total — o aporte já
 * conta como saída do banco de origem (como um gasto com destino).
 * Transferência e aresta de membro de totalizador não alteram o saldo.
 */
export function accountFlowBalances(
  nodes: AccountFlowGraphNode[],
  edges: AccountFlowGraphEdge[]
): AccountFlowBalance[] {
  const accounts = nodes.filter((n) => n.type === 'bank' || n.type === 'credit');
  return accounts.map((account) => {
    let balance = 0;
    const destIds: string[] = [];
    for (const e of edges) {
      if (e.subKind === 'totalizer') continue;
      if (e.to === account.id && e.kind === 'income') balance += e.amountBrl;
      if (e.from === account.id && isGraphOutflowKind(e.kind)) {
        balance -= e.amountBrl;
        const tgt = nodes.find((n) => n.id === e.to);
        if (
          tgt &&
          !isHubNodeId(tgt.id) &&
          ['expense', 'leisure', 'investment', 'goal', 'installment'].includes(tgt.type)
        ) {
          destIds.push(e.to);
        }
      }
    }
    return { accountId: account.id, label: account.label, balance, destIds };
  });
}

/** Sintetiza um nó "Saldo" por banco/cartão + um nó "Saldo Total" ligado a destinos órfãos. */
export function computeBalanceNodes(
  nodes: AccountFlowGraphNode[],
  edges: AccountFlowGraphEdge[],
  totals: { inflowBrl: number; outflowBrl: number }
): { balanceNodes: BalanceNode[]; balanceLinks: BalanceLink[] } {
  const accounts = accountFlowBalances(nodes, edges);
  const accountIds = new Set(accounts.map((a) => a.accountId));
  const balanceNodes: BalanceNode[] = accounts.map((a) => ({
    id: `balance:${a.accountId}`,
    label: a.label,
    amountBrl: a.balance,
  }));
  const balanceLinks: BalanceLink[] = accounts.map((a) => ({
    from: a.accountId,
    to: `balance:${a.accountId}`,
  }));

  const totalId = 'balance:total';
  balanceNodes.push({
    id: totalId,
    label: 'Saldo Total',
    amountBrl: totals.inflowBrl - totals.outflowBrl,
  });

  const connectedIds = new Set(edges.flatMap((e) => [e.from, e.to]));
  const orphanTargets = nodes.filter(
    (n) =>
      ['expense', 'leisure', 'investment', 'goal', 'installment'].includes(n.type) &&
      connectedIds.has(n.id)
  );
  for (const orphan of orphanTargets) {
    const hasAccountSource = edges.some(
      (e) => e.to === orphan.id && accountIds.has(e.from) && isGraphOutflowKind(e.kind)
    );
    if (!hasAccountSource) {
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

export function edgeAmountKey(edge: { from: string; to: string; refId: number }): string {
  return `${edge.from}|${edge.to}|${edge.refId}`;
}

export interface CardAmountPlan {
  byNode: Map<string, number>;
  /** Aresta entre dois hubs (transferência, aporte para conta de investimento). */
  hubEdgeAmounts: Map<string, number>;
}

/** Valor no cartão do item. Transferência hub↔hub genérica pode ir na aresta; aporte não. */
export function cardAmounts(
  nodes: AccountFlowGraphNode[],
  edges: AccountFlowGraphEdge[]
): CardAmountPlan {
  const byNode = new Map<string, number>();
  const hubEdgeAmounts = new Map<string, number>();
  for (const n of nodes) {
    if (typeof n.amountBrl === 'number' && n.amountBrl > 0 && !isHubNodeId(n.id)) {
      byNode.set(n.id, n.amountBrl);
    }
  }
  const types = new Map(nodes.map((n) => [n.id, n.type]));
  for (const e of edges) {
    if (isHubNodeId(e.from) && isHubNodeId(e.to)) {
      // Banco → investimento: valor no bloco de destino, nunca na linha.
      const isAporte =
        e.kind === 'investment' ||
        e.subKind === 'investment' ||
        e.subKind === 'goal' ||
        (e.from.startsWith('bank:') && e.to.startsWith('inv:'));
      if (isAporte) {
        byNode.set(e.to, (byNode.get(e.to) ?? 0) + e.amountBrl);
        continue;
      }
      hubEdgeAmounts.set(edgeAmountKey(e), e.amountBrl);
      continue;
    }
    const placement = amountPlacement(types.get(e.from) ?? '', types.get(e.to) ?? '', e.from, e.to);
    const owner =
      placement === 'after-target'
        ? e.to
        : isFlowNodeId(e.from) || e.from.startsWith('tot:')
          ? e.from
          : e.to;
    if (!isHubNodeId(owner)) byNode.set(owner, e.amountBrl);
  }
  return { byNode, hubEdgeAmounts };
}

/** Filtro de tipo: kind/subKind, ou ponta banco/cartão quando o chip é da conta. */
export function edgeVisibleForFilters(
  edge: AccountFlowGraphEdge,
  filters: GraphFilterState,
  typeOf: (id: string) => string
): boolean {
  if (filters.types.size) {
    const kindHit = filters.types.has(edge.kind) || (!!edge.subKind && filters.types.has(edge.subKind));
    const bankHit = filters.types.has('bank') && (typeOf(edge.from) === 'bank' || typeOf(edge.to) === 'bank');
    const creditHit =
      filters.types.has('credit') && (typeOf(edge.from) === 'credit' || typeOf(edge.to) === 'credit');
    if (!kindHit && !bankHit && !creditHit) return false;
  }
  return edgeMatchesFilters(edge, {
    types: new Set(),
    accounts: filters.accounts,
    categories: filters.categories,
    tabs: filters.tabs,
  });
}

/** Nó isolado só permanece se o filtro de tipo ou de conta aponta para ele. */
export function nodeVisibleForFilters(
  nodeId: string,
  nodeType: string,
  flowEdges: Array<{ hidden: boolean }>,
  filters: GraphFilterState
): boolean {
  if (!hasActiveFilters(filters)) return true;
  if (flowEdges.some((e) => !e.hidden)) return true;
  const typeOnly =
    filters.types.size > 0 && !filters.accounts.size && !filters.categories.size && !filters.tabs.size;
  if (flowEdges.length === 0 && typeOnly && filters.types.has(nodeType)) return true;
  const accountOnly =
    filters.accounts.size > 0 && !filters.types.size && !filters.categories.size && !filters.tabs.size;
  if (flowEdges.length === 0 && accountOnly && filters.accounts.has(nodeId)) return true;
  return false;
}

export type GraphEditKind = 'income' | 'expense' | 'investment' | 'transfer';

export interface GraphEditDraft {
  mode: 'flow' | 'totalizer' | 'goal';
  kind: GraphEditKind;
  amount: number;
  accountId: number | null;
  targetAccountId: number | null;
  recurrence: 'fixed' | 'variable';
}

export function canEditGraphNode(nodeId: string): boolean {
  return !isHubNodeId(nodeId);
}

function hubAccountId(nodeId: string): number | null {
  const m = /^(bank|credit|inv):(\d+)$/.exec(nodeId);
  return m ? Number(m[2]) : null;
}

/** Preenche o painel com o valor e a conta reais do nó. Hub não é item. */
export function editDraftForNode(
  node: AccountFlowGraphNode,
  edges: AccountFlowGraphEdge[]
): GraphEditDraft | null {
  if (isHubNodeId(node.id)) return null;
  const amountEdge = edges.find(
    (e) => (e.from === node.id || e.to === node.id) && e.subKind !== 'totalizer'
  );
  const amount = amountEdge?.amountBrl ?? node.amountBrl ?? 0;
  const recurrence: 'fixed' | 'variable' = node.isVariable === false ? 'fixed' : 'variable';

  const hubsAsAporte = (): { accountId: number | null; targetAccountId: number | null } => {
    let accountId: number | null = null;
    let targetAccountId: number | null = null;
    for (const e of edges) {
      if (e.subKind === 'totalizer') continue;
      const other = e.from === node.id ? e.to : e.to === node.id ? e.from : null;
      if (!other || !isHubNodeId(other)) continue;
      const id = hubAccountId(other);
      if (other.startsWith('inv:')) targetAccountId = id;
      else accountId = id;
    }
    return { accountId, targetAccountId };
  };

  if (node.type === 'totalizer' || node.id.startsWith('tot:')) {
    const hubs = hubsAsAporte();
    return { mode: 'totalizer', kind: 'expense', amount, ...hubs, recurrence: 'variable' };
  }
  if (node.type === 'goal') {
    const hubs = hubsAsAporte();
    return { mode: 'goal', kind: 'investment', amount, ...hubs, recurrence: 'fixed' };
  }
  const kind: GraphEditKind =
    node.type === 'income'
      ? 'income'
      : node.type === 'investment'
        ? 'investment'
        : node.type === 'transfer'
          ? 'transfer'
          : 'expense';
  let accountId: number | null = null;
  let targetAccountId: number | null = null;
  const invIsPrimary = kind === 'income' || kind === 'expense';
  for (const e of edges) {
    if (e.subKind === 'totalizer') continue;
    const other = e.from === node.id ? e.to : e.to === node.id ? e.from : null;
    if (!other || !isHubNodeId(other)) continue;
    const id = hubAccountId(other);
    if (invIsPrimary) {
      // Recebimento/gasto: investimento também é a conta principal (não destino de aporte).
      if (accountId === null || e === amountEdge) accountId = id;
      continue;
    }
    if (other.startsWith('inv:')) targetAccountId = id;
    else accountId = id;
  }
  return { mode: 'flow', kind, amount, accountId, targetAccountId, recurrence };
}

export interface SpawnLink {
  kind: GraphEditKind;
  accountId: number | null;
  targetAccountId: number | null;
  linkAccountNodeId: string | null;
}

/** "+ Novo ligado" herda a conta do hub, ou a conta já ligada ao item. */
export function spawnLinkFromNode(
  nodeId: string,
  node: AccountFlowGraphNode | undefined,
  edges: AccountFlowGraphEdge[]
): SpawnLink {
  if (isHubNodeId(nodeId)) {
    const id = hubAccountId(nodeId);
    // Banco, cartão ou investimento → gasto saindo da conta (aporte continua na paleta).
    return {
      kind: 'expense',
      accountId: id,
      targetAccountId: null,
      linkAccountNodeId: nodeId,
    };
  }
  let kind: GraphEditKind = 'expense';
  if (node?.type === 'income') kind = 'income';
  else if (node?.type === 'investment') kind = 'investment';
  else if (node?.type === 'transfer') kind = 'transfer';
  let accountId: number | null = null;
  let targetAccountId: number | null = null;
  let linkAccountNodeId: string | null = null;
  const invIsPrimary = kind === 'income' || kind === 'expense';
  for (const e of edges) {
    const other = e.from === nodeId ? e.to : e.to === nodeId ? e.from : null;
    if (!other || !isHubNodeId(other)) continue;
    linkAccountNodeId = other;
    const id = hubAccountId(other);
    if (invIsPrimary) {
      if (accountId === null) accountId = id;
      continue;
    }
    if (other.startsWith('inv:')) targetAccountId = id;
    else accountId = id;
  }
  return { kind, accountId, targetAccountId, linkAccountNodeId };
}

export type RewireDecision =
  | { action: 'cancel' }
  | { action: 'unlink'; flowNodeId: string }
  | { action: 'link'; from: string; to: string };

function flowEndOfEdge(from: string, to: string): { flow: string; anchor: string } | null {
  const fromAnchor = isHubNodeId(from) || from.startsWith('tot:');
  const toAnchor = isHubNodeId(to) || to.startsWith('tot:');
  if (fromAnchor && !toAnchor) return { flow: to, anchor: from };
  if (toAnchor && !fromAnchor) return { flow: from, anchor: to };
  return null;
}

/**
 * Arrastar a aresta troca o hub e mantém o item.
 * Soltar no vazio desliga. Soltar no mesmo extremo cancela. Conta↔conta não religa.
 */
export function rewireDrop(from: string, to: string, hit: string | null): RewireDecision {
  const ends = flowEndOfEdge(from, to);
  if (!ends) return { action: 'cancel' };
  if (!hit) return { action: 'unlink', flowNodeId: ends.flow };
  if (hit === ends.flow || hit === ends.anchor) return { action: 'cancel' };
  return { action: 'link', from: ends.flow, to: hit };
}
