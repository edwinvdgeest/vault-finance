import { describe, it, expect } from 'vitest';
import { getMonthlyPayment, getPropertyValueAt, getMortgageBalanceAt, getPropertyEquityAt, getTotalPropertyEquity } from '../property';
import type { Property } from '../../types';

describe('getMonthlyPayment', () => {
  it('calculates annuity payment correctly', () => {
    // €350,000 at 1.8% over 288 months ≈ €1,498
    const payment = getMonthlyPayment(350_000, 0.018, 288);
    expect(payment).toBeCloseTo(1497.52, 0);
  });

  it('returns 0 for zero balance', () => {
    expect(getMonthlyPayment(0, 0.03, 360)).toBe(0);
  });

  it('returns 0 for zero months remaining', () => {
    expect(getMonthlyPayment(200_000, 0.03, 0)).toBe(0);
  });

  it('handles 0% interest rate', () => {
    // €120,000 / 120 months = €1,000/month
    expect(getMonthlyPayment(120_000, 0, 120)).toBeCloseTo(1000, 0);
  });

  it('known mortgage: €200k at 4% over 30 years', () => {
    const payment = getMonthlyPayment(200_000, 0.04, 360);
    // Standard amortization table value: €954.83
    expect(payment).toBeCloseTo(954.83, 0);
  });
});

describe('getPropertyValueAt', () => {
  const prop: Property = {
    id: 'test', label: 'Huis', currentValue: 500_000,
    valuationDate: '2025-01-01', annualGrowth: 0.03,
  };

  it('returns current value at valuation date', () => {
    const value = getPropertyValueAt(prop, new Date('2025-01-01'));
    expect(value).toBeCloseTo(500_000, 0);
  });

  it('grows 3% over one year', () => {
    const value = getPropertyValueAt(prop, new Date('2026-01-01'));
    // Monthly compounding: 500k * (1 + 0.03/12)^12 ≈ 515,209
    expect(value).toBeCloseTo(500_000 * Math.pow(1 + 0.03 / 12, 12), 0);
  });

  it('goes backwards in time correctly', () => {
    const value = getPropertyValueAt(prop, new Date('2024-01-01'));
    // Should be less than current value
    expect(value).toBeLessThan(500_000);
    expect(value).toBeCloseTo(500_000 / Math.pow(1 + 0.03 / 12, 12), -1);
  });
});

describe('getMortgageBalanceAt', () => {
  const prop: Property = {
    id: 'test', label: 'Huis', currentValue: 450_000,
    valuationDate: '2025-01-01', annualGrowth: 0.03,
    mortgage: { balance: 350_000, interestRate: 0.018, monthsRemaining: 288, type: 'annuity' },
  };

  it('returns full balance at valuation date', () => {
    expect(getMortgageBalanceAt(prop, new Date('2025-01-01'))).toBeCloseTo(350_000, -1);
  });

  it('balance decreases over time', () => {
    const balance12m = getMortgageBalanceAt(prop, new Date('2026-01-01'));
    expect(balance12m).toBeLessThan(350_000);
    expect(balance12m).toBeGreaterThan(300_000);
  });

  it('balance increases going backwards', () => {
    const balancePast = getMortgageBalanceAt(prop, new Date('2024-01-01'));
    expect(balancePast).toBeGreaterThan(350_000);
  });

  it('returns 0 for property without mortgage', () => {
    const noMortgage: Property = { id: 'x', label: 'x', currentValue: 100_000, valuationDate: '2025-01-01', annualGrowth: 0.02 };
    expect(getMortgageBalanceAt(noMortgage, new Date('2025-06-01'))).toBe(0);
  });

  it('balance reaches 0 after full term', () => {
    const balance = getMortgageBalanceAt(prop, new Date('2049-01-01')); // 24 years = 288 months
    expect(balance).toBeCloseTo(0, -1);
  });

  it('interest-only mortgage keeps constant balance', () => {
    const io: Property = {
      id: 'io', label: 'IO', currentValue: 300_000, valuationDate: '2025-01-01', annualGrowth: 0.02,
      mortgage: { balance: 200_000, interestRate: 0.04, monthsRemaining: 360, type: 'interest-only' },
    };
    expect(getMortgageBalanceAt(io, new Date('2030-01-01'))).toBe(200_000);
  });
});

describe('getPropertyEquityAt', () => {
  it('calculates equity as value minus debt', () => {
    const prop: Property = {
      id: 'test', label: 'Huis', currentValue: 500_000,
      valuationDate: '2025-01-01', annualGrowth: 0.03,
      mortgage: { balance: 300_000, interestRate: 0.03, monthsRemaining: 300, type: 'annuity' },
    };
    const equity = getPropertyEquityAt(prop, new Date('2025-01-01'));
    expect(equity).toBeCloseTo(200_000, -1);
  });
});

describe('getTotalPropertyEquity', () => {
  it('sums multiple properties', () => {
    const props: Property[] = [
      { id: 'a', label: 'A', currentValue: 400_000, valuationDate: '2025-01-01', annualGrowth: 0.03,
        mortgage: { balance: 200_000, interestRate: 0.02, monthsRemaining: 240, type: 'annuity' } },
      { id: 'b', label: 'B', currentValue: 250_000, valuationDate: '2025-01-01', annualGrowth: 0.02 },
    ];
    const result = getTotalPropertyEquity(props, new Date('2025-01-01'));
    expect(result.value).toBeCloseTo(650_000, -1);
    expect(result.debt).toBeCloseTo(200_000, -1);
    expect(result.equity).toBeCloseTo(450_000, -1);
  });

  it('returns zeros for empty array', () => {
    const result = getTotalPropertyEquity([], new Date('2025-01-01'));
    expect(result).toEqual({ value: 0, debt: 0, equity: 0 });
  });
});
