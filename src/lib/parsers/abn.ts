import type { Transaction, Rule } from '../../types';
import { categorize } from '../categorizer';

function parseAmount(raw: string): number {
  return parseFloat(raw.replace(',', '.'));
}

function parseDate(raw: string): string {
  // YYYYMMDD -> YYYY-MM-DD
  const s = raw.trim();
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function hashId(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash.toString(36);
}

function extractCounterparty(description: string): string {
  // Description uses fixed-width padding; split on 2+ spaces to get segments
  const parts = description.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);
  // parts[0] = transaction type (BEA, SEPA, iDEAL, etc.), parts[1] = counterparty name
  return parts[1] ?? parts[0] ?? '';
}

function cleanDescription(description: string): string {
  return description.replace(/\s{2,}/g, ' ').trim();
}

export function parseAbnTxt(text: string, rules: Rule[]): Transaction[] {
  return text
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.trim() !== '')
    .map(line => {
      const cols = line.split('\t');
      if (cols.length < 9) return null;

      const account = (cols[1] ?? '').trim();
      const date = parseDate(cols[3] ?? '');
      const amount = parseAmount(cols[7] ?? '0');
      const rawDescription = cols[8] ?? '';
      const description = cleanDescription(rawDescription);
      const counterparty = extractCounterparty(rawDescription);
      const name = counterparty;

      return {
        id: `abn-${hashId(`${date}|${amount}|${rawDescription.trim()}`)}`,
        date,
        account,
        accountName: account,
        amount,
        counterparty,
        name,
        description,
        originalDescription: rawDescription.trim(),
        category: categorize(name, description, rules),
      } satisfies Transaction;
    })
    .filter((tx): tx is Transaction => tx !== null);
}
