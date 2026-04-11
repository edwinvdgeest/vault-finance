import { describe, it, expect } from 'vitest';
import { runProjection, runScenarioMedian, monthsFromNow, eventDeltaForMonth } from '../projections';
import type { ProjectionParams } from '../projections';
import type { ScenarioEvent } from '../../types';

const BASE_PARAMS: ProjectionParams = {
  startCapital: 50_000,
  monthlyContribution: 500,
  annualReturn: 0.07,
  annualVolatility: 0.15,
  inflationRate: 0.02,
  years: 10,
  simulations: 500,
  goalAmount: 200_000,
  adjustForInflation: true,
};

describe('runProjection', () => {
  it('returns correct number of yearly data points', () => {
    const result = runProjection(BASE_PARAMS);
    // year 0 (start) + 10 years = 11 points
    expect(result.yearlyData).toHaveLength(11);
  });

  it('year 0 equals start capital for all percentiles', () => {
    const result = runProjection(BASE_PARAMS);
    const y0 = result.yearlyData[0];
    expect(y0.p10).toBe(50_000);
    expect(y0.p50).toBe(50_000);
    expect(y0.p90).toBe(50_000);
  });

  it('percentiles are ordered p10 ≤ p25 ≤ p50 ≤ p75 ≤ p90', () => {
    const result = runProjection(BASE_PARAMS);
    for (const d of result.yearlyData.slice(1)) {
      expect(d.p10).toBeLessThanOrEqual(d.p25);
      expect(d.p25).toBeLessThanOrEqual(d.p50);
      expect(d.p50).toBeLessThanOrEqual(d.p75);
      expect(d.p75).toBeLessThanOrEqual(d.p90);
    }
  });

  it('median grows over time with positive expected return', () => {
    const result = runProjection(BASE_PARAMS);
    const first = result.yearlyData[1].p50;
    const last = result.yearlyData[10].p50;
    expect(last).toBeGreaterThan(first);
  });

  it('probability above goal is between 0 and 100', () => {
    const result = runProjection(BASE_PARAMS);
    expect(result.probabilityAboveGoal).toBeGreaterThanOrEqual(0);
    expect(result.probabilityAboveGoal).toBeLessThanOrEqual(100);
  });

  it('final values are reasonable', () => {
    const result = runProjection({ ...BASE_PARAMS, simulations: 1000 });
    // With €50k start + €500/month over 10 years at 7% nominal:
    // Deterministic end ≈ €184k nominal, ~€150k real
    // Median should be roughly in that range
    expect(result.medianFinal).toBeGreaterThan(80_000);
    expect(result.medianFinal).toBeLessThan(300_000);
    expect(result.p10Final).toBeLessThan(result.medianFinal);
    expect(result.p90Final).toBeGreaterThan(result.medianFinal);
  });

  it('zero contribution still grows start capital', () => {
    const result = runProjection({ ...BASE_PARAMS, monthlyContribution: 0, simulations: 300 });
    expect(result.medianFinal).toBeGreaterThan(BASE_PARAMS.startCapital * 0.5);
  });
});

describe('runProjection with property', () => {
  it('includes property equity in yearly data', () => {
    const result = runProjection({
      ...BASE_PARAMS,
      property: {
        startValue: 400_000,
        startDebt: 300_000,
        annualGrowth: 0.03,
        monthlyPayment: 1400,
        interestRate: 0.02,
        monthsRemaining: 300,
      },
    });

    // Year 0 should have property data
    expect(result.yearlyData[0].propertyValue).toBe(400_000);
    expect(result.yearlyData[0].mortgageBalance).toBe(300_000);
    expect(result.yearlyData[0].propertyEquity).toBe(100_000);

    // Property value should grow, debt should shrink
    const last = result.yearlyData[10];
    expect(last.propertyValue!).toBeGreaterThan(400_000);
    expect(last.mortgageBalance!).toBeLessThan(300_000);
    expect(last.propertyEquity!).toBeGreaterThan(100_000);
  });
});

describe('runProjection with life phases', () => {
  it('respects different contribution phases', () => {
    const result = runProjection({
      ...BASE_PARAMS,
      phases: [
        { id: '1', label: 'Nu', fromYear: 0, monthlyContribution: 1000 },
        { id: '2', label: 'Later', fromYear: 5, monthlyContribution: 200 },
      ],
    });
    // Should still produce valid output
    expect(result.yearlyData).toHaveLength(11);
    expect(result.medianFinal).toBeGreaterThan(0);
  });
});

describe('runScenarioMedian', () => {
  it('returns array of median values per year', () => {
    const medians = runScenarioMedian(BASE_PARAMS);
    expect(medians).toHaveLength(11);
    expect(medians[0]).toBe(BASE_PARAMS.startCapital);
  });
});

describe('monthsFromNow', () => {
  it('returns 0 for the current month', () => {
    const now = new Date(2026, 3, 11); // April 2026
    expect(monthsFromNow('2026-04', now)).toBe(0);
  });
  it('returns positive offset for future months', () => {
    const now = new Date(2026, 3, 11);
    expect(monthsFromNow('2026-07', now)).toBe(3);
    expect(monthsFromNow('2027-04', now)).toBe(12);
  });
  it('returns negative offset for past months', () => {
    const now = new Date(2026, 3, 11);
    expect(monthsFromNow('2026-01', now)).toBe(-3);
    expect(monthsFromNow('2025-04', now)).toBe(-12);
  });
});

describe('eventDeltaForMonth', () => {
  const now = new Date(2026, 3, 1); // April 2026

  it('oneOff event fires only in its month', () => {
    const events: ScenarioEvent[] = [
      { id: '1', label: 'Vacation', kind: 'oneOff', amount: -3000, startMonth: '2026-07' },
    ];
    expect(eventDeltaForMonth(events, 2, now)).toBe(0); // June
    expect(eventDeltaForMonth(events, 3, now)).toBe(-3000); // July
    expect(eventDeltaForMonth(events, 4, now)).toBe(0); // August
  });

  it('recurring event fires across its full window inclusive', () => {
    const events: ScenarioEvent[] = [
      { id: '1', label: 'Sabbatical', kind: 'recurring', amount: -4000, startMonth: '2026-06', endMonth: '2026-08' },
    ];
    expect(eventDeltaForMonth(events, 1, now)).toBe(0); // May
    expect(eventDeltaForMonth(events, 2, now)).toBe(-4000); // June
    expect(eventDeltaForMonth(events, 3, now)).toBe(-4000); // July
    expect(eventDeltaForMonth(events, 4, now)).toBe(-4000); // August
    expect(eventDeltaForMonth(events, 5, now)).toBe(0); // September
  });

  it('multiple events in the same month sum up', () => {
    const events: ScenarioEvent[] = [
      { id: '1', label: 'Vacation', kind: 'oneOff', amount: -3000, startMonth: '2026-07' },
      { id: '2', label: 'Bonus', kind: 'oneOff', amount: 1000, startMonth: '2026-07' },
    ];
    expect(eventDeltaForMonth(events, 3, now)).toBe(-2000);
  });

  it('past events have no effect on future months', () => {
    const events: ScenarioEvent[] = [
      { id: '1', label: 'Old', kind: 'oneOff', amount: -9999, startMonth: '2025-01' },
    ];
    for (let m = 0; m < 24; m++) {
      expect(eventDeltaForMonth(events, m, now)).toBe(0);
    }
  });
});

describe('runProjection with events', () => {
  // Deterministic comparisons use volatility=0 so the simulation is fully predictable
  const DETERMINISTIC: ProjectionParams = {
    startCapital: 100_000,
    monthlyContribution: 0,
    annualReturn: 0,
    annualVolatility: 0,
    inflationRate: 0,
    years: 2,
    simulations: 10,
    goalAmount: 0,
    adjustForInflation: false,
  };

  const ym = (offset: number) => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  it('one-off expense reduces final value by exactly that amount (no return)', () => {
    const baseline = runProjection(DETERMINISTIC);
    const withEvent = runProjection({
      ...DETERMINISTIC,
      events: [{ id: '1', label: 'one-off', kind: 'oneOff', amount: -10_000, startMonth: ym(6) }],
    });
    expect(withEvent.medianFinal).toBe(baseline.medianFinal - 10_000);
  });

  it('recurring event equivalent to reducing contribution over its window', () => {
    // Recurring -1000/mnd for 6 months (offsets 5..10 inclusive) = total -6000
    const withEvent = runProjection({
      ...DETERMINISTIC,
      monthlyContribution: 1000,
      events: [{ id: '1', label: 'window', kind: 'recurring', amount: -1000, startMonth: ym(5), endMonth: ym(10) }],
    });
    // 24 months of +1000 contribution − 6 months of -1000 event = 18k net contribution
    expect(withEvent.medianFinal).toBe(100_000 + 18_000);
  });

  it('events in the past are ignored by the engine', () => {
    const baseline = runProjection(DETERMINISTIC);
    const withPastEvent = runProjection({
      ...DETERMINISTIC,
      events: [{ id: '1', label: 'ancient', kind: 'oneOff', amount: -50_000, startMonth: '2020-01' }],
    });
    expect(withPastEvent.medianFinal).toBe(baseline.medianFinal);
  });
});
