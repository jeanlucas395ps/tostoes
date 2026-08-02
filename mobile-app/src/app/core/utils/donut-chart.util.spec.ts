import { buildDonutSlices, CATEGORY_PIE_COLORS } from './donut-chart.util';

describe('donut-chart.util', () => {
  it('colors and empty', () => {
    expect(CATEGORY_PIE_COLORS.length).toBe(10);
    expect(buildDonutSlices([])).toBeNull();
  });

  it('builds slices', () => {
    const result = buildDonutSlices([
      { label: 'A', value: 70, color: '#000' },
      { label: 'B', value: 30, color: '#fff' },
    ]);
    expect(result).not.toBeNull();
    expect(result!.total).toBe(100);
    expect(result!.slices[0].path).toContain('M');
  });
});
