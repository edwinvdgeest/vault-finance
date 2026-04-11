import type { ScenarioEvent } from '../types';

/** Box-Muller transform: generate normally distributed random number */
function randomNormal(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Months elapsed from sim-start (= first day of current month) to a 'YYYY-MM' string.
 * Negative if the target month lies in the past. Used by both the Monte Carlo engine
 * and the short-term cashflow forecast so events line up consistently in both views.
 */
export function monthsFromNow(ym: string, now: Date = new Date()): number {
  const [y, m] = ym.split('-').map(Number);
  return (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
}

/**
 * Sum the event amounts that apply in a specific month offset from now.
 * - `oneOff` events fire in the single month matching their `startMonth`.
 * - `recurring` events fire every month from `startMonth` through `endMonth` (inclusive).
 *   If `endMonth` is missing, the recurring event behaves as a single-month event.
 */
export function eventDeltaForMonth(events: ScenarioEvent[], monthOffset: number, now: Date = new Date()): number {
  let delta = 0;
  for (const ev of events) {
    const start = monthsFromNow(ev.startMonth, now);
    if (ev.kind === 'oneOff') {
      if (monthOffset === start) delta += ev.amount;
    } else {
      const end = ev.endMonth ? monthsFromNow(ev.endMonth, now) : start;
      if (monthOffset >= start && monthOffset <= end) delta += ev.amount;
    }
  }
  return delta;
}

/** Calculate percentile from sorted array */
function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** A life phase with its own monthly contribution */
export interface LifePhase {
  id: string;
  label: string;
  fromYear: number; // offset from now (0 = now)
  monthlyContribution: number;
}

export interface PropertyProjection {
  startValue: number;
  startDebt: number;
  annualGrowth: number;
  monthlyPayment: number;
  interestRate: number;
  monthsRemaining: number;
}

export interface ProjectionParams {
  startCapital: number;
  monthlyContribution: number;
  annualReturn: number;
  annualVolatility: number;
  inflationRate: number;
  years: number;
  simulations: number;
  goalAmount: number;
  adjustForInflation: boolean;
  phases?: LifePhase[]; // optional life phases override
  property?: PropertyProjection; // optional woning component (deterministic)
  events?: ScenarioEvent[]; // optional scenario events, applied additively to monthly contribution
}

export interface YearlyDataPoint {
  year: number;
  label: string;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  propertyValue?: number;
  mortgageBalance?: number;
  propertyEquity?: number;
  // For scenario comparison
  [key: string]: number | string | undefined;
}

export interface ProjectionResult {
  yearlyData: YearlyDataPoint[];
  medianFinal: number;
  p10Final: number;
  p90Final: number;
  probabilityAboveGoal: number;
  fireYear: number | null; // year index when median hits FIRE number, or null
}

/** Get monthly contribution for a given year offset based on life phases */
function getPhaseContribution(yearOffset: number, phases: LifePhase[], defaultContrib: number): number {
  // Find the phase that applies (last phase whose fromYear <= yearOffset)
  const sorted = phases.slice().sort((a, b) => a.fromYear - b.fromYear);
  let contrib = defaultContrib;
  for (const phase of sorted) {
    if (yearOffset >= phase.fromYear) contrib = phase.monthlyContribution;
  }
  return contrib;
}

export function runProjection(params: ProjectionParams): ProjectionResult {
  const {
    startCapital,
    monthlyContribution,
    annualReturn,
    annualVolatility,
    inflationRate,
    years,
    simulations,
    goalAmount,
    adjustForInflation,
    phases,
    property,
    events,
  } = params;

  const monthlyMu = annualReturn / 12;
  const monthlySigma = annualVolatility / Math.sqrt(12);
  const monthlyInflation = inflationRate / 12;
  const totalMonths = years * 12;
  const hasPhases = phases && phases.length > 0;
  const hasEvents = events && events.length > 0;
  const simNow = new Date();

  // Pre-compute deterministic property schedule (same across simulations)
  const propertySchedule: { value: number; debt: number; equity: number }[] = [];
  if (property) {
    const monthlyGrowth = property.annualGrowth / 12;
    const r = property.interestRate / 12;
    let value = property.startValue;
    let debt = property.startDebt;
    const paymentMonths = property.monthsRemaining;
    let monthsPaid = 0;
    for (let m = 1; m <= totalMonths; m++) {
      value = value * (1 + monthlyGrowth);
      if (debt > 0 && monthsPaid < paymentMonths) {
        const interest = debt * r;
        const principal = Math.max(0, property.monthlyPayment - interest);
        debt = Math.max(0, debt - principal);
        monthsPaid++;
      }
      if (m % 12 === 0) {
        const deflated = adjustForInflation ? 1 / Math.pow(1 + monthlyInflation, m) : 1;
        propertySchedule.push({
          value: value * deflated,
          debt: debt * deflated,
          equity: (value - debt) * deflated,
        });
      }
    }
  }

  const simEndValues: number[][] = Array.from({ length: years }, () => []);
  const finalValues: number[] = [];

  for (let sim = 0; sim < simulations; sim++) {
    let value = startCapital;

    for (let m = 1; m <= totalMonths; m++) {
      const yearOffset = Math.floor((m - 1) / 12);
      const baseContrib = hasPhases
        ? getPhaseContribution(yearOffset, phases!, monthlyContribution)
        : monthlyContribution;
      const eventDelta = hasEvents ? eventDeltaForMonth(events!, m - 1, simNow) : 0;
      const contrib = baseContrib + eventDelta;

      const monthReturn = monthlyMu + monthlySigma * randomNormal();
      value = value * (1 + monthReturn) + contrib;
      if (value < 0) value = 0; // can't go below zero

      const deflated = adjustForInflation
        ? value / Math.pow(1 + monthlyInflation, m)
        : value;

      if (m % 12 === 0) {
        simEndValues[(m / 12) - 1].push(deflated);
      }
    }

    const finalDeflated = adjustForInflation
      ? value / Math.pow(1 + monthlyInflation, totalMonths)
      : value;
    finalValues.push(finalDeflated);
  }

  const currentYear = new Date().getFullYear();
  const startEquity = property ? property.startValue - property.startDebt : 0;
  const yearlyData: YearlyDataPoint[] = [
    {
      year: 0, label: String(currentYear),
      p10: startCapital, p25: startCapital, p50: startCapital, p75: startCapital, p90: startCapital,
      ...(property ? {
        propertyValue: Math.round(property.startValue),
        mortgageBalance: Math.round(property.startDebt),
        propertyEquity: Math.round(startEquity),
      } : {}),
    },
  ];

  for (let y = 0; y < years; y++) {
    const sorted = simEndValues[y].slice().sort((a, b) => a - b);
    const prop = propertySchedule[y];
    yearlyData.push({
      year: y + 1,
      label: String(currentYear + y + 1),
      p10: Math.round(percentile(sorted, 10)),
      p25: Math.round(percentile(sorted, 25)),
      p50: Math.round(percentile(sorted, 50)),
      p75: Math.round(percentile(sorted, 75)),
      p90: Math.round(percentile(sorted, 90)),
      ...(prop ? {
        propertyValue: Math.round(prop.value),
        mortgageBalance: Math.round(prop.debt),
        propertyEquity: Math.round(prop.equity),
      } : {}),
    });
  }

  const sortedFinal = finalValues.slice().sort((a, b) => a - b);
  const aboveGoal = finalValues.filter(v => v >= goalAmount).length;

  // FIRE calculation: find first year where median >= goalAmount (FIRE number)
  let fireYear: number | null = null;
  for (let i = 1; i < yearlyData.length; i++) {
    if (yearlyData[i].p50 >= goalAmount) {
      fireYear = i;
      break;
    }
  }

  return {
    yearlyData,
    medianFinal: Math.round(percentile(sortedFinal, 50)),
    p10Final: Math.round(percentile(sortedFinal, 10)),
    p90Final: Math.round(percentile(sortedFinal, 90)),
    probabilityAboveGoal: Math.round((aboveGoal / simulations) * 1000) / 10,
    fireYear,
  };
}

/** Run a lightweight projection returning only median line (for scenario comparison) */
export function runScenarioMedian(params: ProjectionParams): number[] {
  const result = runProjection({ ...params, simulations: 200 });
  return result.yearlyData.map(d => d.p50);
}
