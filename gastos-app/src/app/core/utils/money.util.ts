import { Currency } from '../models/api.models';

export function formatMoney(amount: number, currency: Currency = 'BRL'): string {
  if (currency === 'EUR') {
    return `€ ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatMoneyWithBrl(
  amount: number,
  currency: Currency,
  amountBrl: number
): string {
  if (currency === 'EUR') {
    return `${formatMoney(amount, 'EUR')} (${formatMoney(amountBrl, 'BRL')})`;
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

export function previewBrl(amount: number, currency: Currency, eurToBrl: number): number {
  return currency === 'EUR' ? Math.round(amount * eurToBrl * 100) / 100 : amount;
}
