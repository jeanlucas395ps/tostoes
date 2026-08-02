import { responsibleInitial, responsibleLabel } from './responsible.util';

describe('responsible.util', () => {
  describe('responsibleLabel', () => {
    it('returns Conjunto for null/undefined', () => {
      expect(responsibleLabel(null)).toBe('Conjunto');
      expect(responsibleLabel(undefined)).toBe('Conjunto');
    });

    it('prefers responsibleUser.name', () => {
      expect(
        responsibleLabel({
          responsibleUser: { id: 1, name: 'Ana', username: 'ana', gender: 'female' },
          responsible: 'Outro',
        })
      ).toBe('Ana');
    });

    it('falls back to responsible text', () => {
      expect(responsibleLabel({ responsible: 'Jean' })).toBe('Jean');
    });

    it('defaults to Conjunto when empty', () => {
      expect(responsibleLabel({})).toBe('Conjunto');
    });
  });

  describe('responsibleInitial', () => {
    it('returns uppercase first char', () => {
      expect(responsibleInitial('ana')).toBe('A');
      expect(responsibleInitial('Conjunto')).toBe('C');
    });
  });
});
