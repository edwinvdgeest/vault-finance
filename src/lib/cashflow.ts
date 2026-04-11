import type { Transaction, Account, ScenarioEvent } from '../types';
import { getAccountBalance, getRobustMonthlyNetSavings } from './analytics';
import { eventDeltaForMonth } from './projections';

export interface CashflowMonth {
  /** 'YYYY-MM' */
  month: string;
  /** YYYY label for the x-axis */
  label: string;
  /** Historical average monthly net (income − expenses) used as flat baseline */
  baselineNet: number;
  /** Sum of scenario-event amounts landing in this month (0 when none active) */
  eventDelta: number;
  /** Cumulative projected cash balance *without* scenario events */
  baselineBalance: number;
  /** Cumulative projected cash balance *with* scenario events applied */
  projectedBalance: number;
  /** Month offset from now (0 = current month) */
  monthOffset: number;
}

export interface CashflowForecast {
  months: CashflowMonth[];
  startBalance: number;
  baselineNet: number;
  /** Minimum projectedBalance seen over the window (with events applied) */
  minBalance: number;
  /** Total event impact (sum of all event deltas within the window) */
  totalEventImpact: number;
}

/**
 * Deterministic short-term cashflow forecast. Starts from the current cash balance
 * across all accounts, extrapolates a flat baseline net savings from the last 6 months,
 * and overlays scenario events on top. Returns a parallel baseline+projected series
 * so the UI can render both lines in one chart.
 */
export function forecastCashflow(
  transactions: Transaction[],
  accounts: Account[],
  events: ScenarioEvent[],
  months = 24,
  /** When provided, overrides the auto-computed baseline from history. */
  baselineOverride?: number | null,
): CashflowForecast {
  const now = new Date();
  const startBalance = accounts.reduce((sum, acc) => sum + getAccountBalance(acc, transactions), 0);
  const baselineNet = baselineOverride ?? getRobustMonthlyNetSavings(transactions, 12);

  const result: CashflowMonth[] = [];
  let baselineBalance = startBalance;
  let projectedBalance = startBalance;
  let minBalance = startBalance;
  let totalEventImpact = 0;

  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const month = `${yyyy}-${mm}`;
    const eventDelta = eventDeltaForMonth(events, i, now);

    baselineBalance += baselineNet;
    projectedBalance += baselineNet + eventDelta;
    totalEventImpact += eventDelta;
    if (projectedBalance < minBalance) minBalance = projectedBalance;

    result.push({
      month,
      label: d.toLocaleString('nl-NL', { month: 'short', year: '2-digit' }),
      baselineNet,
      eventDelta,
      baselineBalance: Math.round(baselineBalance),
      projectedBalance: Math.round(projectedBalance),
      monthOffset: i,
    });
  }

  return {
    months: result,
    startBalance: Math.round(startBalance),
    baselineNet: Math.round(baselineNet),
    minBalance: Math.round(minBalance),
    totalEventImpact: Math.round(totalEventImpact),
  };
}
