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
  // Strip UTF-8 BOM if present
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  return clean
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.trim() !== '')
    .map(line => {
      const cols = line.split('\t');
      // ABN AMRO TAB format: 8 columns (0-indexed)
      // 0:IBAN  1:Currency  2:Date(YYYYMMDD)  3:BeginBalance  4:EndBalance  5:ValueDate  6:Amount  7:Description
      if (cols.length < 8) return null;

      const account = (cols[0] ?? '').trim();
      const date = parseDate(cols[2] ?? '');
      const amount = parseAmount(cols[6] ?? '0');
      const rawDescription = cols[7] ?? '';
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
