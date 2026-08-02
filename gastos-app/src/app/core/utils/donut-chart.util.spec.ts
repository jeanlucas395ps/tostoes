import { buildDonutSlices, CATEGORY_PIE_COLORS } from './donut-chart.util';

describe('donut-chart.util', () => {
  it('exposes pie colors', () => {
    expect(CATEGORY_PIE_COLORS.length).toBe(10);
  });

  it('returns null for empty or zero values', () => {
    expect(buildDonutSlices([])).toBeNull();
    expect(buildDonutSlices([{ label: 'A', value: 0, color: '#000' }])).toBeNull();
    expect(buildDonutSlices([{ label: 'A', value: 0.0001, color: '#000' }])).toBeNull();
  });

  it('builds slices with paths and percentages', () => {
    const result = buildDonutSlices([
      { label: 'Gastos', value: 70, color: '#EF4444', icon: '🛒' },
      { label: 'Receitas', value: 30, color: '#22C55E' },
    ]);
    expect(result).not.toBeNull();
    expect(result!.total).toBe(100);
    expect(result!.slices.length).toBe(2);
    expect(result!.slices[0].pct).toBe(70);
    expect(result!.slices[0].path).toContain('M');
    expect(result!.slices[0].icon).toBe('🛒');
  });

  it('skips tiny sweeps when minSweep is high', () => {
    const result = buildDonutSlices(
      [
        { label: 'Big', value: 99.9, color: '#000' },
        { label: 'Tiny', value: 0.1, color: '#fff' },
      ],
      { gap: 2, minSweep: 50 }
    );
    expect(result).not.toBeNull();
    expect(result!.slices.every((s) => s.label === 'Big')).toBe(true);
  });

  it('returns null when all slices filtered by minSweep', () => {
    const result = buildDonutSlices(
      [{ label: 'A', value: 1, color: '#000' }],
      { gap: 359, minSweep: 10 }
    );
    expect(result).toBeNull();
  });
});
