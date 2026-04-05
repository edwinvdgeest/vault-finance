import type { Property } from '../types';

/** Months elapsed between two dates (can be negative) */
function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
    + (to.getDate() - from.getDate()) / 30;
}

/** Annuity monthly payment: M = P·r / (1 − (1+r)^−n). Returns 0 if inputs invalid. */
export function getMonthlyPayment(balance: number, annualRate: number, monthsRemaining: number): number {
  if (balance <= 0 || monthsRemaining <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return balance / monthsRemaining;
  return (balance * r) / (1 - Math.pow(1 + r, -monthsRemaining));
}

/** Property value at an arbitrary date, compounded monthly from valuationDate */
export function getPropertyValueAt(property: Property, asOf: Date): number {
  const valDate = new Date(property.valuationDate + 'T00:00:00');
  const months = monthsBetween(valDate, asOf);
  const monthlyGrowth = property.annualGrowth / 12;
  return property.currentValue * Math.pow(1 + monthlyGrowth, months);
}

/** Remaining mortgage balance at an arbitrary date (annuity schedule).
 *  Positive offset = forward in time (balance decreases).
 *  Negative offset = back in time (balance was higher). */
export function getMortgageBalanceAt(property: Property, asOf: Date): number {
  const m = property.mortgage;
  if (!m) return 0;
  const valDate = new Date(property.valuationDate + 'T00:00:00');
  const months = Math.round(monthsBetween(valDate, asOf));

  if (m.type === 'interest-only') return m.balance;

  const r = m.interestRate / 12;
  const payment = getMonthlyPayment(m.balance, m.interestRate, m.monthsRemaining);

  // Forward: iterate payments
  if (months >= 0) {
    let balance = m.balance;
    const steps = Math.min(months, m.monthsRemaining);
    for (let i = 0; i < steps; i++) {
      const interest = balance * r;
      const principal = payment - interest;
      balance = Math.max(0, balance - principal);
      if (balance === 0) break;
    }
    return balance;
  }

  // Backward: reverse the schedule — balance_prev = (balance_now + payment) / (1 + r)
  let balance = m.balance;
  const steps = Math.abs(months);
  for (let i = 0; i < steps; i++) {
    balance = (balance + payment) / (1 + r);
  }
  return balance;
}

export function getPropertyEquityAt(property: Property, asOf: Date): number {
  const value = getPropertyValueAt(property, asOf);
  const debt = getMortgageBalanceAt(property, asOf);
  return value - debt;
}

export function getTotalPropertyEquity(
  properties: Property[],
  asOf?: Date,
): { value: number; debt: number; equity: number } {
  const date = asOf ?? new Date();
  let value = 0;
  let debt = 0;
  for (const p of properties) {
    value += getPropertyValueAt(p, date);
    debt += getMortgageBalanceAt(p, date);
  }
  return {
    value: Math.round(value * 100) / 100,
    debt: Math.round(debt * 100) / 100,
    equity: Math.round((value - debt) * 100) / 100,
  };
}
