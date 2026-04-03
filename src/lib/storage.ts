import type { Transaction, Account, Rule, Asset, Budget } from '../types';
import { parseSepaFields } from './parsers/abn';

const API_BASE = import.meta.env.VITE_API_URL || '';

// Try API first, fall back to localStorage
async function apiGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(API_BASE + '/api' + path);
    if (!res.ok) throw new Error(res.statusText);
    return await res.json();
  } catch {
    const key = path.replace(/\//g, '');
    const data = localStorage.getItem('vault_' + key);
    return data ? JSON.parse(data) : fallback;
  }
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  try {
    const res = await fetch(API_BASE + '/api' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(res.statusText);
    return await res.json();
  } catch {
    const key = path.replace(/\//g, '');
    localStorage.setItem('vault_' + key, JSON.stringify(body));
    return body as T;
  }
}

async function apiPut<T>(path: string, body: unknown): Promise<T> {
  try {
    const res = await fetch(API_BASE + '/api' + path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(res.statusText);
    return await res.json();
  } catch {
    const key = path.replace(/\//g, '');
    localStorage.setItem('vault_' + key, JSON.stringify(body));
    return body as T;
  }
}

// In-memory cache for sync access (loaded on init)
let _transactions: Transaction[] = [];
let _accounts: Account[] = [];
let _rules: Rule[] = [];
let _assets: Asset[] = [];
let _budgets: Budget[] = [];
let _settings: Record<string, unknown> = {};
let _loaded = false;

export async function initStorage(): Promise<void> {
  if (_loaded) return;
  _transactions = await apiGet('/transactions', []);
  _accounts = await apiGet('/accounts', []);
  _rules = await apiGet('/rules', []);
  _assets = await apiGet('/assets', []);
  _budgets = await apiGet('/budgets', []);
  _settings = await apiGet('/settings', {});
  _loaded = true;
  // Clean up raw SEPA names from ABN imports
  const cleaned = cleanRawSepaNames(_transactions);
  if (cleaned !== _transactions) {
    _transactions = cleaned;
    localStorage.setItem('vault_transactions', JSON.stringify(_transactions));
  }
  // Auto-detect internal transfers and persist if anything changed
  const detected = detectInternalTransfers(_transactions, _accounts);
  if (detected.some((tx, i) => tx.isInternal !== _transactions[i].isInternal)) {
    _transactions = detected;
    localStorage.setItem('vault_transactions', JSON.stringify(_transactions));
  } else {
    _transactions = detected;
  }
}

/** Clean up raw SEPA names on existing transactions */
function cleanRawSepaNames(txs: Transaction[]): Transaction[] {
  let changed = false;
  const result = txs.map(tx => {
    // Only fix names that look like raw SEPA strings
    if (!tx.name || (!tx.name.includes('/TRTP/') && !tx.name.includes('/IBAN/'))) return tx;
    const sepa = parseSepaFields(tx.name);
    if (sepa?.NAME) {
      changed = true;
      return { ...tx, name: sepa.NAME, counterparty: sepa.NAME };
    }
    return tx;
  });
  return changed ? result : txs;
}

/** Mark transactions as internal when counterparty matches a known own account */
function detectInternalTransfers(txs: Transaction[], accounts: Account[]): Transaction[] {
  if (accounts.length === 0) return txs;

  const ownIbans = new Set(accounts.map(a => a.iban.replace(/\s/g, '').toUpperCase()));
  // Build set of all IBANs that appear as tx.account (covers accounts not yet registered)
  const allTxIbans = new Set(txs.map(tx => tx.account.replace(/\s/g, '').toUpperCase()));

  return txs.map(tx => {
    // Skip if already manually set
    if (tx.isInternal !== undefined) return tx;

    const txIban = tx.account.replace(/\s/g, '').toUpperCase();
    const cp = tx.counterparty.replace(/\s/g, '').toUpperCase();
    const descUpper = tx.originalDescription.toUpperCase();
    const nameUpper = tx.name.toUpperCase();

    // 1. Counterparty IBAN matches a known own account
    if (cp && ownIbans.has(cp) && cp !== txIban) return { ...tx, isInternal: true };

    // 2. Counterparty IBAN appears as account in other transactions (both sides imported)
    if (cp && allTxIbans.has(cp) && cp !== txIban) return { ...tx, isInternal: true };

    // 3. Own IBAN found in original description or counterparty (SEPA fields, etc.)
    const otherOwnIbans = [...ownIbans].filter(iban => iban !== txIban && iban.length >= 5);
    if (otherOwnIbans.some(iban => descUpper.includes(iban) || nameUpper.includes(iban) || cp.includes(iban))) {
      return { ...tx, isInternal: true };
    }

    return tx;
  });
}

export const storage = {
  getTransactions: () => _transactions,
  setTransactions: (txs: Transaction[]) => {
    _transactions = txs;
    apiPut('/transactions', txs).catch(console.error);
    localStorage.setItem('vault_transactions', JSON.stringify(txs));
  },
  updateTransaction: (id: string, updates: Partial<Transaction>) => {
    _transactions = _transactions.map(t => t.id === id ? { ...t, ...updates } : t);
    apiPut('/transactions', _transactions).catch(console.error);
    localStorage.setItem('vault_transactions', JSON.stringify(_transactions));
  },
  addTransactions: (txs: Transaction[]) => {
    const ids = new Set(_transactions.map(t => t.id));
    const newOnes = txs.filter(t => !ids.has(t.id));
    _transactions = detectInternalTransfers([..._transactions, ...newOnes], _accounts);
    apiPost('/transactions', _transactions).catch(console.error);
    localStorage.setItem('vault_transactions', JSON.stringify(_transactions));
  },

  getAccounts: () => _accounts,
  upsertAccount: (acc: Account) => {
    const idx = _accounts.findIndex(a => a.id === acc.id);
    if (idx >= 0) _accounts[idx] = acc;
    else _accounts.push(acc);
    apiPost('/accounts', _accounts).catch(console.error);
    localStorage.setItem('vault_accounts', JSON.stringify(_accounts));
  },

  getRules: () => _rules,
  setRules: (rules: Rule[]) => {
    _rules = rules;
    apiPost('/rules', rules).catch(console.error);
    localStorage.setItem('vault_rules', JSON.stringify(rules));
  },

  getAssets: () => _assets,
  setAssets: (assets: Asset[]) => {
    _assets = assets;
    apiPost('/assets', assets).catch(console.error);
    localStorage.setItem('vault_assets', JSON.stringify(assets));
  },

  getBudgets: () => _budgets,
  setBudgets: (budgets: Budget[]) => {
    _budgets = budgets;
    apiPost('/budgets', budgets).catch(console.error);
    localStorage.setItem('vault_budgets', JSON.stringify(budgets));
  },

  /** Re-detect internal transfers based on current accounts */
  refreshInternalFlags: () => {
    const updated = detectInternalTransfers(_transactions, _accounts);
    const changed = updated.some((tx, i) => tx.isInternal !== _transactions[i].isInternal);
    if (changed) {
      _transactions = updated;
      apiPut('/transactions', _transactions).catch(console.error);
      localStorage.setItem('vault_transactions', JSON.stringify(_transactions));
    }
  },

  exportAll: () => ({
    transactions: _transactions,
    accounts: _accounts,
    rules: _rules,
    assets: _assets,
    budgets: _budgets,
    settings: _settings,
  }),
  importAll: (data: { transactions?: Transaction[]; accounts?: Account[]; rules?: Rule[]; assets?: Asset[]; budgets?: Budget[]; settings?: Record<string, unknown> }) => {
    if (data.transactions) { _transactions = data.transactions; apiPut('/transactions', data.transactions).catch(console.error); }
    if (data.accounts) { _accounts = data.accounts; apiPost('/accounts', data.accounts).catch(console.error); }
    if (data.rules) { _rules = data.rules; apiPost('/rules', data.rules).catch(console.error); }
    if (data.assets) { _assets = data.assets; apiPost('/assets', data.assets).catch(console.error); }
    if (data.budgets) { _budgets = data.budgets; apiPost('/budgets', data.budgets).catch(console.error); }
    if (data.settings) { _settings = data.settings; apiPost('/settings', data.settings).catch(console.error); }
    localStorage.setItem('vault_transactions', JSON.stringify(_transactions));
    localStorage.setItem('vault_accounts', JSON.stringify(_accounts));
    localStorage.setItem('vault_rules', JSON.stringify(_rules));
    localStorage.setItem('vault_assets', JSON.stringify(_assets));
    localStorage.setItem('vault_budgets', JSON.stringify(_budgets));
  },
};

