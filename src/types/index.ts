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
  labels?: string[];
  note?: string;
  isInternal?: boolean;
}

export interface Account {
  id: string;
  name: string;
  iban: string;
  bank: 'bunq' | 'triodos' | 'abn';
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
  type: string; // CoinGecko ID (e.g., 'bitcoin', 'bitcoin-cash', 'ecash')
  symbol: string; // ticker (e.g., 'BTC', 'BCH', 'XEC')
  name: string; // display name
  amount: number;
  purchasePrice?: number; // optional EUR cost basis per unit
  currentPrice: number; // EUR price per unit
  lastPrice: number; // backward compat (same as currentPrice)
  lastUpdated: string;
}

export interface Budget {
  category: string;
  monthlyLimit: number;
}

export type BankType = 'bunq' | 'triodos' | 'abn';
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
  'Verzekeringen',
  'Zorg & Medisch',
  'Internet & Telecom',
  'Kinderopvang',
  'Kleding & Mode',
  'Vakantie & Reizen',
  'Cadeaus & Shopping',
  'Persoonlijke verzorging',
  'Belastingen',
  'Tuin & Huishouden',
  'Donaties',
  'Parkeren',
  'Overig',
] as const;

export type Category = typeof CATEGORIES[number];
