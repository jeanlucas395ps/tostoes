export interface DonutSlice {
  label: string;
  value: number;
  color: string;
  path: string;
  pct: number;
  icon?: string;
}

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutArcPath(
  cx: number,
  cy: number,
  R: number,
  ri: number,
  a1: number,
  a2: number
): string {
  const s = polarToCartesian(cx, cy, R, a1);
  const e = polarToCartesian(cx, cy, R, a2);
  const si = polarToCartesian(cx, cy, ri, a2);
  const ei = polarToCartesian(cx, cy, ri, a1);
  const large = a2 - a1 > 180 ? 1 : 0;
  return `M${s.x.toFixed(2)},${s.y.toFixed(2)}A${R},${R} 0 ${large} 1 ${e.x.toFixed(2)},${e.y.toFixed(2)}L${si.x.toFixed(2)},${si.y.toFixed(2)}A${ri},${ri} 0 ${large} 0 ${ei.x.toFixed(2)},${ei.y.toFixed(2)}Z`;
}

/** Build SVG donut slice paths from labeled values (percentages relative to total). */
export function buildDonutSlices(
  items: { label: string; value: number; color: string; icon?: string }[],
  options?: { gap?: number; minSweep?: number }
): { slices: DonutSlice[]; total: number } | null {
  const raw = items.filter((i) => i.value > 0.001);
  if (!raw.length) return null;

  const total = raw.reduce((s, i) => s + i.value, 0);

  const gap = options?.gap ?? 2;
  const minSweep = options?.minSweep ?? 2;
  let angle = -90;

  const slices: DonutSlice[] = [];
  for (const item of raw) {
    const sweep = Math.max(0, (item.value / total) * 360 - gap);
    const path =
      sweep > minSweep ? donutArcPath(100, 100, 80, 50, angle, angle + sweep) : '';
    const pct = Math.round((item.value / total) * 100);
    angle += sweep + gap;
    if (path) {
      slices.push({ ...item, path, pct });
    }
  }

  return slices.length ? { slices, total } : null;
}

export const CATEGORY_PIE_COLORS = [
  '#EF4444',
  '#F97316',
  '#EAB308',
  '#84CC16',
  '#14B8A6',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#64748B',
  '#22C55E',
];
