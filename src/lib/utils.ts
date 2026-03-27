import type { PeriodFilter } from '../types';

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(dateStr + 'T00:00:00'),
  );
}

export function formatMonth(dateStr: string): string {
  return new Intl.DateTimeFormat('nl-NL', { month: 'short', year: 'numeric' }).format(
    new Date(dateStr + '-01T00:00:00'),
  );
}

export function toYearMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
}

export function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

export function getPeriodDates(
  period: PeriodFilter,
  customStart?: string,
  customEnd?: string,
): { start: Date; end: Date } {
  const now = new Date();
  switch (period) {
    case 'this-month':
      return { start: startOfMonth(now), end: now };
    case 'last-month': {
      const lm = addMonths(now, -1);
      return { start: startOfMonth(lm), end: endOfMonth(lm) };
    }
    case 'quarter':
      return { start: addMonths(startOfMonth(now), -2), end: now };
    case 'year':
      return { start: addMonths(startOfMonth(now), -11), end: now };
    case 'custom':
      return {
        start: customStart ? new Date(customStart + 'T00:00:00') : startOfMonth(now),
        end: customEnd ? new Date(customEnd + 'T23:59:59') : now,
      };
  }
}

export function deduplicate<T extends { date: string; amount: number; name: string }>(
  incoming: T[],
  existing: T[],
): T[] {
  const keys = new Set(existing.map(t => `${t.date}|${t.amount}|${t.name}`));
  return incoming.filter(t => !keys.has(`${t.date}|${t.amount}|${t.name}`));
}
