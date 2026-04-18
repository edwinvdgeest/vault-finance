import { describe, it, expect } from 'vitest';
import { parseIngCsv } from '../parsers/ing';

const HEADER_SEMI = '"Datum";"Naam / Omschrijving";"Rekening";"Tegenrekening";"Code";"Af Bij";"Bedrag (EUR)";"MutatieSoort";"Mededelingen"';
const HEADER_COMMA = '"Datum","Naam / Omschrijving","Rekening","Tegenrekening","Code","Af Bij","Bedrag (EUR)","Mutatiesoort","Mededelingen"';

function csv(...rows: string[]) {
  return [HEADER_SEMI, ...rows].join('\n');
}

function csvComma(...rows: string[]) {
  return [HEADER_COMMA, ...rows].join('\n');
}

describe('parseIngCsv', () => {
  it('parses Af as negative and Bij as positive', () => {
    const text = csv(
      '"20240115";"ALBERT HEIJN 1234";"NL00INGB0001234567";"";"BA";"Af";"25,43";"Betaalautomaat";"Pasvolgnr:000"',
      '"20240116";"SVB PENSIOEN";"NL00INGB0001234567";"NL11SVBG0000000000";"GT";"Bij";"1.234,56";"Overschrijving";"AOW januari"',
    );
    const txs = parseIngCsv(text, []);
    expect(txs).toHaveLength(2);
    expect(txs[0].amount).toBe(-25.43);
    expect(txs[1].amount).toBe(1234.56);
  });

  it('converts YYYYMMDD to ISO date', () => {
    const text = csv('"20240715";"Test";"NL00INGB0001234567";"";"BA";"Af";"10,00";"Betaalautomaat";""');
    const [tx] = parseIngCsv(text, []);
    expect(tx.date).toBe('2024-07-15');
  });

  it('generates stable ids across re-imports', () => {
    const text = csv('"20240115";"ALBERT HEIJN 1234";"NL00INGB0001234567";"";"BA";"Af";"25,43";"Betaalautomaat";"Pasvolgnr:000"');
    const [a] = parseIngCsv(text, []);
    const [b] = parseIngCsv(text, []);
    expect(a.id).toBe(b.id);
    expect(a.id).toMatch(/^ing-/);
  });

  it('maps fields to account/counterparty/name/description', () => {
    const text = csv('"20240115";"ALBERT HEIJN 1234";"NL00INGB0001234567";"NL99RABO0123456789";"BA";"Af";"25,43";"Betaalautomaat";"Boodschappen"');
    const [tx] = parseIngCsv(text, []);
    expect(tx.account).toBe('NL00INGB0001234567');
    expect(tx.name).toBe('ALBERT HEIJN 1234');
    expect(tx.counterparty).toBe('NL99RABO0123456789');
    expect(tx.description).toBe('Boodschappen');
    expect(tx.originalDescription).toBe('Boodschappen');
  });

  it('falls back to name as counterparty when Tegenrekening is empty', () => {
    const text = csv('"20240115";"ALBERT HEIJN 1234";"NL00INGB0001234567";"";"BA";"Af";"25,43";"Betaalautomaat";""');
    const [tx] = parseIngCsv(text, []);
    expect(tx.counterparty).toBe('ALBERT HEIJN 1234');
  });

  it('handles BOM and thousand separators', () => {
    const text = '\uFEFF' + csv('"20240101";"Rente";"NL00INGB0001234567";"";"IC";"Bij";"1.000,00";"Rente";""');
    const [tx] = parseIngCsv(text, []);
    expect(tx.amount).toBe(1000);
  });

  it('skips empty/invalid rows', () => {
    const text = csv(
      '"20240115";"OK";"NL00INGB0001234567";"";"BA";"Af";"10,00";"Betaalautomaat";""',
      '',
    );
    const txs = parseIngCsv(text, []);
    expect(txs).toHaveLength(1);
  });

  it('parses real ING export format (comma delimiter, Mutatiesoort lowercase)', () => {
    const text = csvComma(
      '"20240501","Tamoil Nieuw Vennep","NL74INGB0006458403","","BA","Af","51,26","Betaalautomaat","Pasvolgnr 021"',
      '"20240430","Gemeente Kaag","NL74INGB0006458403","NL47BNGH0285139932","IC","Af","99,73","Incasso","Gem. Belastingen"',
    );
    const txs = parseIngCsv(text, []);
    expect(txs).toHaveLength(2);
    expect(txs[0].date).toBe('2024-05-01');
    expect(txs[0].amount).toBe(-51.26);
    expect(txs[0].account).toBe('NL74INGB0006458403');
    expect(txs[1].counterparty).toBe('NL47BNGH0285139932');
  });
});
