/**
 * Ícones stroke compartilhados (linguagem visual do grafo / cards tipo n8n).
 * viewBox 24×24, stroke 1.75, currentColor.
 */

export function strokeIcon(paths: string, size = 18): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

/** @deprecated Prefer strokeIcon — alias usado no grafo. */
export function blockIcon(paths: string, size = 18): string {
  return strokeIcon(paths, size);
}

export const ICON_PATHS = {
  income: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  expense:
    '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2z"/><path d="M8 7h8"/><path d="M8 11h8"/>',
  trend:
    '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  bank: '<polygon points="12 2 20 7 4 7"/><line x1="6" x2="6" y1="11" y2="18"/><line x1="10" x2="10" y1="11" y2="18"/><line x1="14" x2="14" y1="11" y2="18"/><line x1="18" x2="18" y1="11" y2="18"/><line x1="3" x2="21" y1="22" y2="22"/>',
  card: '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
  inv: '<path d="M21 12a9 9 0 1 1-9-9"/><path d="M21 3v6h-6"/>',
  total:
    '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  goal: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
  transfer:
    '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  balance:
    '<path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  leisure:
    '<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/>',
  pending: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  equals: '<line x1="5" x2="19" y1="9" y2="9"/><line x1="5" x2="19" y1="15" y2="15"/>',
  clipboard:
    '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  pencil:
    '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  maximize:
    '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  grid:
    '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  advance:
    '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/><path d="M5 3h14"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  wallet:
    '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z"/>',
  network:
    '<circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><circle cx="18" cy="6" r="3"/><path d="M9 6h6M9 18h3M15 9v6"/>',
  spark:
    '<path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/><circle cx="12" cy="12" r="4"/><path d="m16.5 7.5 1.5-1.5"/><path d="m6 18 1.5-1.5"/><path d="m16.5 16.5 1.5 1.5"/><path d="M6 6l1.5 1.5"/>',
  calendar:
    '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="15" x2="16" y2="15"/>',
  calendarPlus:
    '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="13" x2="12" y2="19"/><line x1="9" y1="16" x2="15" y2="16"/>',
  cardChip:
    '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/>',
  target:
    '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
} as const;

export const ICON_INCOME = strokeIcon(ICON_PATHS.income);
export const ICON_EXPENSE = strokeIcon(ICON_PATHS.expense);
export const ICON_TREND = strokeIcon(ICON_PATHS.trend);
export const ICON_BANK = strokeIcon(ICON_PATHS.bank);
export const ICON_CARD = strokeIcon(ICON_PATHS.card);
export const ICON_INV = strokeIcon(ICON_PATHS.inv);
export const ICON_TOTAL = strokeIcon(ICON_PATHS.total);
export const ICON_GOAL = strokeIcon(ICON_PATHS.goal);
export const ICON_TRANSFER = strokeIcon(ICON_PATHS.transfer);
export const ICON_BALANCE = strokeIcon(ICON_PATHS.balance);
export const ICON_LEISURE = strokeIcon(ICON_PATHS.leisure);
export const ICON_PENDING = strokeIcon(ICON_PATHS.pending);
export const ICON_CHECK = strokeIcon(ICON_PATHS.check);
export const ICON_EQUALS = strokeIcon(ICON_PATHS.equals);
export const ICON_CLIPBOARD = strokeIcon(ICON_PATHS.clipboard);
export const ICON_CLOSE = strokeIcon(ICON_PATHS.close);
export const ICON_PENCIL = strokeIcon(ICON_PATHS.pencil);
export const ICON_MAXIMIZE = strokeIcon(ICON_PATHS.maximize);
export const ICON_GRID = strokeIcon(ICON_PATHS.grid);
export const ICON_ADVANCE = strokeIcon(ICON_PATHS.advance);
export const ICON_SPARK = strokeIcon(ICON_PATHS.spark);
export const ICON_ARROW_UP = strokeIcon(ICON_PATHS.income);
export const ICON_ARROW_DOWN = strokeIcon(
  '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>'
);

/** Ícone 20×20 para o menu lateral. */
export function navIcon(paths: string): string {
  return strokeIcon(paths, 20);
}

/** Ícone do tipo de conta (home mini-cards, etc.). */
export function accountTypeIcon(type: string): string {
  if (type === 'investment') return ICON_TREND;
  if (type === 'credit') return ICON_CARD;
  return ICON_BANK;
}

/** Ícone do cartão no grafo (e reutilizável por tipo de fluxo). */
export function nodeCardIcon(id: string, type: string): string {
  if (id.startsWith('__saldo')) return ICON_BALANCE;
  if (id.startsWith('bank:') || type === 'bank') return ICON_BANK;
  if (id.startsWith('credit:') || type === 'credit') return ICON_CARD;
  if (id.startsWith('inv:')) return ICON_INV;
  if (id.startsWith('tot:') || type === 'totalizer') return ICON_TOTAL;
  switch (type) {
    case 'income':
      return ICON_INCOME;
    case 'expense':
    case 'leisure':
    case 'installment':
      return ICON_EXPENSE;
    case 'investment':
      return ICON_TREND;
    case 'goal':
      return ICON_GOAL;
    case 'transfer':
      return ICON_TRANSFER;
    default:
      return ICON_EXPENSE;
  }
}
