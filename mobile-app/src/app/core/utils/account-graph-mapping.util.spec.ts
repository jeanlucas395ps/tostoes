import {
  buildAmountLabel,
  computeBalanceNodes,
  edgeMatchesFilters,
  hasActiveFilters,
  hexRgba,
  nodeColors,
} from './account-graph-mapping.util';
import { AccountFlowGraphEdge, AccountFlowGraphNode } from '../models/api.models';

describe('account-graph-mapping.util', () => {
  it('converts a hex color to rgba with the given alpha', () => {
    expect(hexRgba('#FF0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
    expect(hexRgba('#0f0', 1)).toBe('rgba(0, 255, 0, 1)');
  });

  it('falls back to the original string for an invalid hex', () => {
    expect(hexRgba('not-a-color', 0.5)).toBe('not-a-color');
  });

  it('returns the palette entry for a known type', () => {
    const colors = nodeColors('income', 'light');
    expect(colors.borderColor).toBe('#1BAA5C');
  });

  it('falls back to the unassigned palette for an unknown type', () => {
    const colors = nodeColors('mystery', 'light');
    expect(colors.borderColor).toBe(nodeColors('unassigned', 'light').borderColor);
  });

  it('uses the entity own color for bank/credit/goal nodes when provided', () => {
    const colors = nodeColors('bank', 'light', '#123456');
    expect(colors.borderColor).toBe('#123456');
    expect(colors.bgColor).toBe(hexRgba('#123456', 0.08));
  });

  it('ignores the entity color for node types that do not support it', () => {
    const colors = nodeColors('expense', 'light', '#123456');
    expect(colors.borderColor).not.toBe('#123456');
  });

  it('uses a higher alpha for entity colors in dark mode', () => {
    const colors = nodeColors('goal', 'dark', '#123456');
    expect(colors.bgColor).toBe(hexRgba('#123456', 0.14));
  });

  it('formats amounts as BRL currency with no decimals', () => {
    expect(buildAmountLabel(1500)).toContain('1.500');
  });

  describe('filters', () => {
    const edge: AccountFlowGraphEdge = {
      from: 'bank:1',
      to: 'expense:2',
      amountBrl: 100,
      kind: 'expense',
      label: 'Mercado',
      subKind: 'expense',
      color: '#FF5630',
      refId: 2,
      itemCategoryId: 5,
      customTabId: 3,
    };

    it('reports no active filters when every set is empty', () => {
      expect(hasActiveFilters({ types: new Set(), accounts: new Set(), categories: new Set(), tabs: new Set() })).toBeFalse();
    });

    it('matches when no filters are active', () => {
      expect(edgeMatchesFilters(edge, { types: new Set(), accounts: new Set(), categories: new Set(), tabs: new Set() })).toBeTrue();
    });

    it('excludes edges whose kind is not in an active type filter', () => {
      const filters = { types: new Set(['income']), accounts: new Set<string>(), categories: new Set<string>(), tabs: new Set<string>() };
      expect(edgeMatchesFilters(edge, filters)).toBeFalse();
    });

    it('includes edges connected to a filtered account on either end', () => {
      const filters = { types: new Set<string>(), accounts: new Set(['expense:2']), categories: new Set<string>(), tabs: new Set<string>() };
      expect(edgeMatchesFilters(edge, filters)).toBeTrue();
    });

    it('matches the "geral" bucket for edges without a category or tab', () => {
      const untagged: AccountFlowGraphEdge = { ...edge, itemCategoryId: null, customTabId: null };
      const filters = { types: new Set<string>(), accounts: new Set<string>(), categories: new Set(['geral']), tabs: new Set(['geral']) };
      expect(edgeMatchesFilters(untagged, filters)).toBeTrue();
    });

    it('excludes edges outside the selected category', () => {
      const filters = { types: new Set<string>(), accounts: new Set<string>(), categories: new Set(['99']), tabs: new Set<string>() };
      expect(edgeMatchesFilters(edge, filters)).toBeFalse();
    });
  });

  describe('computeBalanceNodes', () => {
    const nodes: AccountFlowGraphNode[] = [
      { id: 'bank:1', type: 'bank', label: 'Itaú', color: '#3B82F6', x: 0, y: 0 },
      { id: 'expense:2', type: 'expense', label: 'Mercado', color: '#FF5630', x: 0, y: 0 },
      { id: 'goal:3', type: 'goal', label: 'Viagem', color: '#F59E0B', x: 0, y: 0 },
    ];
    const edges: AccountFlowGraphEdge[] = [
      { from: 'income:0', to: 'bank:1', amountBrl: 5000, kind: 'income', label: 'Salário', subKind: 'income', color: '#22C55E', refId: 1 },
      { from: 'bank:1', to: 'expense:2', amountBrl: 300, kind: 'expense', label: 'Mercado', subKind: 'expense', color: '#FF5630', refId: 2 },
      { from: 'unassigned:4', to: 'goal:3', amountBrl: 200, kind: 'investment', label: 'Viagem', subKind: 'goal', color: '#F59E0B', refId: 4 },
    ];

    it('computes one balance node per bank as inflow minus outflow', () => {
      const { balanceNodes } = computeBalanceNodes(nodes, edges, { inflowBrl: 5000, outflowBrl: 500 });
      const bankBalance = balanceNodes.find((b) => b.id === 'balance:bank:1');
      expect(bankBalance?.amountBrl).toBe(4700);
    });

    it('adds a grand total node from the graph totals', () => {
      const { balanceNodes } = computeBalanceNodes(nodes, edges, { inflowBrl: 5000, outflowBrl: 500 });
      const total = balanceNodes.find((b) => b.id === 'balance:total');
      expect(total?.amountBrl).toBe(4500);
    });

    it('links orphan destinations without a bank source to the total node', () => {
      const { balanceLinks } = computeBalanceNodes(nodes, edges, { inflowBrl: 5000, outflowBrl: 500 });
      expect(balanceLinks).toContain({ from: 'balance:total', to: 'goal:3' } as never);
    });

    it('does not link destinations that already have a bank source', () => {
      const { balanceLinks } = computeBalanceNodes(nodes, edges, { inflowBrl: 5000, outflowBrl: 500 });
      const linkedToExpense = balanceLinks.some((l) => l.to === 'expense:2' && l.from === 'balance:total');
      expect(linkedToExpense).toBeFalse();
    });
  });
});
