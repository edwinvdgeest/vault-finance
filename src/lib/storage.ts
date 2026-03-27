import type { Transaction, Account, Rule, Asset } from '../types';

const KEYS = {
  transactions: 'vf_transactions',
  accounts: 'vf_accounts',
  rules: 'vf_rules',
  assets: 'vf_assets',
};

function get<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function set<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export const storage = {
  getTransactions: (): Transaction[] => get<Transaction[]>(KEYS.transactions, []),
  setTransactions: (txs: Transaction[]) => set(KEYS.transactions, txs),
  addTransactions: (newTxs: Transaction[]) => {
    const existing = get<Transaction[]>(KEYS.transactions, []);
    set(KEYS.transactions, [...existing, ...newTxs]);
  },

  getAccounts: (): Account[] => get<Account[]>(KEYS.accounts, []),
  setAccounts: (accounts: Account[]) => set(KEYS.accounts, accounts),
  upsertAccount: (account: Account) => {
    const existing = get<Account[]>(KEYS.accounts, []);
    const idx = existing.findIndex(a => a.id === account.id);
    if (idx >= 0) existing[idx] = account;
    else existing.push(account);
    set(KEYS.accounts, existing);
  },

  getRules: (): Rule[] => get<Rule[]>(KEYS.rules, []),
  setRules: (rules: Rule[]) => set(KEYS.rules, rules),

  getAssets: (): Asset[] => get<Asset[]>(KEYS.assets, []),
  setAssets: (assets: Asset[]) => set(KEYS.assets, assets),

  exportAll: () => ({
    transactions: get<Transaction[]>(KEYS.transactions, []),
    accounts: get<Account[]>(KEYS.accounts, []),
    rules: get<Rule[]>(KEYS.rules, []),
    assets: get<Asset[]>(KEYS.assets, []),
  }),

  importAll: (data: { transactions?: Transaction[]; accounts?: Account[]; rules?: Rule[]; assets?: Asset[] }) => {
    if (data.transactions) set(KEYS.transactions, data.transactions);
    if (data.accounts) set(KEYS.accounts, data.accounts);
    if (data.rules) set(KEYS.rules, data.rules);
    if (data.assets) set(KEYS.assets, data.assets);
  },
};
