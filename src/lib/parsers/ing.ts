import Papa from 'papaparse';
import type { Transaction, Rule } from '../../types';
import { categorize } from '../categorizer';

function parseAmount(raw: string, afBij: string): number {
  const cleaned = raw.replace(/\./g, '').replace(',', '.');
  const value = Math.abs(parseFloat(cleaned));
  return afBij.trim().toLowerCase() === 'af' ? -value : value;
}

function parseDate(raw: string): string {
  const s = raw.trim();
  // ING exports date as YYYYMMDD
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  // Fallback for DD-MM-YYYY just in case
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return s;
}

function hashId(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash.toString(36);
}

function getField(row: Record<string, string>, name: string): string {
  const direct = row[name];
  if (direct !== undefined) return direct;
  const lower = name.toLowerCase();
  for (const key of Object.keys(row)) {
    if (key.toLowerCase() === lower) return row[key] ?? '';
  }
  return '';
}

export function parseIngCsv(csvText: string, rules: Rule[]): Transaction[] {
  const clean = csvText.charCodeAt(0) === 0xFEFF ? csvText.slice(1) : csvText;
  const result = Papa.parse<Record<string, string>>(clean.trim(), {
    header: true,
    delimiter: '',
    skipEmptyLines: true,
  });

  return result.data
    .filter(row => getField(row, 'Datum') && getField(row, 'Bedrag (EUR)'))
    .map(row => {
      const rawDate = getField(row, 'Datum').trim();
      const date = parseDate(rawDate);
      const account = getField(row, 'Rekening').trim();
      const counterpartyIban = getField(row, 'Tegenrekening').trim();
      const name = getField(row, 'Naam / Omschrijving').trim();
      const mededelingen = getField(row, 'Mededelingen').trim();
      const mutatieSoort = getField(row, 'Mutatiesoort').trim();
      const afBij = getField(row, 'Af Bij').trim();
      const amount = parseAmount(getField(row, 'Bedrag (EUR)') || '0', afBij);

      const description = mededelingen || mutatieSoort;
      const counterparty = counterpartyIban || name;

      return {
        id: `ing-${hashId(`${date}|${account}|${amount}|${name}|${mededelingen}`)}`,
        date,
        account,
        accountName: account,
        amount,
        counterparty,
        name,
        description,
        originalDescription: mededelingen,
        category: categorize(name, description, rules),
      } satisfies Transaction;
    });
}
