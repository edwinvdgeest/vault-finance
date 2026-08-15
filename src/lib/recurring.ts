import type { Transaction } from '../types';
import { isTransfer } from './analytics';
import { normalizeMerchant } from './merchant';

export interface RecurringItem {
  key: string;
  displayName: string;
  category: string;
  count: number;
  avgAmount: number;
  cv: number;
  interval: number;
  monthly: number;
  lastDate: string;
  active: boolean;
  nextExpectedDate: string;
  priceChange: {
    direction: 'up' | 'down' | 'none';
    pctChange: number;
    latestAmount: number;
    priorMedian: number;
  } | null;
}

export interface RecurringOptions {
  minOccurrences?: number;
  priceChangeThresholdPct?: number;
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

export function intervalLabel(days: number): string {
  if (days <= 10) return 'wekelijks';
  if (days <= 45) return 'maandelijks';
  if (days <= 130) return 'per kwartaal';
  if (days <= 250) return 'halfjaarlijks';
  return 'jaarlijks';
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}

/**
 * Geünificeerde vaste-lasten-detectie: groepeert op genormaliseerde merchant
 * (i.p.v. de ruwe naam, zie merchant.ts) en classificeert een groep alleen als
 * "vaste last" bij een consistent bedrag (cv &lt; 0.3) én een plausibel interval
 * (6-400 dagen) — frequenter dan ~6 dagen is los koopgedrag (boodschappen), geen
 * vaste last. Dit is de enige plek waar deze logica leeft; zowel de MCP-tool
 * `vault_recurring` als de app gebruiken deze functie, zodat ze nooit meer uit
 * elkaar kunnen lopen.
 */
export function getRecurringItems(transactions: Transaction[], opts: RecurringOptions = {}): RecurringItem[] {
  const minOcc = opts.minOccurrences ?? 3;
  const threshold = opts.priceChangeThresholdPct ?? 12;

  const filtered = transactions.filter(t => t.amount < 0 && !isTransfer(t));

  interface Occ { date: string; amount: number; category: string }
  const groups = new Map<string, { displayName: string; occs: Occ[] }>();

  for (const t of filtered) {
    const { key, displayName } = normalizeMerchant(t.name, t.counterparty);
    if (!key || key === '(onbekend)') continue;
    let group = groups.get(key);
    if (!group) {
      group = { displayName, occs: [] };
      groups.set(key, group);
    }
    group.occs.push({ date: t.date, amount: Math.abs(t.amount), category: t.category });
  }

  const refDate = filtered.reduce((max, t) => (t.date > max ? t.date : max), '');
  const refTime = refDate ? new Date(refDate + 'T00:00:00').getTime() : Date.now();

  const results: RecurringItem[] = [];

  for (const [key, { displayName, occs }] of groups) {
    if (occs.length < minOcc) continue;
    const sorted = [...occs].sort((a, b) => a.date.localeCompare(b.date));
    const amounts = sorted.map(o => o.amount);
    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const variance = amounts.reduce((s, a) => s + (a - avg) ** 2, 0) / amounts.length;
    const cv = avg > 0 ? Math.sqrt(variance) / avg : 0;

    const times = sorted.map(o => new Date(o.date + 'T00:00:00').getTime());
    const gaps: number[] = [];
    for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]) / 86400000);
    const interval = median(gaps);

    // consistent bedrag én een plausibel herhaalpatroon (wekelijks t/m jaarlijks);
    // frequenter dan ~6 dagen is los koopgedrag (boodschappen), geen vaste last
    if (!(cv < 0.3 && interval >= 6 && interval <= 400)) continue;

    const lastDate = sorted[sorted.length - 1].date;
    const daysSinceLast = (refTime - times[times.length - 1]) / 86400000;
    const active = daysSinceLast <= Math.max(2 * interval, 45);
    const monthly = interval > 0 ? avg * (30.44 / interval) : avg;
    const nextExpectedDate = addDays(lastDate, interval);
    const category = sorted[sorted.length - 1].category;

    let priceChange: RecurringItem['priceChange'] = null;
    if (amounts.length >= 2) {
      const latest = amounts[amounts.length - 1];
      const priorMedian = median(amounts.slice(0, -1));
      const pctChange = priorMedian > 0 ? ((latest - priorMedian) / priorMedian) * 100 : 0;
      const direction: 'up' | 'down' | 'none' =
        Math.abs(pctChange) >= threshold ? (pctChange > 0 ? 'up' : 'down') : 'none';
      priceChange = {
        direction,
        pctChange: Math.round(pctChange * 10) / 10,
        latestAmount: latest,
        priorMedian: Math.round(priorMedian * 100) / 100,
      };
    }

    results.push({
      key,
      displayName,
      category,
      count: amounts.length,
      avgAmount: Math.round(avg * 100) / 100,
      cv,
      interval,
      monthly: Math.round(monthly * 100) / 100,
      lastDate,
      active,
      nextExpectedDate,
      priceChange,
    });
  }

  return results.sort((a, b) => b.monthly - a.monthly);
}

/**
 * Vaste-vs-variabele-lasten-splitsing. "Vast" is per definitie de som van de
 * actieve items uit `getRecurringItems` (dezelfde cv/interval-classificatie),
 * zodat dit getal en de itemlijst nooit uit elkaar kunnen lopen. "Variabel" is
 * het verschil tussen de mediane totale maandelijkse uitgaven (laatste 12 volle
 * maanden, zelfde mediaan-over-maandbuckets-aanpak als getRobustMonthlyNetSavings
 * in analytics.ts) en de vaste lasten.
 */
export function getFixedVsVariableSplit(transactions: Transaction[], opts: RecurringOptions = {}): {
  fixedMonthly: number;
  variableMonthly: number;
  fixedPct: number;
  variablePct: number;
  items: RecurringItem[];
} {
  const items = getRecurringItems(transactions, opts);
  const fixedMonthly = Math.round(items.filter(r => r.active).reduce((s, r) => s + r.monthly, 0) * 100) / 100;

  const months = 12;
  const now = new Date();
  const startD = new Date(now.getFullYear(), now.getMonth() - months, 1);
  const startYM = `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, '0')}`;
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const buckets = new Map<string, number>();
  for (const t of transactions) {
    if (t.amount >= 0 || isTransfer(t)) continue;
    const ym = t.date.slice(0, 7);
    if (ym < startYM || ym >= currentYM) continue;
    buckets.set(ym, (buckets.get(ym) ?? 0) + Math.abs(t.amount));
  }
  const values = Array.from(buckets.values());
  const totalMonthlyExpense = values.length === 0 ? 0 : median(values);

  const variableMonthly = Math.max(0, Math.round((totalMonthlyExpense - fixedMonthly) * 100) / 100);
  const denom = fixedMonthly + variableMonthly;
  const fixedPct = denom > 0 ? Math.round((fixedMonthly / denom) * 1000) / 10 : 0;
  const variablePct = denom > 0 ? Math.round((variableMonthly / denom) * 1000) / 10 : 0;

  return { fixedMonthly, variableMonthly, fixedPct, variablePct, items };
}
