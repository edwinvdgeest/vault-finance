/** Box-Muller transform: generate normally distributed random number */
function randomNormal(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
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
}

export interface YearlyDataPoint {
  year: number;
  label: string;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  // For scenario comparison
  [key: string]: number | string;
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
  } = params;

  const monthlyMu = annualReturn / 12;
  const monthlySigma = annualVolatility / Math.sqrt(12);
  const monthlyInflation = inflationRate / 12;
  const totalMonths = years * 12;
  const hasPhases = phases && phases.length > 0;

  const simEndValues: number[][] = Array.from({ length: years }, () => []);
  const finalValues: number[] = [];

  for (let sim = 0; sim < simulations; sim++) {
    let value = startCapital;

    for (let m = 1; m <= totalMonths; m++) {
      const yearOffset = Math.floor((m - 1) / 12);
      const contrib = hasPhases
        ? getPhaseContribution(yearOffset, phases!, monthlyContribution)
        : monthlyContribution;

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
  const yearlyData: YearlyDataPoint[] = [
    { year: 0, label: String(currentYear), p10: startCapital, p25: startCapital, p50: startCapital, p75: startCapital, p90: startCapital },
  ];

  for (let y = 0; y < years; y++) {
    const sorted = simEndValues[y].slice().sort((a, b) => a - b);
    yearlyData.push({
      year: y + 1,
      label: String(currentYear + y + 1),
      p10: Math.round(percentile(sorted, 10)),
      p25: Math.round(percentile(sorted, 25)),
      p50: Math.round(percentile(sorted, 50)),
      p75: Math.round(percentile(sorted, 75)),
      p90: Math.round(percentile(sorted, 90)),
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
