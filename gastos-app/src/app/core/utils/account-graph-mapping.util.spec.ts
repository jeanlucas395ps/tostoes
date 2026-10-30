import {
  amountPlacement,
  amountTextColor,
  balanceTextColor,
  blockColors,
  buildAmountLabel,
  canLinkGraphNodes,
  computeBalanceNodes,
  edgeMatchesFilters,
  hasActiveFilters,
  hexRgba,
  isAccountHubType,
  isFlowNodeId,
  isHubNodeId,
  matchOriginalEdgeId,
  nodeColors,
  planAmountSplit,
  titleBlockColors,
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

  it('uses white block with black border in light mode for every node type', () => {
    const colors = nodeColors('income', 'light');
    expect(colors).toEqual(blockColors('light'));
    expect(colors.bgColor).toBe('#FFFFFF');
    expect(colors.borderColor).toBe('#14151A');
  });

  it('uses theme background with white border in dark mode', () => {
    const colors = blockColors('dark');
    expect(colors.bgColor).toBe('#23262F');
    expect(colors.borderColor).toBe('#F6F7F3');
  });

  it('ignores entity color — blocks stay monochrome', () => {
    const colors = nodeColors('bank', 'light', '#123456');
    expect(colors.borderColor).toBe('#14151A');
    expect(colors.bgColor).toBe('#FFFFFF');
  });

  it('colors amount text green for income and red for expense', () => {
    expect(amountTextColor('income', 'light')).toBe('#1BAA5C');
    expect(amountTextColor('expense', 'light')).toBe('#E5342B');
    expect(amountTextColor('expense', 'dark')).toBe('#FF6B5E');
  });

  it('colors balance text by sign', () => {
    expect(balanceTextColor(10, 'light')).toBe('#0E8245');
    expect(balanceTextColor(-10, 'light')).toBe('#A8241D');
  });

  it('identifies account hubs vs flow items', () => {
    expect(isAccountHubType('bank')).toBeTrue();
    expect(isAccountHubType('investment')).toBeTrue();
    expect(isAccountHubType('expense')).toBeFalse();
  });

  it('places amount between income and bank, and after expense when bank is source', () => {
    expect(amountPlacement('income', 'bank')).toBe('between');
    expect(amountPlacement('bank', 'expense')).toBe('after-target');
    // aporte: type investment mas id de fluxo — valor depois do título
    expect(amountPlacement('bank', 'investment', 'bank:1', 'flow:9')).toBe('after-target');
    expect(amountPlacement('bank', 'investment', 'bank:1', 'inv:2')).toBe('between');
  });

  it('tints only bank/credit title blocks with entity color', () => {
    const bank = titleBlockColors('bank', 'light', '#3366FF');
    expect(bank.bgColor).toContain('rgba(');
    expect(titleBlockColors('expense', 'light', '#3366FF').bgColor).toBe('#FFFFFF');
    expect(titleBlockColors('investment', 'light', '#3366FF').bgColor).toBe('#FFFFFF');
  });

  it('classifies hub and flow node ids', () => {
    expect(isHubNodeId('bank:1')).toBeTrue();
    expect(isHubNodeId('credit:2')).toBeTrue();
    expect(isHubNodeId('inv:3')).toBeTrue();
    expect(isFlowNodeId('exp:9')).toBeTrue();
    expect(isFlowNodeId('unassigned:4')).toBeTrue();
    expect(isHubNodeId('exp:9')).toBeFalse();
  });

  it('allows only coherent account↔item links', () => {
    expect(canLinkGraphNodes('bank:1', 'exp:2', 'bank', 'expense').ok).toBeTrue();
    expect(canLinkGraphNodes('inc:1', 'bank:2', 'income', 'bank').ok).toBeTrue();
    expect(canLinkGraphNodes('exp:1', 'exp:2', 'expense', 'expense').ok).toBeFalse();
    expect(canLinkGraphNodes('inc:1', 'inc:2', 'income', 'income').ok).toBeFalse();
    expect(canLinkGraphNodes('inc:1', 'exp:2', 'income', 'expense').ok).toBeFalse();
    expect(canLinkGraphNodes('bank:1', 'bank:2', 'bank', 'bank').ok).toBeFalse();
    expect(canLinkGraphNodes('inv:1', 'exp:2', 'investment', 'expense').ok).toBeFalse();
    expect(canLinkGraphNodes('inv:1', 'flow:2', 'investment', 'investment').ok).toBeTrue();
  });

  it('plans split ids for an edge', () => {
    const edge: AccountFlowGraphEdge = {
      from: 'income:1',
      to: 'bank:2',
      amountBrl: 1000,
      kind: 'income',
      label: 'Salário',
      subKind: 'income',
      color: '#22C55E',
      refId: 9,
    };
    const plan = planAmountSplit(edge, 'income', 'bank');
    expect(plan.amountNodeId).toBe('__amt_9_income:1_bank:2');
    expect(plan.appendAfterTargetId).toBeNull();
    expect(plan.edgeIds[0]).toContain('_a');
    expect(matchOriginalEdgeId(plan.edgeIds[0], edge)).toBeTrue();
    expect(matchOriginalEdgeId(plan.edgeIds[1], edge)).toBeTrue();
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
      expect(
        hasActiveFilters({ types: new Set(), accounts: new Set(), categories: new Set(), tabs: new Set() })
      ).toBeFalse();
    });

    it('matches when no filters are active', () => {
      expect(
        edgeMatchesFilters(edge, {
          types: new Set(),
          accounts: new Set(),
          categories: new Set(),
          tabs: new Set(),
        })
      ).toBeTrue();
    });

    it('excludes edges whose kind is not in an active type filter', () => {
      const filters = {
        types: new Set(['income']),
        accounts: new Set<string>(),
        categories: new Set<string>(),
        tabs: new Set<string>(),
      };
      expect(edgeMatchesFilters(edge, filters)).toBeFalse();
    });

    it('includes edges connected to a filtered account on either end', () => {
      const filters = {
        types: new Set<string>(),
        accounts: new Set(['expense:2']),
        categories: new Set<string>(),
        tabs: new Set<string>(),
      };
      expect(edgeMatchesFilters(edge, filters)).toBeTrue();
    });

    it('matches the "geral" bucket for edges without a category or tab', () => {
      const untagged: AccountFlowGraphEdge = { ...edge, itemCategoryId: null, customTabId: null };
      const filters = {
        types: new Set<string>(),
        accounts: new Set<string>(),
        categories: new Set(['geral']),
        tabs: new Set(['geral']),
      };
      expect(edgeMatchesFilters(untagged, filters)).toBeTrue();
    });

    it('excludes edges outside the selected category', () => {
      const filters = {
        types: new Set<string>(),
        accounts: new Set<string>(),
        categories: new Set(['99']),
        tabs: new Set<string>(),
      };
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
      {
        from: 'income:0',
        to: 'bank:1',
        amountBrl: 5000,
        kind: 'income',
        label: 'Salário',
        subKind: 'income',
        color: '#22C55E',
        refId: 1,
      },
      {
        from: 'bank:1',
        to: 'expense:2',
        amountBrl: 300,
        kind: 'expense',
        label: 'Mercado',
        subKind: 'expense',
        color: '#FF5630',
        refId: 2,
      },
      {
        from: 'unassigned:4',
        to: 'goal:3',
        amountBrl: 200,
        kind: 'investment',
        label: 'Viagem',
        subKind: 'goal',
        color: '#F59E0B',
        refId: 4,
      },
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
