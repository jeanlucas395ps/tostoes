import { responsibleInitial, responsibleLabel } from './responsible.util';

describe('responsible.util', () => {
  it('responsibleLabel', () => {
    expect(responsibleLabel(null)).toBe('Conjunto');
    expect(
      responsibleLabel({
        responsibleUser: { id: 1, name: 'Ana', username: 'ana', gender: 'female' },
        responsible: 'Outro',
      })
    ).toBe('Ana');
    expect(responsibleLabel({ responsible: 'Jean' })).toBe('Jean');
    expect(responsibleLabel({})).toBe('Conjunto');
  });

  it('responsibleInitial', () => {
    expect(responsibleInitial('ana')).toBe('A');
  });
});
