import type { Transaction, Rule } from '../../types';
import { categorize } from '../categorizer';

function parseAmount(raw: string): number {
  // "3.000,00" or "-86,00" -> number
  return parseFloat(raw.replace(/\./g, '').replace(',', '.'));
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

/** Parse SEPA-style slash-delimited tags into a key-value map */
export function parseSepaFields(raw: string): Record<string, string> | null {
  // Match descriptions containing /TAG/VALUE patterns
  if (!raw.includes('/TRTP/') && !raw.includes('/REMI/') && !raw.includes('/NAME/') && !raw.includes('/IBAN/')) {
    return null;
  }
  const fields: Record<string, string> = {};
  // Split on /KEY/ patterns — keys are uppercase alpha, 2-5 chars
  const regex = /\/([A-Z]{2,5})\//g;
  const keys: { key: string; start: number; end: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    keys.push({ key: match[1], start: match.index, end: match.index + match[0].length });
  }
  for (let i = 0; i < keys.length; i++) {
    const valueStart = keys[i].end;
    const valueEnd = i + 1 < keys.length ? keys[i + 1].start : raw.length;
    fields[keys[i].key] = raw.slice(valueStart, valueEnd).trim();
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

/** Build a human-readable description from SEPA fields */
function formatSepaDescription(fields: Record<string, string>): string {
  const parts: string[] = [];
  // NAME = counterparty name
  if (fields.NAME) parts.push(fields.NAME);
  // REMI = remittance info / payment description
  if (fields.REMI) parts.push(fields.REMI);
  // EREF = end-to-end reference (only if meaningful)
  if (fields.EREF && fields.EREF !== 'NOTPROVIDED') parts.push(`ref: ${fields.EREF}`);
  // MARF = mandate reference (direct debits)
  if (fields.MARF) parts.push(`mandaat: ${fields.MARF}`);
  return parts.join(' — ');
}

function extractCounterparty(description: string): string {
  // First try to extract from SEPA fields
  const sepa = parseSepaFields(description);
  if (sepa?.NAME) return sepa.NAME;

  // Fallback: description uses fixed-width padding; split on 2+ spaces to get segments
  const parts = description.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);
  // parts[0] = transaction type (BEA, SEPA, iDEAL, etc.), parts[1] = counterparty name
  const candidate = parts[1] ?? parts[0] ?? '';
  // If the candidate still looks like a raw SEPA string, return empty so description is used instead
  if (candidate.startsWith('/TRTP/') || candidate.startsWith('/IBAN/')) return '';
  return candidate;
}

function cleanDescription(description: string): string {
  // Try SEPA field parsing first
  const sepa = parseSepaFields(description);
  if (sepa) return formatSepaDescription(sepa);

  // Fallback: collapse whitespace for non-SEPA descriptions (BEA, GEA, etc.)
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
