import { PlanningUsageStart } from '../models/api.models';

/** Mês (1–12) anterior ao início de uso do planejamento. */
export function isBeforePlanningUsageStart(
  year: number,
  month: number,
  start: PlanningUsageStart | null | undefined
): boolean {
  if (!start) return false;
  if (year < start.year) return true;
  if (year > start.year) return false;
  return month < start.month;
}

/** Índice 0-based do mês selecionável para o ano (clamp ao início do planejamento). */
export function clampMonthIndexForYear(
  year: number,
  monthIndex: number,
  start: PlanningUsageStart | null | undefined
): number {
  if (!start || year < start.year) return 0;
  if (year > start.year) return monthIndex;
  const minIdx = start.month - 1;
  return Math.max(minIdx, Math.min(11, monthIndex));
}

export function accountMonthActive(
  year: number,
  month: number,
  accountStart: PlanningUsageStart | null | undefined,
  planningStart: PlanningUsageStart | null | undefined
): boolean {
  const start = accountStart ?? planningStart;
  return !isBeforePlanningUsageStart(year, month, start);
}
