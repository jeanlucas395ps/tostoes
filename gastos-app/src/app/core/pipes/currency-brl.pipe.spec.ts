import { CurrencyBrlPipe } from './currency-brl.pipe';

describe('CurrencyBrlPipe', () => {
  const pipe = new CurrencyBrlPipe();

  it('formats number as BRL', () => {
    expect(pipe.transform(1234.5)).toContain('1.234,50');
  });

  it('treats null/undefined as 0', () => {
    expect(pipe.transform(null)).toContain('0,00');
    expect(pipe.transform(undefined)).toContain('0,00');
  });
});
