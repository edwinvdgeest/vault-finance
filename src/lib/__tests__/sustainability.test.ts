import { describe, it, expect } from 'vitest';
import { assessAsset, analyzeFundName, scorePortfolio, suggestFunds, findFund } from '../sustainability';
import type { Asset } from '../../types';

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    type: 'IE00B1TXK627',
    symbol: 'IE00B1TXK627',
    name: 'iShares Global Water',
    amount: 10,
    currentPrice: 60,
    lastPrice: 60,
    lastUpdated: '2026-07-01T00:00:00Z',
    assetClass: 'etf',
    isin: 'IE00B1TXK627',
    broker: 'degiro',
    ...overrides,
  };
}

describe('analyzeFundName', () => {
  it('recognizes strict labels: SRI, Paris-Aligned, Climate Transition', () => {
    expect(analyzeFundName('Amundi MSCI World SRI Climate Net Zero').level).toBe(2);
    expect(analyzeFundName('Xtrackers MSCI World Paris Aligned').level).toBe(2);
    expect(analyzeFundName('Amundi MSCI World Climate Transition CTB').level).toBe(2);
  });

  it('recognizes sustainable themes and treats theme funds as strict', () => {
    const water = analyzeFundName('LYXOR WORLD WATER UCITS ETF');
    expect(water.themes).toContain('water');
    expect(water.level).toBe(2);
    const energy = analyzeFundName('BNP Paribas Easy Renewable Energy');
    expect(energy.themes).toContain('hernieuwbare-energie');
  });

  it('recognizes light ESG labels', () => {
    expect(analyzeFundName('UBS MSCI World ESG Universal').level).toBe(1);
    expect(analyzeFundName('Northern Trust World Custom ESG Screened').level).toBe(1);
  });

  it('returns level 0 for regular funds', () => {
    const r = analyzeFundName('VANGUARD FTSE ALL-WORLD UCITS ETF');
    expect(r.level).toBe(0);
    expect(r.signals).toHaveLength(0);
  });
});

describe('assessAsset', () => {
  it('matches the verified database by ISIN', () => {
    const a = assessAsset(makeAsset());
    expect(a.source).toBe('database');
    expect(a.level).toBe(2); // themafonds water
    expect(a.sfdr).toBe(8);
    expect(a.themes).toContain('water');
  });

  it('matches on ticker symbol when ISIN is absent', () => {
    const fund = findFund({ isin: undefined, type: 'x', symbol: 'NL0010408704' });
    expect(fund?.name).toContain('VanEck');
  });

  it('falls back to name recognition for unknown funds', () => {
    const a = assessAsset(makeAsset({
      isin: 'XX0000000001', type: 'XX0000000001', symbol: 'XXX',
      name: 'Some Provider MSCI World SRI UCITS ETF',
    }));
    expect(a.source).toBe('naamherkenning');
    expect(a.level).toBe(2);
    expect(a.signals.join(' ')).toContain('SRI');
  });

  it('prefers a manual classification and keeps its note', () => {
    const a = assessAsset(makeAsset({
      sustainability: { sfdr: 9, themes: ['impact'], note: 'prospectus check jul 2026' },
    }));
    expect(a.source).toBe('handmatig');
    expect(a.level).toBe(3);
    expect(a.note).toBe('prospectus check jul 2026');
  });

  it('upgrades manual art. 8 to strict when strict name signals exist', () => {
    const a = assessAsset(makeAsset({
      isin: 'XX0000000002', type: 'XX0000000002', symbol: 'XXX',
      name: 'Provider MSCI World SRI ETF',
      sustainability: { sfdr: 8 },
    }));
    expect(a.level).toBe(2);
  });

  it('returns level 0 with source "geen" for unrecognized holdings', () => {
    const a = assessAsset(makeAsset({
      isin: 'XX0000000003', type: 'XX0000000003', symbol: 'XXX', name: 'Random Fund',
    }));
    expect(a.source).toBe('geen');
    expect(a.level).toBe(0);
  });
});

describe('scorePortfolio', () => {
  it('weighs levels by value and excludes broker cash from the score', () => {
    const assets: Asset[] = [
      makeAsset({ amount: 10, currentPrice: 60 }), // 600 → niveau 2 (water, database)
      makeAsset({
        isin: 'LU0278271951', type: 'LU0278271951', symbol: 'LU0278271951',
        name: 'Triodos GEIF', amount: 4, currentPrice: 100,
      }), // 400 → niveau 3
      makeAsset({
        isin: 'XX0000000000', type: 'XX0000000000', symbol: 'XXX',
        name: 'Onbekend fonds', amount: 10, currentPrice: 100,
      }), // 1000 → niveau 0
      makeAsset({
        assetClass: 'broker-cash', isin: undefined, type: 'degiro-cash-eur', symbol: 'CASH',
        name: 'Cash', amount: 1, currentPrice: 5000,
      }),
    ];
    const score = scorePortfolio(assets);
    expect(score.totalValue).toBe(2000);
    expect(score.cashValue).toBe(5000);
    expect(score.byLevel[2]).toBe(600);
    expect(score.byLevel[3]).toBe(400);
    expect(score.byLevel[0]).toBe(1000);
    expect(score.pctSustainable).toBe(50);
    expect(score.pctStrict).toBe(50);
    expect(score.pctImpact).toBe(20);
    expect(score.byTheme.find(t => t.theme === 'water')?.value).toBe(600);
  });
});

describe('suggestFunds', () => {
  it('filters by theme', () => {
    const water = suggestFunds('water');
    expect(water.length).toBeGreaterThanOrEqual(2);
    expect(water.every(f => f.themes.includes('water'))).toBe(true);
  });

  it('excludes funds already in the portfolio', () => {
    const owned = [makeAsset()]; // iShares Global Water
    const water = suggestFunds('water', owned);
    expect(water.some(f => f.isins.includes('IE00B1TXK627'))).toBe(false);
    expect(water.some(f => f.isins.includes('IE00BK5BC891'))).toBe(true);
  });
});
