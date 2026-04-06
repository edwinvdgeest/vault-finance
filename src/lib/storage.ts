import type { Transaction, Account, Rule, Asset, Budget, Property } from '../types';
import { parseSepaFields } from './parsers/abn';

const API_BASE = import.meta.env.VITE_API_URL || '';

// --- Save error tracking ---
type SaveErrorListener = (msg: string) => void;
const _errorListeners = new Set<SaveErrorListener>();
export function onSaveError(listener: SaveErrorListener) {
  _errorListeners.add(listener);
  return () => { _errorListeners.delete(listener); };
}
function notifySaveError(msg: string) {
  _errorListeners.forEach(fn => fn(msg));
}

// Safe localStorage write: catches QuotaExceededError and evicts largest key if needed
function safeLocalSet(key: string, data: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      // Evict the largest vault_ key and retry once
      let largest = '', largestSize = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('vault_')) {
          const size = localStorage.getItem(k)?.length ?? 0;
          if (size > largestSize) { largest = k; largestSize = size; }
        }
      }
      if (largest && largest !== key) {
        localStorage.removeItem(largest);
        try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* give up */ }
      }
    }
  }
}

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
  } catch (err) {
    notifySaveError(`Opslaan mislukt (${path}) — data is lokaal bewaard`);
    const key = path.replace(/\//g, '');
    safeLocalSet('vault_' + key, body);
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
  } catch (err) {
    notifySaveError(`Opslaan mislukt (${path}) — data is lokaal bewaard`);
    const key = path.replace(/\//g, '');
    safeLocalSet('vault_' + key, body);
    return body as T;
  }
}

// In-memory cache for sync access (loaded on init)
let _transactions: Transaction[] = [];
let _accounts: Account[] = [];
let _rules: Rule[] = [];
let _assets: Asset[] = [];
let _budgets: Budget[] = [];
let _properties: Property[] = [];
let _settings: Record<string, unknown> = {};
let _loaded = false;

export async function initStorage(): Promise<void> {
  if (_loaded) return;
  _transactions = await apiGet('/transactions', []);
  _accounts = await apiGet('/accounts', []);
  _rules = await apiGet('/rules', []);
  _assets = await apiGet('/assets', []);
  _budgets = await apiGet('/budgets', []);
  _properties = await apiGet('/properties', []);
  _settings = await apiGet('/settings', {});
  _loaded = true;
  // Clean up raw SEPA names from ABN imports
  const cleaned = cleanRawSepaNames(_transactions);
  if (cleaned !== _transactions) {
    _transactions = cleaned;
    safeLocalSet('vault_transactions', _transactions);
  }
  // Auto-detect internal transfers and persist if anything changed
  const detected = detectInternalTransfers(_transactions, _accounts);
  if (detected.some((tx, i) => tx.isInternal !== _transactions[i].isInternal)) {
    _transactions = detected;
    safeLocalSet('vault_transactions', _transactions);
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
    apiPut('/transactions', txs).catch(() => {});
    safeLocalSet('vault_transactions', txs);
  },
  updateTransaction: (id: string, updates: Partial<Transaction>) => {
    _transactions = _transactions.map(t => t.id === id ? { ...t, ...updates } : t);
    apiPut('/transactions', _transactions).catch(() => {});
    safeLocalSet('vault_transactions', _transactions);
  },
  addTransactions: (txs: Transaction[]) => {
    const ids = new Set(_transactions.map(t => t.id));
    const newOnes = txs.filter(t => !ids.has(t.id));
    _transactions = detectInternalTransfers([..._transactions, ...newOnes], _accounts);
    apiPut('/transactions', _transactions).catch(() => {});
    safeLocalSet('vault_transactions', _transactions);
  },

  getAccounts: () => _accounts,
  upsertAccount: (acc: Account) => {
    const idx = _accounts.findIndex(a => a.id === acc.id);
    if (idx >= 0) _accounts[idx] = acc;
    else _accounts.push(acc);
    apiPost('/accounts', _accounts).catch(() => {});
    safeLocalSet('vault_accounts', _accounts);
  },

  getRules: () => _rules,
  setRules: (rules: Rule[]) => {
    _rules = rules;
    apiPost('/rules', rules).catch(() => {});
    safeLocalSet('vault_rules', rules);
  },

  getAssets: () => _assets,
  setAssets: (assets: Asset[]) => {
    _assets = assets;
    apiPost('/assets', assets).catch(() => {});
    safeLocalSet('vault_assets', assets);
  },

  getBudgets: () => _budgets,
  setBudgets: (budgets: Budget[]) => {
    _budgets = budgets;
    apiPost('/budgets', budgets).catch(() => {});
    safeLocalSet('vault_budgets', budgets);
  },

  getProperties: () => _properties,
  setProperties: (properties: Property[]) => {
    _properties = properties;
    apiPost('/properties', properties).catch(() => {});
    safeLocalSet('vault_properties', properties);
  },

  /** Clear all transactions and accounts (keeps rules, assets, budgets) */
  clearTransactionsAndAccounts: () => {
    _transactions = [];
    _accounts = [];
    apiPut('/transactions', []).catch(() => {});
    apiPost('/accounts', []).catch(() => {});
    safeLocalSet('vault_transactions', []);
    safeLocalSet('vault_accounts', []);
  },

  /** Clear all data except rules (transactions, accounts, assets, budgets) */
  clearAllData: () => {
    _transactions = [];
    _accounts = [];
    _assets = [];
    _budgets = [];
    _properties = [];
    apiPut('/transactions', []).catch(() => {});
    apiPost('/accounts', []).catch(() => {});
    apiPost('/assets', []).catch(() => {});
    apiPost('/budgets', []).catch(() => {});
    apiPost('/properties', []).catch(() => {});
    safeLocalSet('vault_transactions', []);
    safeLocalSet('vault_accounts', []);
    safeLocalSet('vault_assets', []);
    safeLocalSet('vault_budgets', []);
    safeLocalSet('vault_properties', []);
  },

  /** Re-detect internal transfers based on current accounts */
  refreshInternalFlags: () => {
    const updated = detectInternalTransfers(_transactions, _accounts);
    const changed = updated.some((tx, i) => tx.isInternal !== _transactions[i].isInternal);
    if (changed) {
      _transactions = updated;
      apiPut('/transactions', _transactions).catch(() => {});
      safeLocalSet('vault_transactions', _transactions);
    }
  },

  exportAll: () => ({
    transactions: _transactions,
    accounts: _accounts,
    rules: _rules,
    assets: _assets,
    budgets: _budgets,
    properties: _properties,
    settings: _settings,
  }),
  importAll: (data: { transactions?: Transaction[]; accounts?: Account[]; rules?: Rule[]; assets?: Asset[]; budgets?: Budget[]; properties?: Property[]; settings?: Record<string, unknown> }) => {
    if (data.transactions) { _transactions = data.transactions; apiPut('/transactions', data.transactions).catch(() => {}); }
    if (data.accounts) { _accounts = data.accounts; apiPost('/accounts', data.accounts).catch(() => {}); }
    if (data.rules) { _rules = data.rules; apiPost('/rules', data.rules).catch(() => {}); }
    if (data.assets) { _assets = data.assets; apiPost('/assets', data.assets).catch(() => {}); }
    if (data.budgets) { _budgets = data.budgets; apiPost('/budgets', data.budgets).catch(() => {}); }
    if (data.properties) { _properties = data.properties; apiPost('/properties', data.properties).catch(() => {}); }
    if (data.settings) { _settings = data.settings; apiPost('/settings', data.settings).catch(() => {}); }
    safeLocalSet('vault_transactions', _transactions);
    safeLocalSet('vault_accounts', _accounts);
    safeLocalSet('vault_rules', _rules);
    safeLocalSet('vault_assets', _assets);
    safeLocalSet('vault_budgets', _budgets);
    safeLocalSet('vault_properties', _properties);
  },
};

