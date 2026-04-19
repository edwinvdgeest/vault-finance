import type { BankType } from '../../types';

const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{4,}$/;
const YYYYMMDD_RE = /^\d{8}$/;
const TRIODOS_RE = /^"\d{2}-\d{2}-\d{4}"\s*,.*?,\s*"(Credit|Debet)"\s*,/i;

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function firstNonEmptyLines(text: string, max = 3): string[] {
  const lines: string[] = [];
  for (const raw of stripBom(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (line) lines.push(line);
    if (lines.length >= max) break;
  }
  return lines;
}

export function detectBank(sample: string): BankType | null {
  const lines = firstNonEmptyLines(sample, 3);
  if (lines.length === 0) return null;

  const first = lines[0];

  // ABN AMRO: tab-delimited, no header, 8+ cols, col[2] YYYYMMDD, col[0] IBAN-like
  if (first.includes('\t')) {
    const cols = first.split('\t').map(c => c.trim());
    if (
      cols.length >= 8 &&
      YYYYMMDD_RE.test(cols[2] ?? '') &&
      IBAN_RE.test((cols[0] ?? '').toUpperCase())
    ) {
      return 'abn';
    }
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
