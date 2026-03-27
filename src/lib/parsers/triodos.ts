import Papa from 'papaparse';
import type { Transaction } from '../../types';
import { categorize } from '../categorizer';
import type { Rule } from '../../types';

function parseAmount(raw: string, debitCredit: string): number {
  // "100.000,00" -> remove dots, replace comma with dot -> 100000.00
  const cleaned = raw.replace(/\./g, '').replace(',', '.');
  const value = parseFloat(cleaned);
  return debitCredit.toLowerCase() === 'debet' ? -Math.abs(value) : Math.abs(value);
}

function parseDate(raw: string): string {
  // DD-MM-YYYY -> YYYY-MM-DD
  const [d, m, y] = raw.split('-');
  return `${y}-${m}-${d}`;
}

export function parseTriodosCsv(csvText: string, rules: Rule[]): Transaction[] {
  const result = Papa.parse<string[]>(csvText.trim(), {
    header: false,
    delimiter: ',',
    skipEmptyLines: true,
  });

  return result.data
    .filter(row => row.length >= 8 && row[0])
    .map(row => {
      // date, account, amount, Credit/Debet, name, counterparty, mutation_type, description, balance
      const rawDate = (row[0] || '').trim();
      const account = (row[1] || '').trim();
      const rawAmount = (row[2] || '').trim();
      const debitCredit = (row[3] || '').trim();
      const name = (row[4] || '').trim();
      const counterparty = (row[5] || '').trim();
      const description = (row[7] || '').trim();

      const date = parseDate(rawDate);
      const amount = parseAmount(rawAmount, debitCredit);

      return {
        id: `triodos-${date}-${amount}-${name}-${Math.random().toString(36).slice(2, 7)}`,
        date,
        account,
        accountName: account,
        amount,
        counterparty,
        name,
        description,
        originalDescription: description,
        category: categorize(name, description, rules),
      } satisfies Transaction;
    });
}
