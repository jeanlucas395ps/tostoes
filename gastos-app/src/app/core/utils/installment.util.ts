/**
 * Helpers de parcelamento / cartão usados em Movimentos.
 * Extraídos para cobrir regras críticas sem subir o componente inteiro.
 */
export function shouldAskInstallmentPrompt(opts: {
  accountType?: string | null;
  kind: string;
  isInstallment?: boolean;
  isGoal?: boolean;
  recurringItemId?: number | null;
}): boolean {
  return (
    opts.accountType === 'credit' &&
    (opts.kind === 'expense' || opts.kind === 'leisure') &&
    !opts.isInstallment &&
    !opts.isGoal &&
    !opts.recurringItemId
  );
}

export function installmentEndMonth(startYear: number, startMonthIndex: number, count: number): string {
  const n = Math.max(2, Math.min(48, count || 2));
  const end = new Date(startYear, startMonthIndex + n - 1, 1);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`;
}

export function clampInstallmentCount(n: number): number {
  return Math.max(2, Math.min(48, n || 2));
}
