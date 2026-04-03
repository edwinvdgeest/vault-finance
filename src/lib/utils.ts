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
  offset = 0,
): { start: Date; end: Date; label: string } {
  const now = new Date();
  switch (period) {
    case 'this-month': {
      const ref = addMonths(now, offset);
      const s = startOfMonth(ref);
      const e = offset === 0 ? now : endOfMonth(ref);
      const label = s.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
      return { start: s, end: e, label };
    }
    case 'last-month': {
      const ref = addMonths(now, -1 + offset);
      const label = ref.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
      return { start: startOfMonth(ref), end: endOfMonth(ref), label };
    }
    case 'quarter': {
      const endRef = addMonths(now, offset * 3);
      const startRef = addMonths(startOfMonth(endRef), -2);
      const e = offset === 0 ? now : endOfMonth(endRef);
      const label = `${startRef.toLocaleDateString('nl-NL', { month: 'short' })} – ${e.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })}`;
      return { start: startRef, end: e, label };
    }
    case 'year': {
      const endRef = addMonths(now, offset * 12);
      const startRef = addMonths(startOfMonth(endRef), -11);
      const e = offset === 0 ? now : endOfMonth(endRef);
      const label = `${startRef.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })} – ${e.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })}`;
      return { start: startRef, end: e, label };
    }
    case 'custom':
      return {
        start: customStart ? new Date(customStart + 'T00:00:00') : startOfMonth(now),
        end: customEnd ? new Date(customEnd + 'T23:59:59') : now,
        label: '',
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
