import {
  accountTypeShortLabel,
  nodeDisplayName,
  nodeTypeLabel,
} from './account-labels.util';

describe('account-labels.util', () => {
  it('nodeTypeLabel', () => {
    expect(nodeTypeLabel('bank')).toBe('BANCO');
    expect(nodeTypeLabel('credit')).toBe('CARTÃO');
    expect(nodeTypeLabel('x', true)).toBe('A DEFINIR');
    expect(nodeTypeLabel('custom')).toBe('CUSTOM');
  });

  it('nodeDisplayName', () => {
    expect(nodeDisplayName(undefined, 'X')).toBe('X');
    expect(nodeDisplayName('A\nBanco', 'X')).toBe('Banco');
    expect(nodeDisplayName('Só', 'X')).toBe('Só');
  });

  it('accountTypeShortLabel', () => {
    expect(accountTypeShortLabel('investment')).toBe('Invest.');
    expect(accountTypeShortLabel('credit')).toBe('Cartão');
    expect(accountTypeShortLabel('bank')).toBe('Banco');
  });
});
