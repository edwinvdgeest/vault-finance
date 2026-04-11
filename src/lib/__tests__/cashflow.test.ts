import { describe, it, expect } from 'vitest';
import { forecastCashflow } from '../cashflow';
import type { Transaction, Account, ScenarioEvent } from '../../types';

/** Build a dummy transaction for testing */
function tx(id: string, date: string, amount: number, account = 'NL00TEST0000000001'): Transaction {
  return {
    id,
    date,
    account,
    accountName: 'Test',
    amount,
    counterparty: 'Test CP',
    name: 'Test',
    description: '',
    category: amount > 0 ? 'Inkomen' : 'Overig',
    originalDescription: '',
  };
}

const ACCOUNT: Account = {
  id: 'a1',
  name: 'Test',
  iban: 'NL00TEST0000000001',
  bank: 'bunq',
  startingBalance: 5000,
  startingDate: '2020-01-01',
};

/**
 * Build 6 months of transactions ending last month. Each month has +3000 income
 * and -2000 expense → net +1000/month → avg monthly net savings = 1000.
 */
function buildSixMonthHistory(): Transaction[] {
  const txs: Transaction[] = [];
  const now = new Date();
  for (let i = 1; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 15);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
    txs.push(tx(`in-${i}`, ym, 3000));
    txs.push(tx(`ex-${i}`, ym, -2000));
  }
  return txs;
}

describe('forecastCashflow', () => {
  it('baseline cashflow grows linearly with avg monthly net savings', () => {
    const txs = buildSixMonthHistory();
    const forecast = forecastCashflow(txs, [ACCOUNT], [], 12);
    // startBalance = 5000 (starting) + 6 * (3000 - 2000) = 11000
    expect(forecast.startBalance).toBe(11_000);
    expect(forecast.baselineNet).toBe(1000);
    // After 12 months with +1000/mnd: 11000 + 12000 = 23000
    expect(forecast.months[11].projectedBalance).toBe(23_000);
    // No events → baseline == projected
    expect(forecast.months[11].baselineBalance).toBe(23_000);
    expect(forecast.totalEventImpact).toBe(0);
  });

  it('one-off expense causes a dip at the event month', () => {
    const txs = buildSixMonthHistory();
    const now = new Date();
    const ym = (offset: number) => {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };
    const events: ScenarioEvent[] = [
      { id: '1', label: 'Warmtepomp', kind: 'oneOff', amount: -25_000, startMonth: ym(5) },
    ];
    const forecast = forecastCashflow(txs, [ACCOUNT], events, 12);

    // Up to month 4 (before event): projected == baseline
    expect(forecast.months[4].projectedBalance).toBe(forecast.months[4].baselineBalance);
    // Month 5 (event month): projected = baseline - 25000
    expect(forecast.months[5].projectedBalance).toBe(forecast.months[5].baselineBalance - 25_000);
    // After that: the gap stays -25000 (baseline keeps growing at same rate)
    expect(forecast.months[11].projectedBalance).toBe(forecast.months[11].baselineBalance - 25_000);

    expect(forecast.totalEventImpact).toBe(-25_000);
    expect(forecast.minBalance).toBeLessThan(forecast.startBalance);
  });

  it('recurring event applies each month in its window', () => {
    const txs = buildSixMonthHistory();
    const now = new Date();
    const ym = (offset: number) => {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };
    // 3 months of -500/mnd
    const events: ScenarioEvent[] = [
      { id: '1', label: 'Reis', kind: 'recurring', amount: -500, startMonth: ym(2), endMonth: ym(4) },
    ];
    const forecast = forecastCashflow(txs, [ACCOUNT], events, 12);
    expect(forecast.totalEventImpact).toBe(-1500);
  });

  it('returns empty-safe forecast when there are no transactions', () => {
    const forecast = forecastCashflow([], [], [], 12);
    expect(forecast.startBalance).toBe(0);
    expect(forecast.baselineNet).toBe(0);
    expect(forecast.months).toHaveLength(12);
    expect(forecast.months.every(m => m.projectedBalance === 0)).toBe(true);
  });

  it('baselineOverride replaces the auto-computed baseline', () => {
    const txs = buildSixMonthHistory();
    // Normally baseline is €1000/mnd. Override to €500/mnd.
    const forecast = forecastCashflow(txs, [ACCOUNT], [], 12, 500);
    expect(forecast.baselineNet).toBe(500);
    // startBalance = 11_000; +12 months × 500 = 17_000
    expect(forecast.months[11].projectedBalance).toBe(17_000);
  });

  it('baselineOverride of 0 still overrides (distinct from null)', () => {
    const txs = buildSixMonthHistory();
    const forecast = forecastCashflow(txs, [ACCOUNT], [], 6, 0);
    expect(forecast.baselineNet).toBe(0);
    // startBalance stays flat at 11_000
    expect(forecast.months[5].projectedBalance).toBe(11_000);
  });
});
