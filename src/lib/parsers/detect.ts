import type { BankType } from '../../types';

const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{4,}$/;
const YYYYMMDD_RE = /^\d{8}$/;
const TRIODOS_RE = /^"\d{2}-\d{2}-\d{4}"\s*,.*?,\s*"(Credit|Debet)"\s*,/i;

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function stripQuotes(field: string): string {
  const trimmed = field.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function firstNonEmptyLines(text: string, max = 5): string[] {
  const lines: string[] = [];
  for (const raw of stripBom(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (line) lines.push(line);
    if (lines.length >= max) break;
  }
  return lines;
}

function looksLikeAbnLine(line: string): boolean {
  if (!line.includes('\t')) return false;
  const cols = line.split('\t').map(stripQuotes);
  if (cols.length < 8) return false;
  const hasIban = cols.some(c => IBAN_RE.test(c.toUpperCase()));
  const hasYyyymmdd = cols.some(c => YYYYMMDD_RE.test(c));
  return hasIban && hasYyyymmdd;
}

export function detectBank(sample: string, fileName?: string): BankType | null {
  // Filename hint — ABN is the only supported bank that exports .tab files.
  if (fileName && /\.tab$/i.test(fileName)) return 'abn';

  const lines = firstNonEmptyLines(sample, 5);
  if (lines.length === 0) return null;

  const first = lines[0];

  // ABN AMRO: tab-delimited line with IBAN + YYYYMMDD among first few rows
  // (tolerant for optional header row or quoted fields).
  if (lines.some(looksLikeAbnLine)) {
    return 'abn';
  }

  // ING: header row contains "Datum" AND "Bedrag (EUR)"
  if (first.includes('Datum') && first.includes('Bedrag (EUR)')) {
    return 'ing';
  }

  // bunq: semicolon-delimited header with "Date" AND "Amount"
  if (first.includes(';') && first.includes('Date') && first.includes('Amount')) {
    return 'bunq';
  }

  // Triodos: quoted DD-MM-YYYY at start, with quoted "Credit"/"Debet" marker a few fields in.
  // Regex avoids naive split(',') breaking on commas inside quoted amounts like "12,34".
  if (TRIODOS_RE.test(first)) {
    return 'triodos';
  }

  return null;
}
