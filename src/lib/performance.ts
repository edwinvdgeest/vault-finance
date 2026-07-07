// ── Historische performance ──────────────────────────────────────────────────
// Koersreeksen komen van GET /api/prices/history (Yahoo Finance-proxy met
// cache). Rendementen worden berekend in de valuta van de notering; voor
// procentuele vergelijking maakt dat weinig uit.

export type PricePoint = [date: string, close: number]; // ['YYYY-MM-DD', koers]

export interface PriceHistory {
  symbol: string;
  currency: string;
  points: PricePoint[];
}

export type HistoryRange = '1y' | '3y' | '5y' | 'max';

/** Haal koershistorie op via de eigen API (zelfde origin / vite-proxy). */
export async function fetchPriceHistory(q: string, range: HistoryRange): Promise<PriceHistory | null> {
  try {
    const res = await fetch(`/api/prices/history?q=${encodeURIComponent(q)}&range=${range}`);
    if (!res.ok) return null;
    return await res.json() as PriceHistory;
  } catch {
    return null;
  }
}

/** Cumulatief rendement over de hele reeks (0.25 = +25%). */
export function totalReturn(points: PricePoint[]): number | null {
  if (points.length < 2) return null;
  const first = points[0][1];
  const last = points[points.length - 1][1];
  if (first <= 0) return null;
  return last / first - 1;
}

/** Rendement per jaar (geannualiseerd) over de reeks (0.08 = +8%/jaar). */
export function annualizedReturn(points: PricePoint[]): number | null {
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (first[1] <= 0) return null;
  const days = (new Date(last[0] + 'T00:00:00').getTime() - new Date(first[0] + 'T00:00:00').getTime()) / 86400000;
  if (days < 30) return null; // te korte reeks voor een jaarcijfer
  return Math.pow(last[1] / first[1], 365.25 / days) - 1;
}

/** Normaliseer een reeks naar index = 100 op het eerste punt. */
export function normalizeSeries(points: PricePoint[]): PricePoint[] {
  if (points.length === 0) return [];
  const base = points[0][1];
  if (base <= 0) return [];
  return points.map(([d, c]) => [d, Math.round((c / base) * 10000) / 100]);
}

/**
 * Voeg meerdere genormaliseerde reeksen samen tot één Recharts-dataset:
 * [{ date, <naam1>: 101.2, <naam2>: 99.8 }, …]. Datums die niet in elke reeks
 * voorkomen krijgen gaten (render met connectNulls).
 */
export function mergeSeries(named: { name: string; points: PricePoint[] }[]): Record<string, string | number>[] {
  const dates = new Set<string>();
  for (const s of named) for (const [d] of s.points) dates.add(d);

  const maps = named.map(s => ({ name: s.name, map: new Map(s.points) }));
  return [...dates].sort().map(date => {
    const row: Record<string, string | number> = { date };
    for (const { name, map } of maps) {
      const v = map.get(date);
      if (v !== undefined) row[name] = v;
    }
    return row;
  });
}
