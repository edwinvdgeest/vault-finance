import { describe, it, expect } from 'vitest';
import { runProjection, runScenarioMedian } from '../projections';
import type { ProjectionParams } from '../projections';

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
