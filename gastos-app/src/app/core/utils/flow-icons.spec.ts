import {
  accountTypeIcon,
  blockIcon,
  navIcon,
  nodeCardIcon,
  strokeIcon,
} from './flow-icons';

describe('flow-icons', () => {
  it('builds stroke icons and picks an icon per node', () => {
    expect(strokeIcon('<path/>')).toContain('width="18"');
    expect(blockIcon('<path/>', 12)).toContain('width="12"');
    expect(navIcon('<path/>')).toContain('width="20"');
    expect(accountTypeIcon('investment')).toContain('<svg');
    expect(accountTypeIcon('credit')).toContain('<svg');
    expect(accountTypeIcon('bank')).toContain('<svg');

    const cases: Array<[string, string]> = [
      ['__saldo', 'other'],
      ['bank:1', 'other'],
      ['x', 'bank'],
      ['credit:1', 'other'],
      ['x', 'credit'],
      ['inv:1', 'other'],
      ['tot:1', 'totalizer'],
      ['n', 'income'],
      ['n', 'expense'],
      ['n', 'leisure'],
      ['n', 'installment'],
      ['n', 'investment'],
      ['n', 'goal'],
      ['n', 'transfer'],
      ['n', 'other'],
    ];
    for (const [id, type] of cases) {
      expect(nodeCardIcon(id, type)).toContain('<svg');
    }
  });
});