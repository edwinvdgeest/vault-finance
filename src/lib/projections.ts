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

export interface ProjectionParams {
  startCapital: number;
  monthlyContribution: number;
  annualReturn: number;       // 0.07 = 7%
  annualVolatility: number;   // 0.15 = 15%
  inflationRate: number;      // 0.02 = 2%
  years: number;
  simulations: number;
  goalAmount: number;
  adjustForInflation: boolean;
}

export interface YearlyDataPoint {
  year: number;
  label: string;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface ProjectionResult {
  yearlyData: YearlyDataPoint[];
  medianFinal: number;
  p10Final: number;
  p90Final: number;
  probabilityAboveGoal: number;
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
  } = params;

  const monthlyMu = annualReturn / 12;
  const monthlySigma = annualVolatility / Math.sqrt(12);
  const monthlyInflation = inflationRate / 12;
  const totalMonths = years * 12;

  // Run all simulations, store end-of-year values
  // simEndValues[yearIndex][simIndex] = value
  const simEndValues: number[][] = Array.from({ length: years }, () => []);
  const finalValues: number[] = [];

  for (let sim = 0; sim < simulations; sim++) {
    let value = startCapital;

    for (let m = 1; m <= totalMonths; m++) {
      // Random monthly return
      const monthReturn = monthlyMu + monthlySigma * randomNormal();
      value = value * (1 + monthReturn) + monthlyContribution;

      // Deflate for inflation if requested
      const deflated = adjustForInflation
        ? value / Math.pow(1 + monthlyInflation, m)
        : value;

      // Record at end of each year
      if (m % 12 === 0) {
        const yearIdx = (m / 12) - 1;
        simEndValues[yearIdx].push(deflated);
      }
    }

    // Final value
    const finalDeflated = adjustForInflation
      ? value / Math.pow(1 + monthlyInflation, totalMonths)
      : value;
    finalValues.push(finalDeflated);
  }

  // Calculate percentiles per year
  const currentYear = new Date().getFullYear();
  const yearlyData: YearlyDataPoint[] = [
    // Year 0 = now
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

  // Final stats
  const sortedFinal = finalValues.slice().sort((a, b) => a - b);
  const aboveGoal = finalValues.filter(v => v >= goalAmount).length;

  return {
    yearlyData,
    medianFinal: Math.round(percentile(sortedFinal, 50)),
    p10Final: Math.round(percentile(sortedFinal, 10)),
    p90Final: Math.round(percentile(sortedFinal, 90)),
    probabilityAboveGoal: Math.round((aboveGoal / simulations) * 1000) / 10,
  };
}
