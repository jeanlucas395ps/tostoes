import { UserRef } from '../models/api.models';

export function responsibleLabel(
  item: { responsibleUser?: UserRef | null; responsible?: string | null } | null | undefined
): string {
  if (!item) return 'Conjunto';
  return item.responsibleUser?.name ?? item.responsible ?? 'Conjunto';
}

export function responsibleInitial(label: string): string {
  return label.charAt(0).toUpperCase();
}
