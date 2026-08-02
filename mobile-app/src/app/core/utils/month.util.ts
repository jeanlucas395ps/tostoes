/** Previsto só aparece no mês atual e nos meses futuros. */
export function isPastMonth(year: number, monthIndex: number): boolean {
  const today = new Date();
  const nowYear = today.getFullYear();
  const nowMonth = today.getMonth();
  if (year < nowYear) return true;
  if (year > nowYear) return false;
  return monthIndex < nowMonth;
}
