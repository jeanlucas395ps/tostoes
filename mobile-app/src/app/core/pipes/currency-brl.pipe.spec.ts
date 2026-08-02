import { CurrencyBrlPipe } from './currency-brl.pipe';

describe('CurrencyBrlPipe', () => {
  const pipe = new CurrencyBrlPipe();
  it('formats', () => {
    expect(pipe.transform(1234.5)).toContain('1.234,50');
    expect(pipe.transform(null)).toContain('0,00');
  });
});
