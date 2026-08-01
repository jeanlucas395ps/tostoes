/** Rótulos curtos exibidos acima do título nos nós do grafo. */
export function nodeTypeLabel(type: string, unassigned = false): string {
  if (unassigned) return 'A DEFINIR';
  const map: Record<string, string> = {
    bank: 'BANCO',
    credit: 'CARTÃO',
    bill: 'FATURA',
    investment: 'INVEST.',
    expense: 'GASTO',
    income: 'RECEB.',
    goal: 'META',
    transfer: 'TRANSF.',
    installment: 'PARCELA',
    balance: 'SALDO',
    leisure: 'LAZER',
  };
  return map[type] ?? type.toUpperCase();
}

export function nodeDisplayName(label: string | undefined, fallback: string): string {
  if (!label) return fallback;
  const lines = label.split('\n');
  return (lines.length > 1 ? lines[1] : lines[0]) || fallback;
}

export function accountTypeShortLabel(type: string): string {
  if (type === 'investment') return 'Invest.';
  if (type === 'credit') return 'Cartão';
  return 'Banco';
}
