import Papa from 'papaparse';
import type { Asset } from '../../types';

function parseAmount(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/\./g, '').replace(',', '.').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
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

/**
 * Parse a DeGiro Portfolio.csv export. The export is a snapshot of holdings
 * (not a transaction log). Headers (NL):
 *
 *   Product,Symbool/ISIN,Aantal,Slotkoers,Lokale waarde,,Waarde in EUR
 *
 * Note the empty column between "Lokale waarde" and "Waarde in EUR" — that
 * column holds the currency code (EUR/USD/...) for the local value.
 *
 * The CASH row has empty Symbool/ISIN and Slotkoers; only "Waarde in EUR" is
 * populated.
 */
export function parseDegiroPortfolio(csvText: string): Asset[] {
  const clean = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;
  const result = Papa.parse<Record<string, string>>(clean.trim(), {
    header: true,
    delimiter: ',',
    skipEmptyLines: true,
  });

  const now = new Date().toISOString();
  const assets: Asset[] = [];

  for (const row of result.data) {
    const product = getField(row, 'Product').trim();
    if (!product) continue;

    const isinOrSymbol = getField(row, 'Symbool/ISIN').trim();
    const aantalRaw = getField(row, 'Aantal');
    const slotkoersRaw = getField(row, 'Slotkoers');
    const valueEurRaw = getField(row, 'Waarde in EUR');
    const localCurrency = getField(row, 'Lokale waarde').trim();

    const valueEur = parseAmount(valueEurRaw);

    // Cash row: no ISIN/Symbol, no quantity, no closing price.
    if (!isinOrSymbol && !aantalRaw.trim() && !slotkoersRaw.trim()) {
      assets.push({
        type: 'degiro-cash-eur',
        symbol: 'CASH',
        name: product,
        amount: 1,
        currentPrice: valueEur,
        lastPrice: valueEur,
        lastUpdated: now,
        assetClass: 'broker-cash',
        broker: 'degiro',
        currency: localCurrency || 'EUR',
      });
      continue;
    }

    // ETF / equity row.
    const aantal = parseAmount(aantalRaw);
    const slotkoers = parseAmount(slotkoersRaw);
    // Per-unit EUR price: prefer derived (valueEur / aantal) for FX accuracy,
    // fall back to slotkoers if quantity is missing.
    const pricePerUnit = aantal > 0 ? valueEur / aantal : slotkoers;

    assets.push({
      type: isinOrSymbol,
      symbol: isinOrSymbol,
      name: product,
      amount: aantal,
      currentPrice: pricePerUnit,
      lastPrice: pricePerUnit,
      lastUpdated: now,
      assetClass: 'etf',
      isin: isinOrSymbol,
      broker: 'degiro',
      currency: localCurrency || 'EUR',
    });
  }

  return assets;
}
