import {
  accountFlowBalances,
  amountPlacement,
  amountTextColor,
  balanceTextColor,
  blockColors,
  buildAmountLabel,
  canEditGraphNode,
  canLinkGraphNodes,
  cardAmounts,
  computeBalanceNodes,
  edgeAmountKey,
  edgeMatchesFilters,
  edgeVisibleForFilters,
  editDraftForNode,
  hasActiveFilters,
  hexRgba,
  isAccountHubType,
  isFlowNodeId,
  isGraphOutflowKind,
  isHubNodeId,
  isTotalizerNodeId,
  matchOriginalEdgeId,
  nodeColors,
  nodeVisibleForFilters,
  planAmountSplit,
  rewireDrop,
  spawnLinkFromNode,
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
    expect(canLinkGraphNodes('inv:1', 'exp:2', 'investment', 'expense').ok).toBeTrue();
    expect(canLinkGraphNodes('inv:1', 'flow:2', 'investment', 'investment').ok).toBeTrue();
    expect(canLinkGraphNodes('bank:1', 'flow:2', 'bank', 'investment').ok).toBeTrue();
    expect(canLinkGraphNodes('credit:1', 'flow:2', 'credit', 'investment').ok).toBeFalse();
    expect(canLinkGraphNodes('inc:1', 'inv:2', 'income', 'investment').ok).toBeTrue();
    expect(canLinkGraphNodes('', 'exp:1').ok).toBeFalse();
    expect(canLinkGraphNodes('exp:1', 'exp:1').ok).toBeFalse();
    expect(canLinkGraphNodes('tot:1', 'bank:2').ok).toBeTrue();
    expect(canLinkGraphNodes('credit:2', 'tot:1').ok).toBeTrue();
    expect(canLinkGraphNodes('tot:1', 'exp:2', 'totalizer', 'expense').ok).toBeTrue();
    expect(canLinkGraphNodes('tot:1', 'exp:2').ok).toBeTrue();
    expect(canLinkGraphNodes('tot:1', 'inv:2', 'totalizer', 'investment').ok).toBeFalse();
    expect(canLinkGraphNodes('bank:1', 'mystery', 'bank', 'investment').ok).toBeFalse();
    expect(isTotalizerNodeId('tot:4')).toBeTrue();
    expect(isTotalizerNodeId('exp:4')).toBeFalse();
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

  const none = { types: new Set<string>(), accounts: new Set<string>(), categories: new Set<string>(), tabs: new Set<string>() };

  function node(partial: Partial<AccountFlowGraphNode> & Pick<AccountFlowGraphNode, 'id' | 'type'>): AccountFlowGraphNode {
    return { label: partial.id, color: '#111', x: 0, y: 0, ...partial };
  }

  function edge(
    partial: Partial<AccountFlowGraphEdge> & Pick<AccountFlowGraphEdge, 'from' | 'to' | 'kind' | 'amountBrl'>
  ): AccountFlowGraphEdge {
    return {
      label: partial.kind,
      subKind: partial.kind,
      color: '#000',
      refId: 1,
      ...partial,
    };
  }

  describe('graph consistency rules', () => {
    it('classifies outflow kinds and flow ids', () => {
      expect(isGraphOutflowKind('expense')).toBeTrue();
      expect(isGraphOutflowKind('leisure')).toBeTrue();
      expect(isGraphOutflowKind('investment')).toBeTrue();
      expect(isGraphOutflowKind('income')).toBeFalse();
      expect(isGraphOutflowKind('transfer')).toBeFalse();
      expect(isAccountHubType('credit')).toBeTrue();
      expect(isFlowNodeId('tx:4')).toBeTrue();
      expect(isFlowNodeId('inc:1')).toBeTrue();
      expect(isFlowNodeId('xfer:2')).toBeTrue();
      expect(isFlowNodeId('goal:3')).toBeTrue();
      expect(isFlowNodeId('flow:8')).toBeTrue();
      expect(isFlowNodeId('bank:1')).toBeFalse();
      expect(isHubNodeId('tot:1')).toBeFalse();
    });

    it('colors unknown kinds and dark balances, and tints credit titles', () => {
      expect(amountTextColor('', 'light')).toBe('#5B5E6B');
      expect(amountTextColor('nope', 'light')).toBe('#14151A');
      expect(amountTextColor('nope', 'dark')).toBe('#F6F7F3');
      expect(amountTextColor('expense', 'light', 'goal')).toBe('#B5760A');
      expect(balanceTextColor(1, 'dark')).toBe('#6EE7B7');
      expect(balanceTextColor(-1, 'dark')).toBe('#FF9086');
      expect(titleBlockColors('credit', 'dark', '#3366FF').bgColor).toContain('rgba(');
      expect(titleBlockColors('bank', 'light', '#3366FF').bgColor).toContain('rgba(');
      expect(titleBlockColors('bank', 'light').bgColor).toBe('#FFFFFF');
      expect(nodeColors('x', 'dark').bgColor).toBe('#23262F');
    });

    it('places hub-sourced amounts after the item and splits that edge', () => {
      const split = planAmountSplit(edge({ from: 'bank:1', to: 'exp:2', kind: 'expense', amountBrl: 10, refId: 7 }), 'bank', 'expense');
      expect(split.appendAfterTargetId).toBe('exp:2');
      expect(matchOriginalEdgeId(`e_7_bank:1_exp:2`, edge({ from: 'bank:1', to: 'exp:2', kind: 'expense', amountBrl: 10, refId: 7 }))).toBeTrue();
      expect(matchOriginalEdgeId('other', edge({ from: 'a', to: 'b', kind: 'expense', amountBrl: 1 }))).toBeFalse();
      expect(amountPlacement('bank', 'expense', undefined, 'exp:2')).toBe('after-target');
    });

    it('keeps transfer and totalizer members out of account balances and counts leisure', () => {
      const nodes = [
        node({ id: 'bank:1', type: 'bank', label: 'Itaú' }),
        node({ id: 'credit:2', type: 'credit', label: 'Nubank' }),
        node({ id: 'bank:9', type: 'bank', label: 'Outro' }),
        node({ id: 'exp:1', type: 'expense' }),
        node({ id: 'lei:1', type: 'leisure' }),
        node({ id: 'lei:2', type: 'leisure' }),
        node({ id: 'flow:3', type: 'investment' }),
      ];
      const edges = [
        edge({ from: 'inc:1', to: 'bank:1', kind: 'income', amountBrl: 1000, refId: 1 }),
        edge({ from: 'bank:1', to: 'exp:1', kind: 'expense', amountBrl: 100, refId: 2 }),
        edge({ from: 'bank:1', to: 'lei:1', kind: 'leisure', amountBrl: 40, refId: 3 }),
        edge({ from: 'bank:1', to: 'flow:3', kind: 'investment', amountBrl: 60, refId: 4 }),
        edge({ from: 'bank:1', to: 'bank:9', kind: 'transfer', amountBrl: 500, refId: 5 }),
        edge({ from: 'credit:2', to: 'exp:1', kind: 'expense', amountBrl: 25, subKind: 'totalizer', refId: 6 }),
        edge({ from: 'inc:2', to: 'credit:2', kind: 'income', amountBrl: 80, refId: 7 }),
        edge({ from: 'credit:2', to: 'exp:1', kind: 'expense', amountBrl: 30, refId: 8 }),
        edge({ from: 'unassigned:1', to: 'lei:2', kind: 'leisure', amountBrl: 12, refId: 9 }),
      ];
      const balances = accountFlowBalances(nodes, edges);
      expect(balances.find((b) => b.accountId === 'bank:1')?.balance).toBe(800);
      expect(balances.find((b) => b.accountId === 'bank:1')?.destIds).toEqual(['exp:1', 'lei:1', 'flow:3']);
      expect(balances.find((b) => b.accountId === 'credit:2')?.balance).toBe(50);
      expect(balances.find((b) => b.accountId === 'bank:9')?.balance).toBe(0);

      const { balanceNodes, balanceLinks } = computeBalanceNodes(nodes, edges, { inflowBrl: 1080, outflowBrl: 230 });
      expect(balanceNodes.find((b) => b.id === 'balance:credit:2')?.amountBrl).toBe(50);
      expect(balanceLinks.some((l) => l.from === 'balance:total' && l.to === 'lei:2')).toBeTrue();
      expect(balanceLinks.some((l) => l.to === 'exp:1' && l.from === 'balance:total')).toBeFalse();
    });

    it('puts item amounts on cards; bank→inv goes on the investment block, not the edge', () => {
      const nodes = [
        node({ id: 'bank:1', type: 'bank', amountBrl: 999 }),
        node({ id: 'inc:1', type: 'income', amountBrl: 0 }),
        node({ id: 'exp:2', type: 'expense', amountBrl: 15 }),
        node({ id: 'tot:1', type: 'totalizer' }),
        node({ id: 'inv:1', type: 'investment' }),
        node({ id: 'misc:1', type: 'expense' }),
        node({ id: 'bank:2', type: 'bank' }),
        node({ id: 'bank:3', type: 'bank' }),
      ];
      const edges = [
        edge({ from: 'inc:1', to: 'bank:1', kind: 'income', amountBrl: 200, refId: 1 }),
        edge({ from: 'bank:1', to: 'exp:2', kind: 'expense', amountBrl: 40, refId: 2 }),
        edge({ from: 'bank:1', to: 'inv:1', kind: 'investment', amountBrl: 70, refId: 3 }),
        edge({ from: 'tot:1', to: 'exp:2', kind: 'transfer', amountBrl: 40, subKind: 'totalizer', refId: 4 }),
        edge({ from: 'misc:1', to: 'bank:1', kind: 'expense', amountBrl: 5, refId: 5 }),
        edge({ from: 'ghost:1', to: 'ghost:2', kind: 'expense', amountBrl: 1, refId: 6 }),
        edge({ from: 'bank:2', to: 'bank:3', kind: 'transfer', amountBrl: 25, refId: 7 }),
      ];
      const plan = cardAmounts(nodes, edges);
      expect(plan.byNode.get('inc:1')).toBe(200);
      expect(plan.byNode.get('exp:2')).toBe(40);
      expect(plan.byNode.get('tot:1')).toBe(40);
      expect(plan.byNode.get('inv:1')).toBe(70);
      expect(plan.byNode.has('bank:1')).toBeFalse();
      expect(plan.byNode.has('misc:1')).toBeFalse();
      expect(plan.hubEdgeAmounts.has(edgeAmountKey(edges[2]))).toBeFalse();
      expect(plan.hubEdgeAmounts.get(edgeAmountKey(edges[6]))).toBe(25);
    });

    it('keeps bank and credit chips from hiding every edge, and isolated hubs visible', () => {
      const bankEdge = edge({ from: 'bank:1', to: 'exp:2', kind: 'expense', amountBrl: 10, refId: 1 });
      const creditEdge = edge({ from: 'credit:2', to: 'exp:3', kind: 'leisure', amountBrl: 8, refId: 2 });
      const typeOf = (id: string) => (id.startsWith('bank') ? 'bank' : id.startsWith('credit') ? 'credit' : 'expense');
      expect(edgeVisibleForFilters(bankEdge, { ...none, types: new Set(['bank']) }, typeOf)).toBeTrue();
      expect(
        edgeVisibleForFilters(
          edge({ from: 'exp:9', to: 'bank:1', kind: 'transfer', amountBrl: 1, subKind: '' }),
          { ...none, types: new Set(['bank']) },
          typeOf
        )
      ).toBeTrue();
      expect(edgeVisibleForFilters(creditEdge, { ...none, types: new Set(['credit']) }, typeOf)).toBeTrue();
      expect(
        edgeVisibleForFilters(
          edge({ from: 'exp:9', to: 'credit:2', kind: 'transfer', amountBrl: 1, subKind: '' }),
          { ...none, types: new Set(['credit']) },
          typeOf
        )
      ).toBeTrue();
      expect(edgeVisibleForFilters(bankEdge, { ...none, types: new Set(['income']) }, typeOf)).toBeFalse();
      expect(edgeVisibleForFilters(bankEdge, { ...none, types: new Set(['expense']) }, typeOf)).toBeTrue();
      expect(
        edgeVisibleForFilters(bankEdge, { ...none, accounts: new Set(['other']) }, typeOf)
      ).toBeFalse();
      expect(edgeVisibleForFilters(bankEdge, none, typeOf)).toBeTrue();

      const tagged = edge({
        from: 'bank:1',
        to: 'exp:2',
        kind: 'expense',
        subKind: 'installment',
        amountBrl: 10,
        itemCategoryId: 5,
        customTabId: 3,
      });
      expect(edgeMatchesFilters(tagged, { ...none, types: new Set(['installment']) })).toBeTrue();
      expect(edgeMatchesFilters(tagged, { ...none, accounts: new Set(['nope']) })).toBeFalse();
      expect(edgeMatchesFilters(tagged, { ...none, categories: new Set(['5']) })).toBeTrue();
      expect(edgeMatchesFilters(tagged, { ...none, tabs: new Set(['3']) })).toBeTrue();
      expect(edgeMatchesFilters(tagged, { ...none, tabs: new Set(['9']) })).toBeFalse();
      expect(hasActiveFilters({ ...none, tabs: new Set(['3']) })).toBeTrue();

      expect(nodeVisibleForFilters('bank:1', 'bank', [], none)).toBeTrue();
      expect(nodeVisibleForFilters('bank:1', 'bank', [{ hidden: false }], { ...none, types: new Set(['income']) })).toBeTrue();
      expect(nodeVisibleForFilters('bank:1', 'bank', [], { ...none, types: new Set(['bank']) })).toBeTrue();
      expect(nodeVisibleForFilters('exp:2', 'expense', [], { ...none, types: new Set(['bank']) })).toBeFalse();
      expect(nodeVisibleForFilters('bank:1', 'bank', [], { ...none, accounts: new Set(['bank:1']) })).toBeTrue();
      expect(nodeVisibleForFilters('bank:1', 'bank', [], { ...none, accounts: new Set(['bank:9']) })).toBeFalse();
      expect(
        nodeVisibleForFilters('bank:1', 'bank', [{ hidden: true }], {
          ...none,
          types: new Set(['bank']),
          accounts: new Set(['bank:1']),
        })
      ).toBeFalse();
    });

    it('drafts edits from the real amount and the linked account', () => {
      expect(canEditGraphNode('bank:1')).toBeFalse();
      expect(canEditGraphNode('exp:2')).toBeTrue();
      expect(editDraftForNode(node({ id: 'bank:1', type: 'bank' }), [])).toBeNull();

      const expense = node({ id: 'exp:2', type: 'expense', isVariable: false, amountBrl: 3 });
      const edges = [
        edge({ from: 'bank:1', to: 'exp:2', kind: 'expense', amountBrl: 80, refId: 1 }),
        edge({ from: 'tot:1', to: 'exp:2', kind: 'transfer', amountBrl: 1, subKind: 'totalizer', refId: 2 }),
        edge({ from: 'exp:2', to: 'inv:4', kind: 'investment', amountBrl: 80, refId: 3 }),
        edge({ from: 'inc:9', to: 'exp:8', kind: 'expense', amountBrl: 1, refId: 4 }),
        edge({ from: 'exp:2', to: 'exp:8', kind: 'expense', amountBrl: 1, refId: 5 }),
      ];
      const draft = editDraftForNode(expense, edges);
      expect(draft).toEqual({
        mode: 'flow',
        kind: 'expense',
        amount: 80,
        accountId: 1,
        targetAccountId: null,
        recurrence: 'fixed',
      });

      const incomeOnInv = editDraftForNode(
        node({ id: 'inc:3', type: 'income', amountBrl: 50 }),
        [edge({ from: 'inc:3', to: 'inv:4', kind: 'income', amountBrl: 50, refId: 9 })]
      );
      expect(incomeOnInv).toEqual(
        jasmine.objectContaining({ kind: 'income', accountId: 4, targetAccountId: null })
      );

      expect(
        editDraftForNode(expense, [edge({ from: 'bank:', to: 'exp:2', kind: 'expense', amountBrl: 1 })] )?.accountId
      ).toBeNull();
      expect(editDraftForNode(node({ id: 'tot:9', type: 'expense' }), [])?.mode).toBe('totalizer');
      expect(editDraftForNode(node({ id: 'goal:1', type: 'goal', amountBrl: 12 }), [])).toEqual({
        mode: 'goal',
        kind: 'investment',
        amount: 12,
        accountId: null,
        targetAccountId: null,
        recurrence: 'fixed',
      });
      expect(editDraftForNode(node({ id: 'inc:1', type: 'income' }), [])?.kind).toBe('income');
      expect(editDraftForNode(node({ id: 'flow:1', type: 'investment' }), [])?.kind).toBe('investment');
      expect(editDraftForNode(node({ id: 'exp:9', type: 'leisure' }), [])?.kind).toBe('expense');
      expect(editDraftForNode(node({ id: 'exp:8', type: 'installment' }), [])?.recurrence).toBe('variable');
    });

    it('spawns a linked item with the hub account, including the account already on the item', () => {
      expect(spawnLinkFromNode('bank:3', node({ id: 'bank:3', type: 'bank' }), [])).toEqual({
        kind: 'expense',
        accountId: 3,
        targetAccountId: null,
        linkAccountNodeId: 'bank:3',
      });
      expect(spawnLinkFromNode('inv:5', node({ id: 'inv:5', type: 'investment' }), [])).toEqual({
        kind: 'expense',
        accountId: 5,
        targetAccountId: null,
        linkAccountNodeId: 'inv:5',
      });
      const fromItem = spawnLinkFromNode('inc:1', node({ id: 'inc:1', type: 'income' }), [
        edge({ from: 'bank:2', to: 'inc:1', kind: 'income', amountBrl: 10 }),
        edge({ from: 'inc:1', to: 'inv:6', kind: 'investment', amountBrl: 10, refId: 2 }),
        edge({ from: 'inc:1', to: 'exp:7', kind: 'expense', amountBrl: 1, refId: 3 }),
        edge({ from: 'ghost:1', to: 'ghost:2', kind: 'expense', amountBrl: 1, refId: 4 }),
      ]);
      expect(fromItem.kind).toBe('income');
      expect(fromItem.accountId).toBe(2);
      expect(fromItem.targetAccountId).toBeNull();
      expect(spawnLinkFromNode('flow:1', node({ id: 'flow:1', type: 'investment' }), []).kind).toBe('investment');
      expect(spawnLinkFromNode('exp:1', node({ id: 'exp:1', type: 'leisure' }), []).kind).toBe('expense');
      expect(spawnLinkFromNode('exp:1', undefined, []).kind).toBe('expense');
    });

    it('rewires the hub and keeps the item, unlinks on empty space, and refuses account-to-account', () => {
      expect(rewireDrop('bank:1', 'bank:2', 'bank:3')).toEqual({ action: 'cancel' });
      expect(rewireDrop('bank:1', 'exp:2', null)).toEqual({ action: 'unlink', flowNodeId: 'exp:2' });
      expect(rewireDrop('exp:2', 'bank:1', 'exp:2')).toEqual({ action: 'cancel' });
      expect(rewireDrop('exp:2', 'bank:1', 'bank:1')).toEqual({ action: 'cancel' });
      expect(rewireDrop('bank:1', 'exp:2', 'credit:4')).toEqual({ action: 'link', from: 'exp:2', to: 'credit:4' });
      expect(rewireDrop('tot:1', 'exp:2', 'bank:8')).toEqual({ action: 'link', from: 'exp:2', to: 'bank:8' });
      expect(rewireDrop('exp:2', 'tot:1', null)).toEqual({ action: 'unlink', flowNodeId: 'exp:2' });
      expect(rewireDrop('exp:1', 'exp:2', 'bank:1')).toEqual({ action: 'cancel' });
    });
  });
});
