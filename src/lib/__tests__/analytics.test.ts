import { describe, it, expect } from 'vitest';
import { getAccountBalance, getNetWorth, getMonthlyIncomeExpense, classifyTaxType } from '../analytics';
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
