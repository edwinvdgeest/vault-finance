export interface Transaction {
  id: string;
  date: string; // ISO YYYY-MM-DD
  account: string; // IBAN
  accountName: string;
  amount: number;
  counterparty: string;
  name: string;
  description: string;
  category: string;
  originalDescription: string;
}

export interface Account {
  id: string;
  name: string;
  iban: string;
  bank: 'bunq' | 'triodos';
  startingBalance: number;
  startingDate: string; // ISO YYYY-MM-DD
}

export interface Rule {
  id: string;
  pattern: string;
  category: string;
  isCustom: boolean;
}

export interface Asset {
  type: 'bitcoin';
  amount: number;
  lastPrice: number;
  lastUpdated: string;
}

export type BankType = 'bunq' | 'triodos';
export type PeriodFilter = 'this-month' | 'last-month' | 'quarter' | 'year' | 'custom';

export const CATEGORIES = [
  'Boodschappen',
  'Auto',
  'Transport',
  'Sport & Gezondheid',
  'Abonnementen',
  'Wonen',
  'Horeca',
  'Bank & Rente',
  'Overboekingen',
  'Inkomen',
  'Overig',
] as const;

export type Category = typeof CATEGORIES[number];
