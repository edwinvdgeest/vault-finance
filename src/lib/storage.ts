import type { Transaction, Account, Rule, Asset } from '../types';

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

// In-memory cache for sync access (loaded on init)
let _transactions: Transaction[] = [];
let _accounts: Account[] = [];
let _rules: Rule[] = [];
let _assets: Asset[] = [];
let _settings: Record<string, unknown> = {};
let _loaded = false;

export async function initStorage(): Promise<void> {
  if (_loaded) return;
  _transactions = await apiGet('/transactions', []);
  _accounts = await apiGet('/accounts', []);
  _rules = await apiGet('/rules', []);
  _assets = await apiGet('/assets', []);
  _settings = await apiGet('/settings', {});
  _loaded = true;
}

export const storage = {
  getTransactions: () => _transactions,
  setTransactions: (txs: Transaction[]) => {
    _transactions = txs;
    apiPost('/transactions', txs).catch(console.error);
    localStorage.setItem('vault_transactions', JSON.stringify(txs));
  },
  addTransactions: (txs: Transaction[]) => {
    const ids = new Set(_transactions.map(t => t.id));
    const newOnes = txs.filter(t => !ids.has(t.id));
    _transactions = [..._transactions, ...newOnes];
    apiPost('/transactions', txs).catch(console.error);
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

  exportAll: () => ({
    transactions: _transactions,
    accounts: _accounts,
    rules: _rules,
    assets: _assets,
    settings: _settings,
  }),
  importAll: (data: { transactions?: Transaction[]; accounts?: Account[]; rules?: Rule[]; assets?: Asset[]; settings?: Record<string, unknown> }) => {
    if (data.transactions) { _transactions = data.transactions; apiPost('/transactions', data.transactions).catch(console.error); }
    if (data.accounts) { _accounts = data.accounts; apiPost('/accounts', data.accounts).catch(console.error); }
    if (data.rules) { _rules = data.rules; apiPost('/rules', data.rules).catch(console.error); }
    if (data.assets) { _assets = data.assets; apiPost('/assets', data.assets).catch(console.error); }
    if (data.settings) { _settings = data.settings; apiPost('/settings', data.settings).catch(console.error); }
    localStorage.setItem('vault_transactions', JSON.stringify(_transactions));
    localStorage.setItem('vault_accounts', JSON.stringify(_accounts));
    localStorage.setItem('vault_rules', JSON.stringify(_rules));
    localStorage.setItem('vault_assets', JSON.stringify(_assets));
  },
};

