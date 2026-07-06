import type { Transaction, Account, Asset, Budget, Property } from '../types';
import { toYearMonth, startOfMonth, endOfMonth, formatMonth } from './utils';
import { getTotalPropertyEquity } from './property';

/** Returns true for transactions that should be excluded from income/expense reporting */
function isTransfer(tx: Transaction): boolean {
  return !!tx.isInternal;
}

export function getAccountBalance(account: Account, transactions: Transaction[], asOf?: Date): number {
  const txs = transactions.filter(tx => {
    if (tx.account !== account.iban) return false;
    if (asOf) return new Date(tx.date + 'T00:00:00') <= asOf;
    return true;
  });
  return account.startingBalance + txs.reduce((sum, tx) => sum + tx.amount, 0);
}

export function getNetWorth(
  accounts: Account[],
  transactions: Transaction[],
  cryptoValue: number,
  propertyEquity: number,
  asOf?: Date,
  brokerValue: number = 0,
): number {
  const cash = accounts.reduce((sum, acc) => sum + getAccountBalance(acc, transactions, asOf), 0);
  return cash + cryptoValue + propertyEquity + brokerValue;
}

export function getMonthlyNetWorthTrend(
  accounts: Account[],
  transactions: Transaction[],
  cryptoValue: number,
  properties: Property[] = [],
): { month: string; label: string; netWorth: number }[] {
  if (accounts.length === 0 && transactions.length === 0) return [];

  const now = new Date();
  const months: { month: string; label: string; netWorth: number }[] = [];

  // Go back up to 12 months (uses current crypto value for all months)
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = endOfMonth(d);
    const month = toYearMonth(d);
    const equity = getTotalPropertyEquity(properties, end).equity;
    const nw = getNetWorth(accounts, transactions, cryptoValue, equity, end);
    months.push({ month, label: formatMonth(month), netWorth: nw });
  }

  return months;
}

export type TrendGranularity = 'daily' | 'weekly' | 'monthly';

export function getNetWorthTrend(
  accounts: Account[],
  transactions: Transaction[],
  cryptoValue: number,
  start: Date,
  end: Date,
  granularity: TrendGranularity,
  properties: Property[] = [],
  brokerValue: number = 0,
): { label: string; netWorth: number; date: string }[] {
  if (accounts.length === 0 && transactions.length === 0) return [];

  const points: { label: string; netWorth: number; date: string }[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());

  // Determine step
  const stepDays = granularity === 'daily' ? 1 : granularity === 'weekly' ? 7 : 30;

  while (cur <= end) {
    const pointDate = granularity === 'monthly'
      ? endOfMonth(cur)
      : new Date(cur);
    const asOf = pointDate > end ? end : pointDate;
    const equity = getTotalPropertyEquity(properties, asOf).equity;
    const nw = getNetWorth(accounts, transactions, cryptoValue, equity, asOf, brokerValue);

    const label = granularity === 'monthly'
      ? asOf.toLocaleDateString('nl-NL', { month: 'short' })
      : granularity === 'weekly'
      ? `${asOf.getDate()}/${asOf.getMonth() + 1}`
      : `${asOf.getDate()}/${asOf.getMonth() + 1}`;

    points.push({
      label,
      netWorth: Math.round(nw * 100) / 100,
      date: asOf.toISOString().slice(0, 10),
    });

    if (granularity === 'monthly') {
      cur.setMonth(cur.getMonth() + 1);
      cur.setDate(1);
    } else {
      cur.setDate(cur.getDate() + stepDays);
    }
  }

  return points;
}

export function getMonthlyIncomeExpense(
  transactions: Transaction[],
  start: Date,
  end: Date,
): { month: string; label: string; income: number; expenses: number }[] {
  const map = new Map<string, { income: number; expenses: number }>();

  // Collect all months in range
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    const key = toYearMonth(cur);
    map.set(key, { income: 0, expenses: 0 });
    cur.setMonth(cur.getMonth() + 1);
  }

  for (const tx of transactions) {
    if (isTransfer(tx)) continue; // skip internal transfers & overboekingen
    const d = new Date(tx.date + 'T00:00:00');
    if (d < start || d > end) continue;
    const key = toYearMonth(d);
    const entry = map.get(key) ?? { income: 0, expenses: 0 };
    if (tx.amount > 0) entry.income += tx.amount;
    else entry.expenses += Math.abs(tx.amount);
    map.set(key, entry);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { income, expenses }]) => ({
      month,
      label: formatMonth(month),
      income: Math.round(income * 100) / 100,
      expenses: Math.round(expenses * 100) / 100,
    }));
}

export function getCategorySpending(
  transactions: Transaction[],
): { category: string; amount: number }[] {
  const map = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.amount >= 0 || isTransfer(tx)) continue; // only real expenses
    const prev = map.get(tx.category) ?? 0;
    map.set(tx.category, prev + Math.abs(tx.amount));
  }
  return Array.from(map.entries())
    .map(([category, amount]) => ({ category, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount);
}

export function getAccountBreakdown(
  accounts: Account[],
  transactions: Transaction[],
): { name: string; iban: string; balance: number }[] {
  return accounts.map(acc => ({
    name: acc.name,
    iban: acc.iban,
    balance: Math.round(getAccountBalance(acc, transactions) * 100) / 100,
  }));
}

export function getTopExpenses(
  transactions: Transaction[],
  limit = 5,
): Transaction[] {
  return transactions
    .filter(tx => tx.amount < 0 && !isTransfer(tx))
    .sort((a, b) => a.amount - b.amount)
    .slice(0, limit);
}

export function getPeriodSummary(
  transactions: Transaction[],
): { income: number; expenses: number; cashflow: number; savingsRate: number } {
  let income = 0;
  let expenses = 0;
  for (const tx of transactions) {
    if (isTransfer(tx)) continue;
    if (tx.amount > 0) income += tx.amount;
    else expenses += Math.abs(tx.amount);
  }
  const cashflow = income - expenses;
  const savingsRate = income > 0 ? (cashflow / income) * 100 : 0;
  return {
    income: Math.round(income * 100) / 100,
    expenses: Math.round(expenses * 100) / 100,
    cashflow: Math.round(cashflow * 100) / 100,
    savingsRate: Math.round(savingsRate * 10) / 10,
  };
}

/** Calculate percentage delta between current and previous value, null if no prior data */
function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

export function getPeriodSummaryWithDelta(
  allTransactions: Transaction[],
  start: Date,
  end: Date,
): {
  income: number; expenses: number; cashflow: number; savingsRate: number;
  deltaIncome: number | null; deltaExpenses: number | null; deltaCashflow: number | null;
  hasPriorData: boolean;
} {
  const current = getPeriodSummary(filterByPeriod(allTransactions, start, end));

  // Same period one year ago
  const priorStart = new Date(start);
  priorStart.setFullYear(priorStart.getFullYear() - 1);
  const priorEnd = new Date(end);
  priorEnd.setFullYear(priorEnd.getFullYear() - 1);
  const prior = getPeriodSummary(filterByPeriod(allTransactions, priorStart, priorEnd));

  const hasPriorData = prior.income > 0 || prior.expenses > 0;

  return {
    ...current,
    deltaIncome: hasPriorData ? pctDelta(current.income, prior.income) : null,
    deltaExpenses: hasPriorData ? pctDelta(current.expenses, prior.expenses) : null,
    deltaCashflow: hasPriorData ? pctDelta(current.cashflow, prior.cashflow) : null,
    hasPriorData,
  };
}

/**
 * Average monthly net savings (income − expenses, excluding internal transfers)
 * over the last N full calendar months preceding the current month. Used to
 * auto-fill the projection's baseline monthly contribution from real history.
 *
 * Returns 0 when there's no data in the window. May be negative if the user
 * spent more than they earned on average — the caller decides how to handle that.
 */
export function getAvgMonthlyNetSavings(transactions: Transaction[], months = 6): number {
  if (months <= 0) return 0;
  const now = new Date();
  // Window: start of (currentMonth - months), end of previous full month
  const windowStart = new Date(now.getFullYear(), now.getMonth() - months, 1);
  const windowEnd = new Date(now.getFullYear(), now.getMonth(), 1); // exclusive

  let net = 0;
  for (const tx of transactions) {
    if (isTransfer(tx)) continue;
    const d = new Date(tx.date + 'T00:00:00');
    if (d < windowStart || d >= windowEnd) continue;
    net += tx.amount;
  }
  return net / months;
}

/**
 * Robust monthly net savings: buckets transactions by calendar month over the
 * last N full months (excluding the current partial month) and returns the
 * MEDIAN of those monthly nets. One big outlier month (e.g. asset sale, tax
 * refund) no longer pollutes the baseline the way a plain average does.
 *
 * Only months that contain at least one non-transfer transaction are counted,
 * so a fresh import with 6 months of data gives the median of those 6 months
 * rather than diluting with empty months.
 */
export function getRobustMonthlyNetSavings(transactions: Transaction[], months = 12): number {
  if (months <= 0) return 0;
  const now = new Date();
  const startD = new Date(now.getFullYear(), now.getMonth() - months, 1);
  const startYM = `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, '0')}`;
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const buckets = new Map<string, number>();
  for (const tx of transactions) {
    if (isTransfer(tx)) continue;
    const ym = tx.date.slice(0, 7); // 'YYYY-MM'
    if (ym < startYM || ym >= currentYM) continue;
    buckets.set(ym, (buckets.get(ym) ?? 0) + tx.amount);
  }

  const values = Array.from(buckets.values());
  if (values.length === 0) return 0;
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[mid - 1] + values[mid]) / 2 : values[mid];
}

export function getRecurringExpenses(
  transactions: Transaction[],
): { name: string; avgAmount: number; months: number; category: string }[] {
  // Look at last 6 months of data to find recurring expenses
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  // Group expenses by normalized name per month
  const nameMonths = new Map<string, Map<string, number[]>>();

  for (const tx of transactions) {
    if (tx.amount >= 0 || isTransfer(tx) || tx.category === 'Inkomen') continue;
    const d = new Date(tx.date + 'T00:00:00');
    if (d < sixMonthsAgo) continue;
    const month = toYearMonth(d);
    const name = (tx.name || tx.counterparty || tx.description.split('—')[0] || '').toLowerCase().trim();
    if (!name) continue;

    if (!nameMonths.has(name)) nameMonths.set(name, new Map());
    const monthMap = nameMonths.get(name)!;
    if (!monthMap.has(month)) monthMap.set(month, []);
    monthMap.get(month)!.push(Math.abs(tx.amount));
  }

  const results: { name: string; avgAmount: number; months: number; category: string }[] = [];

  for (const [name, monthMap] of nameMonths) {
    if (monthMap.size < 3) continue; // must appear in ≥3 of last 6 months
    const allAmounts = [...monthMap.values()].flat();
    const avgAmount = allAmounts.reduce((s, a) => s + a, 0) / monthMap.size;

    // Find original cased name and category from most recent tx
    const recentTx = transactions
      .filter(tx => (tx.name || tx.counterparty).toLowerCase().trim() === name && tx.amount < 0)
      .sort((a, b) => b.date.localeCompare(a.date))[0];

    results.push({
      name: recentTx ? (recentTx.name || recentTx.counterparty) : name,
      avgAmount: Math.round(avgAmount * 100) / 100,
      months: monthMap.size,
      category: recentTx?.category ?? '',
    });
  }

  return results.sort((a, b) => b.avgAmount - a.avgAmount);
}

export function getCategoryTrend(
  transactions: Transaction[],
  monthCount = 6,
): Map<string, { month: string; amount: number }[]> {
  const now = new Date();
  const months: string[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    months.push(toYearMonth(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }

  // Build category → month → total
  const catMonthMap = new Map<string, Map<string, number>>();

  for (const tx of transactions) {
    if (tx.amount >= 0 || isTransfer(tx)) continue;
    const d = new Date(tx.date + 'T00:00:00');
    const m = toYearMonth(d);
    if (!months.includes(m)) continue;

    if (!catMonthMap.has(tx.category)) catMonthMap.set(tx.category, new Map());
    const mMap = catMonthMap.get(tx.category)!;
    mMap.set(m, (mMap.get(m) ?? 0) + Math.abs(tx.amount));
  }

  // Convert to array format for each category
  const result = new Map<string, { month: string; amount: number }[]>();
  for (const [cat, mMap] of catMonthMap) {
    result.set(cat, months.map(m => ({ month: m, amount: Math.round((mMap.get(m) ?? 0) * 100) / 100 })));
  }

  return result;
}

export function getLabelSpending(
  transactions: Transaction[],
): { label: string; amount: number; count: number }[] {
  const map = new Map<string, { amount: number; count: number }>();
  for (const tx of transactions) {
    if (!tx.labels) continue;
    for (const label of tx.labels) {
      const entry = map.get(label) ?? { amount: 0, count: 0 };
      entry.amount += tx.amount; // include both income and expenses for net view
      entry.count += 1;
      map.set(label, entry);
    }
  }
  return Array.from(map.entries())
    .map(([label, { amount, count }]) => ({ label, amount: Math.round(amount * 100) / 100, count }))
    .sort((a, b) => a.amount - b.amount); // most negative (biggest spend) first
}

export function getBudgetProgress(
  transactions: Transaction[],
  budgets: Budget[],
  start: Date,
  end: Date,
): { category: string; limit: number; spent: number; percentage: number }[] {
  // Calculate how many months the period spans
  const monthSpan = Math.max(1,
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1,
  );

  // Get spending per category (only expenses, exclude transfers)
  const spendMap = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.amount >= 0 || isTransfer(tx)) continue;
    spendMap.set(tx.category, (spendMap.get(tx.category) ?? 0) + Math.abs(tx.amount));
  }

  return budgets
    .filter(b => b.monthlyLimit > 0)
    .map(b => {
      const spent = Math.round((spendMap.get(b.category) ?? 0) * 100) / 100;
      const periodLimit = Math.round(b.monthlyLimit * monthSpan * 100) / 100;
      return {
        category: b.category,
        limit: periodLimit,
        spent,
        percentage: Math.round((spent / periodLimit) * 1000) / 10,
      };
    })
    .sort((a, b) => b.percentage - a.percentage);
}

export function getTopMerchants(
  transactions: Transaction[],
  limit = 8,
): { name: string; total: number; count: number; trend: number[] }[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    months.push(toYearMonth(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }

  // Group by merchant name
  const merchants = new Map<string, { total: number; count: number; monthMap: Map<string, number> }>();

  for (const tx of transactions) {
    if (tx.amount >= 0 || isTransfer(tx)) continue;
    const name = (tx.name || tx.counterparty).trim();
    if (!name) continue;

    if (!merchants.has(name)) merchants.set(name, { total: 0, count: 0, monthMap: new Map() });
    const m = merchants.get(name)!;
    m.total += Math.abs(tx.amount);
    m.count += 1;

    const month = toYearMonth(new Date(tx.date + 'T00:00:00'));
    if (months.includes(month)) {
      m.monthMap.set(month, (m.monthMap.get(month) ?? 0) + Math.abs(tx.amount));
    }
  }

  return [...merchants.entries()]
    .filter(([, m]) => m.count >= 2)
    .sort(([, a], [, b]) => b.total - a.total)
    .slice(0, limit)
    .map(([name, m]) => ({
      name,
      total: Math.round(m.total * 100) / 100,
      count: m.count,
      trend: months.map(mo => Math.round((m.monthMap.get(mo) ?? 0) * 100) / 100),
    }));
}

export function getLastMonthEnd(): Date {
  const now = new Date();
  return endOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

export interface SankeyData {
  nodes: { id: string; label: string }[];
  links: { source: string; target: string; value: number }[];
}

export function getCashflowSankey(transactions: Transaction[]): SankeyData {
  const incomeBySource = new Map<string, number>();
  const expenseByCategory = new Map<string, number>();

  for (const tx of transactions) {
    if (isTransfer(tx)) continue;
    if (tx.amount > 0) {
      // Income: group by name/counterparty
      const source = (tx.name || tx.counterparty || 'Overig inkomen').trim();
      incomeBySource.set(source, (incomeBySource.get(source) ?? 0) + tx.amount);
    } else {
      // Expenses: group by category
      expenseByCategory.set(tx.category, (expenseByCategory.get(tx.category) ?? 0) + Math.abs(tx.amount));
    }
  }

  // Consolidate small income sources into "Overig inkomen"
  const sortedIncome = [...incomeBySource.entries()].sort((a, b) => b[1] - a[1]);
  const topIncome = sortedIncome.slice(0, 6);
  const restIncome = sortedIncome.slice(6).reduce((sum, [, v]) => sum + v, 0);
  if (restIncome > 0) topIncome.push(['Overig inkomen', restIncome]);

  // Consolidate small expense categories into "Overig"
  const sortedExpenses = [...expenseByCategory.entries()].sort((a, b) => b[1] - a[1]);
  const topExpenses = sortedExpenses.slice(0, 10);
  const restExpenses = sortedExpenses.slice(10).reduce((sum, [, v]) => sum + v, 0);
  if (restExpenses > 0) topExpenses.push(['Overig', restExpenses]);

  const totalIncome = topIncome.reduce((s, [, v]) => s + v, 0);
  const totalExpenses = topExpenses.reduce((s, [, v]) => s + v, 0);
  const savings = totalIncome - totalExpenses;

  // Build nodes: income sources → "Inkomen" hub → expense categories
  const nodes: { id: string; label: string }[] = [];
  const links: { source: string; target: string; value: number }[] = [];

  // Income source nodes
  for (const [name, amount] of topIncome) {
    const id = `in_${name}`;
    nodes.push({ id, label: name });
    links.push({ source: id, target: 'hub_income', value: Math.round(amount * 100) / 100 });
  }

  // Hub node
  nodes.push({ id: 'hub_income', label: 'Inkomen' });

  // Expense category nodes
  for (const [cat, amount] of topExpenses) {
    const id = `out_${cat}`;
    nodes.push({ id, label: cat });
    links.push({ source: 'hub_income', target: id, value: Math.round(amount * 100) / 100 });
  }

  // Savings node
  if (savings > 0) {
    nodes.push({ id: 'out_savings', label: 'Gespaard' });
    links.push({ source: 'hub_income', target: 'out_savings', value: Math.round(savings * 100) / 100 });
  }

  return { nodes, links };
}

export const TAX_TYPES = ['Belastingdienst', 'Gemeente', 'Waterschap', 'CAK', 'DUO', 'CJIB', 'Overig'] as const;
export type TaxType = typeof TAX_TYPES[number];

export function classifyTaxType(tx: Transaction): TaxType {
  const text = `${tx.name} ${tx.counterparty} ${tx.description}`.toLowerCase();
  if (text.includes('belastingdienst')) return 'Belastingdienst';
  if (text.includes('gemeente')) return 'Gemeente';
  if (text.includes('waterschap')) return 'Waterschap';
  if (/\bcak\b/.test(text)) return 'CAK';
  if (/\bduo\b/.test(text)) return 'DUO';
  if (/\bcjib\b/.test(text)) return 'CJIB';
  // Fallback: catches "belasting" but not the above (e.g. motorrijtuigenbelasting)
  if (text.includes('belasting')) return 'Belastingdienst';
  return 'Overig';
}

export interface TaxYearBreakdown {
  year: string;
  paid: number;
  refunds: number;
  net: number;
  income: number;
  pctOfIncome: number;
  byType: { type: TaxType; paid: number; refunds: number; net: number; count: number }[];
  transactions: Transaction[];
}

export function getTaxBreakdown(transactions: Transaction[]): TaxYearBreakdown[] {
  // Group by year
  const byYear = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const year = tx.date.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(tx);
  }

  const results: TaxYearBreakdown[] = [];
  for (const [year, yearTxs] of byYear) {
    // Income calculation for this year
    let income = 0;
    for (const tx of yearTxs) {
      if (isTransfer(tx)) continue;
      if (tx.amount > 0 && tx.category !== 'Belastingen') income += tx.amount;
    }

    // Tax breakdown
    const taxTxs = yearTxs.filter(t => t.category === 'Belastingen');
    let paid = 0;
    let refunds = 0;
    const typeMap = new Map<TaxType, { paid: number; refunds: number; count: number }>();

    for (const tx of taxTxs) {
      if (tx.amount < 0) paid += Math.abs(tx.amount);
      else refunds += tx.amount;
      const type = classifyTaxType(tx);
      if (!typeMap.has(type)) typeMap.set(type, { paid: 0, refunds: 0, count: 0 });
      const e = typeMap.get(type)!;
      if (tx.amount < 0) e.paid += Math.abs(tx.amount);
      else e.refunds += tx.amount;
      e.count += 1;
    }

    const net = paid - refunds;
    const byType = TAX_TYPES
      .filter(t => typeMap.has(t))
      .map(t => {
        const e = typeMap.get(t)!;
        return {
          type: t,
          paid: Math.round(e.paid * 100) / 100,
          refunds: Math.round(e.refunds * 100) / 100,
          net: Math.round((e.paid - e.refunds) * 100) / 100,
          count: e.count,
        };
      })
      .sort((a, b) => b.net - a.net);

    results.push({
      year,
      paid: Math.round(paid * 100) / 100,
      refunds: Math.round(refunds * 100) / 100,
      net: Math.round(net * 100) / 100,
      income: Math.round(income * 100) / 100,
      pctOfIncome: income > 0 ? Math.round((net / income) * 1000) / 10 : 0,
      byType,
      transactions: taxTxs.slice().sort((a, b) => b.date.localeCompare(a.date)),
    });
  }

  return results.sort((a, b) => b.year.localeCompare(a.year));
}

export function filterByPeriod(transactions: Transaction[], start: Date, end: Date): Transaction[] {
  return transactions.filter(tx => {
    const d = new Date(tx.date + 'T00:00:00');
    return d >= startOfMonth(start) && d <= end;
  });
}

// ── Box 3 (vermogensbelasting) ───────────────────────────────────────────────

export interface Box3AccountLine {
  name: string;
  iban: string;
  balance: number;
  reliable: boolean; // false wanneer de transactiehistorie pas ná de peildatum begint
}

export interface Box3AssetLine {
  name: string;
  symbol: string;
  value: number; // huidige holdings × huidige koers — indicatief, niet de waarde op peildatum
}

export interface Box3Snapshot {
  year: number;
  peildatum: string; // YYYY-01-01
  accounts: Box3AccountLine[];
  totalCash: number;
  assets: Box3AssetLine[];
  totalAssets: number;
}

/**
 * Reconstrueert banktegoeden op de box 3-peildatum (1 januari) uit de
 * transactiehistorie. Beleggingen worden tegen de huidige koers en huidige
 * aantallen getoond (indicatief): historische koersen en posities zijn niet
 * beschikbaar in de dataset.
 */
export function getBox3Snapshot(
  accounts: Account[],
  transactions: Transaction[],
  assets: Asset[],
  year: number,
): Box3Snapshot {
  const peildatum = `${year}-01-01`;
  // Saldo t/m 31 december van het voorgaande jaar = stand op de peildatum
  const asOf = new Date(`${year - 1}-12-31T00:00:00`);

  // Eerste transactiedatum per rekening: als de historie pas ná de peildatum
  // begint, is het gereconstrueerde saldo mogelijk onvolledig. (startingDate is
  // vaak de importdatum en zegt weinig over hoe ver de historie teruggaat.)
  const firstTxDate = new Map<string, string>();
  for (const tx of transactions) {
    const cur = firstTxDate.get(tx.account);
    if (!cur || tx.date < cur) firstTxDate.set(tx.account, tx.date);
  }

  const accountLines: Box3AccountLine[] = accounts.map(acc => {
    const firstTx = firstTxDate.get(acc.iban);
    return {
      name: acc.name,
      iban: acc.iban,
      balance: Math.round(getAccountBalance(acc, transactions, asOf) * 100) / 100,
      reliable: (firstTx !== undefined && firstTx <= peildatum) || acc.startingDate <= peildatum,
    };
  });

  const assetLines: Box3AssetLine[] = assets.map(a => ({
    name: a.name,
    symbol: a.symbol,
    value: Math.round(a.amount * a.currentPrice * 100) / 100,
  }));

  return {
    year,
    peildatum,
    accounts: accountLines,
    totalCash: Math.round(accountLines.reduce((s, a) => s + a.balance, 0) * 100) / 100,
    assets: assetLines,
    totalAssets: Math.round(assetLines.reduce((s, a) => s + a.value, 0) * 100) / 100,
  };
}
