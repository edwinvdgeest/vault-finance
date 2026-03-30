import type { Transaction, Account } from '../types';
import { toYearMonth, startOfMonth, endOfMonth, formatMonth } from './utils';

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
  asOf?: Date,
): number {
  const cash = accounts.reduce((sum, acc) => sum + getAccountBalance(acc, transactions, asOf), 0);
  return cash + cryptoValue;
}

export function getMonthlyNetWorthTrend(
  accounts: Account[],
  transactions: Transaction[],
  cryptoValue: number,
): { month: string; label: string; netWorth: number }[] {
  if (accounts.length === 0 && transactions.length === 0) return [];

  const now = new Date();
  const months: { month: string; label: string; netWorth: number }[] = [];

  // Go back up to 12 months (uses current crypto value for all months)
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = endOfMonth(d);
    const month = toYearMonth(d);
    const nw = getNetWorth(accounts, transactions, cryptoValue, end);
    months.push({ month, label: formatMonth(month), netWorth: nw });
  }

  return months;
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
    if (tx.amount >= 0) continue; // only expenses
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
    .filter(tx => tx.amount < 0)
    .sort((a, b) => a.amount - b.amount)
    .slice(0, limit);
}

export function getLastMonthEnd(): Date {
  const now = new Date();
  return endOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

export function filterByPeriod(transactions: Transaction[], start: Date, end: Date): Transaction[] {
  return transactions.filter(tx => {
    const d = new Date(tx.date + 'T00:00:00');
    return d >= startOfMonth(start) && d <= end;
  });
}
