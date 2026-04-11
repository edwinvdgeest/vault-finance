import type { Transaction, Account, Rule, Asset, Budget, Property, Scenario } from '../types';
import { parseSepaFields } from './parsers/abn';

const API_BASE = import.meta.env.VITE_API_URL || '';

// --- Workspace state ---
export interface WorkspaceDescriptor {
  slug: string;
  label: string;
  accent: string;
}

const ACTIVE_WS_KEY = 'vault_active_workspace';
let _currentWorkspace: string = (typeof localStorage !== 'undefined' && localStorage.getItem(ACTIVE_WS_KEY)) || 'personal';

export function getCurrentWorkspace(): string {
  return _currentWorkspace;
}

export async function listWorkspaces(): Promise<WorkspaceDescriptor[]> {
  try {
    const res = await fetch(API_BASE + '/api/workspaces');
    if (!res.ok) throw new Error(res.statusText);
    return await res.json();
  } catch {
    return [
      { slug: 'personal', label: 'Privé', accent: '#8b5cf6' },
      { slug: 'holding', label: 'Unleashing Energy', accent: '#f59e0b' },
    ];
  }
}

function wsKey(key: string): string {
  return `vault_${_currentWorkspace}_${key}`;
}

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

// Build API URL scoped to the current workspace.
function apiUrl(path: string): string {
  return `${API_BASE}/api/ws/${_currentWorkspace}${path}`;
}

// Try API first, fall back to localStorage
async function apiGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(apiUrl(path));
    if (!res.ok) throw new Error(res.statusText);
    return await res.json();
  } catch {
    const key = path.replace(/\//g, '');
    const data = localStorage.getItem(wsKey(key));
    return data ? JSON.parse(data) : fallback;
  }
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  try {
    const res = await fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(res.statusText);
    return await res.json();
  } catch (err) {
    notifySaveError(`Opslaan mislukt (${path}) — data is lokaal bewaard`);
    const key = path.replace(/\//g, '');
    safeLocalSet(wsKey(key), body);
    return body as T;
  }
}

async function apiPut<T>(path: string, body: unknown): Promise<T> {
  try {
    const res = await fetch(apiUrl(path), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(res.statusText);
    return await res.json();
  } catch (err) {
    notifySaveError(`Opslaan mislukt (${path}) — data is lokaal bewaard`);
    const key = path.replace(/\//g, '');
    safeLocalSet(wsKey(key), body);
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
let _scenarios: Scenario[] = [];
let _settings: Record<string, unknown> = {};
let _loadedFor: string | null = null;

export async function initStorage(): Promise<void> {
  if (_loadedFor === _currentWorkspace) return;
  _transactions = await apiGet('/transactions', []);
  _accounts = await apiGet('/accounts', []);
  _rules = await apiGet('/rules', []);
  _assets = await apiGet('/assets', []);
  _budgets = await apiGet('/budgets', []);
  _properties = await apiGet('/properties', []);
  _scenarios = await apiGet('/scenarios', []);
  _settings = await apiGet('/settings', {});
  _loadedFor = _currentWorkspace;
  // Clean up raw SEPA names from ABN imports
  const cleaned = cleanRawSepaNames(_transactions);
  if (cleaned !== _transactions) {
    _transactions = cleaned;
    safeLocalSet(wsKey('transactions'), _transactions);
  }
  // Auto-detect internal transfers and persist if anything changed
  const detected = detectInternalTransfers(_transactions, _accounts);
  if (detected.some((tx, i) => tx.isInternal !== _transactions[i].isInternal)) {
    _transactions = detected;
    safeLocalSet(wsKey('transactions'), _transactions);
  } else {
    _transactions = detected;
  }
}

/**
 * Switch to another workspace. Clears caches and reloads data from the
 * new workspace. React components should remount (e.g. via `key={workspace}`)
 * to pick up the new data.
 */
export async function setWorkspace(ws: string): Promise<void> {
  if (ws === _currentWorkspace) return;
  _currentWorkspace = ws;
  _transactions = [];
  _accounts = [];
  _rules = [];
  _assets = [];
  _budgets = [];
  _properties = [];
  _scenarios = [];
  _settings = {};
  _loadedFor = null;
  try { localStorage.setItem(ACTIVE_WS_KEY, ws); } catch { /* ignore */ }
  await initStorage();
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
    safeLocalSet(wsKey('transactions'), txs);
  },
  updateTransaction: (id: string, updates: Partial<Transaction>) => {
    _transactions = _transactions.map(t => t.id === id ? { ...t, ...updates } : t);
    apiPut('/transactions', _transactions).catch(() => {});
    safeLocalSet(wsKey('transactions'), _transactions);
  },
  addTransactions: (txs: Transaction[]) => {
    const ids = new Set(_transactions.map(t => t.id));
    const newOnes = txs.filter(t => !ids.has(t.id));
    _transactions = detectInternalTransfers([..._transactions, ...newOnes], _accounts);
    apiPut('/transactions', _transactions).catch(() => {});
    safeLocalSet(wsKey('transactions'), _transactions);
  },

  getAccounts: () => _accounts,
  upsertAccount: (acc: Account) => {
    const idx = _accounts.findIndex(a => a.id === acc.id);
    if (idx >= 0) _accounts[idx] = acc;
    else _accounts.push(acc);
    apiPost('/accounts', _accounts).catch(() => {});
    safeLocalSet(wsKey('accounts'), _accounts);
  },

  getRules: () => _rules,
  setRules: (rules: Rule[]) => {
    _rules = rules;
    apiPost('/rules', rules).catch(() => {});
    safeLocalSet(wsKey('rules'), rules);
  },

  getAssets: () => _assets,
  setAssets: (assets: Asset[]) => {
    _assets = assets;
    apiPost('/assets', assets).catch(() => {});
    safeLocalSet(wsKey('assets'), assets);
  },

  getBudgets: () => _budgets,
  setBudgets: (budgets: Budget[]) => {
    _budgets = budgets;
    apiPost('/budgets', budgets).catch(() => {});
    safeLocalSet(wsKey('budgets'), budgets);
  },

  getProperties: () => _properties,
  setProperties: (properties: Property[]) => {
    _properties = properties;
    apiPost('/properties', properties).catch(() => {});
    safeLocalSet(wsKey('properties'), properties);
  },

  getScenarios: () => _scenarios,
  setScenarios: (scenarios: Scenario[]) => {
    _scenarios = scenarios;
    apiPost('/scenarios', scenarios).catch(() => {});
    safeLocalSet(wsKey('scenarios'), scenarios);
  },
  upsertScenario: (scenario: Scenario) => {
    const idx = _scenarios.findIndex(s => s.id === scenario.id);
    const next = idx >= 0
      ? _scenarios.map((s, i) => (i === idx ? scenario : s))
      : [..._scenarios, scenario];
    _scenarios = next;
    apiPost('/scenarios', next).catch(() => {});
    safeLocalSet(wsKey('scenarios'), next);
  },
  deleteScenario: (id: string) => {
    _scenarios = _scenarios.filter(s => s.id !== id);
    apiPost('/scenarios', _scenarios).catch(() => {});
    safeLocalSet(wsKey('scenarios'), _scenarios);
  },

  getSettings: () => _settings,
  setSettings: (settings: Record<string, unknown>) => {
    _settings = settings;
    apiPost('/settings', settings).catch(() => {});
    safeLocalSet(wsKey('settings'), settings);
  },
  updateSettings: (partial: Record<string, unknown>) => {
    _settings = { ..._settings, ...partial };
    apiPost('/settings', _settings).catch(() => {});
    safeLocalSet(wsKey('settings'), _settings);
  },

  /** Clear all transactions and accounts (keeps rules, assets, budgets) */
  clearTransactionsAndAccounts: () => {
    _transactions = [];
    _accounts = [];
    apiPut('/transactions', []).catch(() => {});
    apiPost('/accounts', []).catch(() => {});
    safeLocalSet(wsKey('transactions'), []);
    safeLocalSet(wsKey('accounts'), []);
  },

  /** Clear all data except rules (transactions, accounts, assets, budgets, scenarios) */
  clearAllData: () => {
    _transactions = [];
    _accounts = [];
    _assets = [];
    _budgets = [];
    _properties = [];
    _scenarios = [];
    apiPut('/transactions', []).catch(() => {});
    apiPost('/accounts', []).catch(() => {});
    apiPost('/assets', []).catch(() => {});
    apiPost('/budgets', []).catch(() => {});
    apiPost('/properties', []).catch(() => {});
    apiPost('/scenarios', []).catch(() => {});
    safeLocalSet(wsKey('transactions'), []);
    safeLocalSet(wsKey('accounts'), []);
    safeLocalSet(wsKey('assets'), []);
    safeLocalSet(wsKey('budgets'), []);
    safeLocalSet(wsKey('properties'), []);
    safeLocalSet(wsKey('scenarios'), []);
  },

  /** Re-detect internal transfers based on current accounts */
  refreshInternalFlags: () => {
    const updated = detectInternalTransfers(_transactions, _accounts);
    const changed = updated.some((tx, i) => tx.isInternal !== _transactions[i].isInternal);
    if (changed) {
      _transactions = updated;
      apiPut('/transactions', _transactions).catch(() => {});
      safeLocalSet(wsKey('transactions'), _transactions);
    }
  },

  exportAll: () => ({
    transactions: _transactions,
    accounts: _accounts,
    rules: _rules,
    assets: _assets,
    budgets: _budgets,
    properties: _properties,
    scenarios: _scenarios,
    settings: _settings,
  }),
  importAll: (data: { transactions?: Transaction[]; accounts?: Account[]; rules?: Rule[]; assets?: Asset[]; budgets?: Budget[]; properties?: Property[]; scenarios?: Scenario[]; settings?: Record<string, unknown> }) => {
    if (data.transactions) { _transactions = data.transactions; apiPut('/transactions', data.transactions).catch(() => {}); }
    if (data.accounts) { _accounts = data.accounts; apiPost('/accounts', data.accounts).catch(() => {}); }
    if (data.rules) { _rules = data.rules; apiPost('/rules', data.rules).catch(() => {}); }
    if (data.assets) { _assets = data.assets; apiPost('/assets', data.assets).catch(() => {}); }
    if (data.budgets) { _budgets = data.budgets; apiPost('/budgets', data.budgets).catch(() => {}); }
    if (data.properties) { _properties = data.properties; apiPost('/properties', data.properties).catch(() => {}); }
    if (data.scenarios) { _scenarios = data.scenarios; apiPost('/scenarios', data.scenarios).catch(() => {}); }
    if (data.settings) { _settings = data.settings; apiPost('/settings', data.settings).catch(() => {}); }
    safeLocalSet(wsKey('transactions'), _transactions);
    safeLocalSet(wsKey('accounts'), _accounts);
    safeLocalSet(wsKey('rules'), _rules);
    safeLocalSet(wsKey('assets'), _assets);
    safeLocalSet(wsKey('budgets'), _budgets);
    safeLocalSet(wsKey('properties'), _properties);
    safeLocalSet(wsKey('scenarios'), _scenarios);
    safeLocalSet(wsKey('settings'), _settings);
  },
};

