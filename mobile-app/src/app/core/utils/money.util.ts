import { Currency } from '../models/api.models';

export function currencySymbol(currency: Currency): string {
  switch (currency) {
    case 'EUR':
      return '€';
    case 'USD':
      return 'US$';
    default:
      return 'R$';
  }
}

export function isForeignCurrency(currency: Currency): boolean {
  return currency === 'EUR' || currency === 'USD';
}

export function formatMoney(amount: number, currency: Currency = 'BRL'): string {
  if (currency === 'EUR') {
    return `€ ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (currency === 'USD') {
    return `US$ ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatMoneyWithBrl(
  amount: number,
  currency: Currency,
  amountBrl: number
): string {
  if (isForeignCurrency(currency)) {
    return `${formatMoney(amount, currency)} (${formatMoney(amountBrl, 'BRL')})`;
  }
  return formatMoney(amount, 'BRL');
}

export function entryAmount(entry: {
  currency?: Currency;
  amount?: number;
  suggestedAmount?: number;
  suggestedAmountBrl?: number;
  defaultAmountBrl?: number;
}): number {
  if (entry.amount != null) return entry.amount;
  if (entry.suggestedAmount != null) return entry.suggestedAmount;
  return entry.suggestedAmountBrl ?? entry.defaultAmountBrl ?? 0;
}

/** Preview em BRL usando a cotação da moeda estrangeira (EUR ou USD). */
export function previewBrl(amount: number, currency: Currency, rateToBrl: number): number {
  return isForeignCurrency(currency)
    ? Math.round(amount * rateToBrl * 100) / 100
    : amount;
}
