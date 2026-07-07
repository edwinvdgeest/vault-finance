import { describe, it, expect } from 'vitest';
import { totalReturn, annualizedReturn, normalizeSeries, mergeSeries } from '../performance';
import type { PricePoint } from '../performance';

describe('totalReturn', () => {
  it('computes cumulative return', () => {
    const pts: PricePoint[] = [['2023-01-01', 100], ['2024-01-01', 125]];
    expect(totalReturn(pts)).toBeCloseTo(0.25);
  });

  it('returns null for too-short series', () => {
    expect(totalReturn([['2023-01-01', 100]])).toBeNull();
    expect(totalReturn([])).toBeNull();
  });
});

describe('annualizedReturn', () => {
  it('equals total return over exactly one year', () => {
    const pts: PricePoint[] = [['2023-01-01', 100], ['2024-01-01', 110]];
    expect(annualizedReturn(pts)!).toBeCloseTo(0.10, 2);
  });

  it('annualizes a multi-year series', () => {
    // +21% over 2 jaar ≈ +10%/jaar
    const pts: PricePoint[] = [['2022-01-01', 100], ['2024-01-01', 121]];
    expect(annualizedReturn(pts)!).toBeCloseTo(0.10, 2);
  });

  it('returns null for series shorter than a month', () => {
    const pts: PricePoint[] = [['2024-01-01', 100], ['2024-01-15', 130]];
    expect(annualizedReturn(pts)).toBeNull();
  });
});

describe('normalizeSeries', () => {
  it('indexes the first point at 100', () => {
    const pts: PricePoint[] = [['2023-01-01', 80], ['2023-06-01', 100], ['2024-01-01', 60]];
    expect(normalizeSeries(pts)).toEqual([
      ['2023-01-01', 100],
      ['2023-06-01', 125],
      ['2024-01-01', 75],
    ]);
  });
});

describe('mergeSeries', () => {
  it('merges series on date with gaps for missing points', () => {
    const merged = mergeSeries([
      { name: 'A', points: [['2024-01-01', 100], ['2024-01-08', 102]] },
      { name: 'B', points: [['2024-01-01', 100], ['2024-01-05', 98]] },
    ]);
    expect(merged).toEqual([
      { date: '2024-01-01', A: 100, B: 100 },
      { date: '2024-01-05', B: 98 },
      { date: '2024-01-08', A: 102 },
    ]);
  });
});
