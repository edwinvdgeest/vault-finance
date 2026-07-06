import { describe, it, expect } from 'vitest';
import { getAccountBalance, getNetWorth, getMonthlyIncomeExpense, classifyTaxType, getRobustMonthlyNetSavings, getBox3Snapshot } from '../analytics';
import type { Transaction, Account } from '../../types';

const MARCH_START = new Date('2025-03-01T00:00:00');
const MARCH_END = new Date('2025-03-31T23:59:59');

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-' + Math.random().toString(36).slice(2),
    date: '2025-03-15',
    name: 'Test',
    accountName: 'Betaalrekening',
    description: '',
    originalDescription: '',
    amount: -50,
    account: 'NL01TEST0000000001',
    counterparty: '',
    category: 'Overig',
    ...overrides,
  };
}

const testAccount: Account = {
  id: 'acc1',
  iban: 'NL01TEST0000000001',
  name: 'Betaalrekening',
  bank: 'abn',
  startingBalance: 1000,
  startingDate: '2025-01-01',
};

describe('getAccountBalance', () => {
  it('returns starting balance with no transactions', () => {
    expect(getAccountBalance(testAccount, [])).toBe(1000);
  });

  it('adds transaction amounts to starting balance', () => {
    const txs = [
      makeTx({ amount: -50 }),
      makeTx({ amount: 200 }),
      makeTx({ amount: -30 }),
    ];
    expect(getAccountBalance(testAccount, txs)).toBe(1000 - 50 + 200 - 30);
  });

  it('filters transactions by account IBAN', () => {
    const txs = [
      makeTx({ amount: 100, account: 'NL01TEST0000000001' }),
      makeTx({ amount: 500, account: 'NL99OTHER000000001' }),
    ];
    expect(getAccountBalance(testAccount, txs)).toBe(1100);
  });

  it('filters by asOf date', () => {
    const txs = [
      makeTx({ amount: 100, date: '2025-01-01' }),
      makeTx({ amount: 200, date: '2025-06-01' }),
    ];
    expect(getAccountBalance(testAccount, txs, new Date('2025-03-01'))).toBe(1100);
  });
});

describe('getNetWorth', () => {
  it('sums accounts + crypto + property equity', () => {
    const accounts = [testAccount];
    const txs = [makeTx({ amount: 500 })];
    const netWorth = getNetWorth(accounts, txs, 10_000, 200_000);
    // 1000 + 500 + 10000 + 200000 = 211500
    expect(netWorth).toBe(211_500);
  });

  it('returns crypto + property when no accounts', () => {
    expect(getNetWorth([], [], 5000, 150_000)).toBe(155_000);
  });
});

describe('getMonthlyIncomeExpense', () => {
  it('separates income from expenses', () => {
    const txs = [
      makeTx({ amount: 3000, date: '2025-03-01', category: 'Inkomen' }),
      makeTx({ amount: -100, date: '2025-03-05', category: 'Boodschappen' }),
      makeTx({ amount: -200, date: '2025-03-10', category: 'Wonen' }),
    ];
    const result = getMonthlyIncomeExpense(txs, MARCH_START, MARCH_END);
    const march = result.find(r => r.month === '2025-03');
    expect(march).toBeDefined();
    expect(march!.income).toBe(3000);
    expect(march!.expenses).toBe(300);
  });

  it('excludes internal transfers', () => {
    const txs = [
      makeTx({ amount: 1000, date: '2025-03-01', isInternal: true }),
      makeTx({ amount: -1000, date: '2025-03-01', isInternal: true }),
      makeTx({ amount: 500, date: '2025-03-01' }),
    ];
    const result = getMonthlyIncomeExpense(txs, MARCH_START, MARCH_END);
    const march = result.find(r => r.month === '2025-03');
    expect(march!.income).toBe(500);
    expect(march!.expenses).toBe(0);
  });
});

describe('classifyTaxType', () => {
  it('classifies Belastingdienst', () => {
    const tx = makeTx({ name: 'Belastingdienst', category: 'Belastingen' });
    expect(classifyTaxType(tx)).toBe('Belastingdienst');
  });

  it('classifies Gemeente', () => {
    const tx = makeTx({ name: 'Gemeente Amsterdam', category: 'Belastingen' });
    expect(classifyTaxType(tx)).toBe('Gemeente');
  });

  it('classifies Waterschap', () => {
    const tx = makeTx({ name: 'Waterschap Rivierenland', category: 'Belastingen' });
    expect(classifyTaxType(tx)).toBe('Waterschap');
  });

  it('falls back to Overig', () => {
    const tx = makeTx({ name: 'Onbekende Instelling', category: 'Belastingen' });
    expect(classifyTaxType(tx)).toBe('Overig');
  });
});

describe('getRobustMonthlyNetSavings', () => {
  /** Build a tx in the month that is `offset` months before now. */
  function txInMonth(offset: number, amount: number, id = `tx-${offset}-${amount}`): Transaction {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 15);
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
    return makeTx({ id, date: ymd, amount, category: amount > 0 ? 'Inkomen' : 'Overig' });
  }

  it('returns median of monthly nets, ignoring a single huge outlier', () => {
    // 11 "normal" months of +1000 each, 1 outlier month of +60_000 (apartment sale)
    const txs: Transaction[] = [];
    for (let i = 1; i <= 12; i++) {
      txs.push(txInMonth(i, i === 6 ? 60_000 : 1000));
    }
    // Simple average would be (11*1000 + 60_000) / 12 ≈ 5917. Median is 1000.
    expect(getRobustMonthlyNetSavings(txs, 12)).toBe(1000);
  });

  it('uses median when income and expenses mix per month', () => {
    // Each month has +3000 income and -2000 expenses → net +1000 per month
    const txs: Transaction[] = [];
    for (let i = 1; i <= 6; i++) {
      txs.push(txInMonth(i, 3000, `in-${i}`));
      txs.push(txInMonth(i, -2000, `ex-${i}`));
    }
    expect(getRobustMonthlyNetSavings(txs, 12)).toBe(1000);
  });

  it('returns 0 for empty transaction list', () => {
    expect(getRobustMonthlyNetSavings([], 12)).toBe(0);
  });

  it('excludes transfers from the baseline', () => {
    const txs: Transaction[] = [];
    for (let i = 1; i <= 6; i++) {
      txs.push(txInMonth(i, 1000, `in-${i}`));
      const transfer = txInMonth(i, -5000, `tr-${i}`);
      transfer.isInternal = true;
      txs.push(transfer);
    }
    expect(getRobustMonthlyNetSavings(txs, 12)).toBe(1000);
  });

  it('only counts months with activity (no dilution from empty months)', () => {
    // Only 2 months of data, both with +1000. Window says 12 but empty months don't count.
    const txs: Transaction[] = [txInMonth(1, 1000), txInMonth(2, 1000)];
    expect(getRobustMonthlyNetSavings(txs, 12)).toBe(1000);
  });
});

describe('getBox3Snapshot', () => {
  const account: Account = {
    id: 'acc1',
    iban: 'NL01TEST0000000001',
    name: 'Betaalrekening',
    bank: 'abn',
    startingBalance: 1000,
    startingDate: '2024-01-01',
  };

  it('reconstructs the balance as of 1 January (transactions strictly before the year)', () => {
    const txs = [
      makeTx({ date: '2024-06-01', amount: 500 }),
      makeTx({ date: '2024-12-31', amount: -200 }),
      makeTx({ date: '2025-01-01', amount: -999 }), // op/na peildatum telt niet mee
      makeTx({ date: '2025-03-15', amount: -999 }),
    ];
    const snap = getBox3Snapshot([account], txs, [], 2025);
    expect(snap.peildatum).toBe('2025-01-01');
    expect(snap.accounts[0].balance).toBe(1000 + 500 - 200);
    expect(snap.totalCash).toBe(1300);
  });

  it('flags accounts whose history starts after the peildatum as unreliable', () => {
    const late: Account = { ...account, id: 'acc2', iban: 'NL99LATE0000000001', startingDate: '2025-06-01' };
    const snap = getBox3Snapshot([account, late], [], [], 2025);
    expect(snap.accounts.find(a => a.iban === late.iban)?.reliable).toBe(false);
    expect(snap.accounts.find(a => a.iban === account.iban)?.reliable).toBe(true);
  });

  it('treats a late startingDate as reliable when transactions predate the peildatum', () => {
    // startingDate is vaak de importdatum; historie van vóór de peildatum telt
    const imported: Account = { ...account, id: 'acc3', iban: 'NL77IMP00000000001', startingDate: '2026-03-01' };
    const txs = [makeTx({ date: '2023-05-01', amount: 100, account: imported.iban })];
    const snap = getBox3Snapshot([imported], txs, [], 2025);
    expect(snap.accounts[0].reliable).toBe(true);
  });

  it('values assets at current holdings and price', () => {
    const assets = [
      { type: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', amount: 0.5, currentPrice: 60000, lastPrice: 60000, lastUpdated: '2025-01-01' },
      { type: 'IE00B3RBWM25', symbol: 'VWRL', name: 'Vanguard FTSE All-World', amount: 10, currentPrice: 110, lastPrice: 110, lastUpdated: '2025-01-01', assetClass: 'etf' as const },
    ];
    const snap = getBox3Snapshot([], [], assets, 2025);
    expect(snap.totalAssets).toBe(30000 + 1100);
    expect(snap.assets).toHaveLength(2);
  });
});
