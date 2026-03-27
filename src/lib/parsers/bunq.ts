import Papa from 'papaparse';
import type { Transaction, Rule } from '../../types';
import { categorize } from '../categorizer';

function parseAmount(raw: string): number {
  // "-86,00" or "86,00" -> number
  return parseFloat(raw.replace(',', '.'));
}

export function parseBunqCsv(csvText: string, rules: Rule[]): Transaction[] {
  const result = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    delimiter: ';',
    skipEmptyLines: true,
  });

  return result.data
    .filter(row => row['Date'] && row['Amount'])
    .map(row => {
      const name = (row['Name'] || '').trim();
      const description = (row['Description'] || '').trim();
      const account = (row['Account'] || '').trim();
      const counterparty = (row['Counterparty'] || '').trim();
      const date = (row['Date'] || '').trim();
      const amount = parseAmount(row['Amount'] || '0');

      return {
        id: `bunq-${date}-${amount}-${name}-${Math.random().toString(36).slice(2, 7)}`,
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
