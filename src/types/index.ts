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

export interface Property {
  id: string;
  label: string;              // e.g. "Hoofdwoning"
  currentValue: number;       // current WOZ/market value (EUR)
  valuationDate: string;      // ISO YYYY-MM-DD
  annualGrowth: number;       // e.g. 0.03 (3% per year)
  mortgage?: {
    balance: number;          // outstanding principal (EUR)
    interestRate: number;     // e.g. 0.038 (3.8% nominal annual)
    monthsRemaining: number;  // remaining term in months
    type: 'annuity' | 'interest-only';
  };
}

export interface Budget {
  category: string;
  monthlyLimit: number;
}

export type ScenarioEventKind = 'oneOff' | 'recurring';

export interface ScenarioEvent {
  id: string;
  label: string;
  kind: ScenarioEventKind;
  /** negative = expense, positive = income; for 'recurring' this is the per-month amount */
  amount: number;
  /** 'YYYY-MM' */
  startMonth: string;
  /** 'YYYY-MM' (inclusive). Only for 'recurring'. */
  endMonth?: string;
  note?: string;
}

export interface Scenario {
  id: string;
  label: string;
  description?: string;
  events: ScenarioEvent[];
  /** hex color for line chart legend in compare mode */
  color?: string;
  createdAt: string;
}

export type BankType = 'bunq' | 'triodos' | 'abn';
export type PeriodFilter = 'this-month' | 'last-month' | 'quarter' | 'year' | 'custom';

export const CATEGORY_SETS = {
  personal: [
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
  ],
  holding: [
    'Omzet',
    'Managementfee',
    'Loonheffing',
    'DGA-salaris',
    'Dividend',
    'Zakelijke kosten',
    'BTW',
    'VPB',
    'Rente & bank',
    'Verzekeringen',
    'Abonnementen',
    'Reiskosten',
    'Representatie',
    'Advieskosten',
    'Overboekingen',
    'Overig',
  ],
} as const;

export type Workspace = keyof typeof CATEGORY_SETS;

/**
 * Backwards-compatibility export. Prefer `getCategories()` from
 * `src/lib/categories.ts` which is workspace-aware.
 */
export const CATEGORIES = CATEGORY_SETS.personal;

export type Category = string;
