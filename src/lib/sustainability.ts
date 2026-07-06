import type { Asset } from '../types';

// ── Duurzaamheid: niveau-ladder, SFDR en naam-signalen ───────────────────────
//
// De EU SFDR-verordening deelt fondsen in drie klassen (artikel 9 "donkergroen",
// artikel 8 "lichtgroen", artikel 6 "grijs"), maar artikel 8 is een brede
// vergaarbak — van licht gescreend tot behoorlijk streng. Daarom hanteert de
// app een eigen, transparante niveau-ladder bovenop SFDR:
//
//   niveau 3 — Impact: duurzaamheid is de doelstelling (SFDR art. 9)
//   niveau 2 — Streng duurzaam: SRI-, Paris-Aligned/PAB- of Climate
//              Transition/CTB-index, of een duurzaam themafonds (water,
//              hernieuwbare energie, …)
//   niveau 1 — Licht duurzaam: ESG-gescreend / SFDR art. 8 zonder strengere
//              kenmerken
//   niveau 0 — Geen duurzaamheidskenmerken herkend (of nog niet onderzocht)
//
// Niveaus worden bepaald uit (in volgorde van voorrang): handmatige
// classificatie → geverifieerde fondsendatabase → naamherkenning. SRI, PAB en
// CTB zijn wettelijk gedefinieerde benchmark-labels (EU-benchmarkverordening
// resp. MSCI SRI-methodologie), dus naamherkenning daarop is betekenisvol —
// maar altijd zichtbaar als "signaal", nooit een zwarte doos. Controleer de
// actuele SFDR-status in het prospectus van de aanbieder.

export type SustainTheme = 'water' | 'hernieuwbare-energie' | 'breed-duurzaam' | 'impact';
export type SfdrArticle = 6 | 8 | 9;
export type SustainLevel = 0 | 1 | 2 | 3;

export const THEME_LABELS: Record<SustainTheme, string> = {
  'water': 'Water',
  'hernieuwbare-energie': 'Hernieuwbare energie',
  'breed-duurzaam': 'Breed duurzaam',
  'impact': 'Impact',
};

export const LEVEL_LABELS: Record<SustainLevel, string> = {
  3: 'Impact (art. 9)',
  2: 'Streng duurzaam',
  1: 'Licht duurzaam',
  0: 'Geen duurzaamheidskenmerken',
};

export interface FundInfo {
  isins: string[]; // meerdere share classes mogelijk
  name: string;
  ticker?: string;
  themes: SustainTheme[];
  sfdr?: SfdrArticle; // weggelaten = niet met zekerheid bekend
  level: SustainLevel; // geverifieerd oordeel voor deze lijst
  ter?: number; // lopende kosten per jaar (bijv. 0.0065 = 0,65%)
  description: string;
  url: string; // fondsinformatie om classificatie te verifiëren
}

// Geverifieerde ISIN's (justETF/aanbieder, juli 2026). Bewust een korte,
// controleerbare lijst — geen beleggingsadvies, wel een startpunt per thema.
export const SUSTAINABLE_FUNDS: FundInfo[] = [
  {
    isins: ['IE00B1TXK627'],
    name: 'iShares Global Water UCITS ETF',
    ticker: 'IH2O',
    themes: ['water'],
    sfdr: 8,
    level: 2,
    ter: 0.0065,
    description: 'Volgt de S&P Global Water index: de 50 grootste waterbedrijven wereldwijd (nutsbedrijven, infrastructuur, materialen).',
    url: 'https://www.justetf.com/en/etf-profile.html?isin=IE00B1TXK627',
  },
  {
    isins: ['IE00BK5BC891'],
    name: 'L&G Clean Water UCITS ETF',
    ticker: 'GLGG',
    themes: ['water'],
    level: 2,
    ter: 0.0049,
    description: 'Volgt de Solactive Clean Water index: bedrijven in watertechnologie, -zuivering en -distributie.',
    url: 'https://www.justetf.com/en/etf-profile.html?isin=IE00BK5BC891',
  },
  {
    isins: ['IE00B1XNHC34'],
    name: 'iShares Global Clean Energy Transition UCITS ETF',
    ticker: 'INRG',
    themes: ['hernieuwbare-energie'],
    sfdr: 8,
    level: 2,
    ter: 0.0065,
    description: 'Volgt de S&P Global Clean Energy Transition index: ~100 bedrijven in zonne-, wind- en andere schone energie.',
    url: 'https://www.justetf.com/en/etf-profile.html?isin=IE00B1XNHC34',
  },
  {
    isins: ['IE00BK5BCH80'],
    name: 'L&G Clean Energy UCITS ETF',
    ticker: 'RENG',
    themes: ['hernieuwbare-energie'],
    level: 2,
    ter: 0.0049,
    description: 'Volgt de Solactive Clean Energy index: bedrijven wereldwijd in de hele schone-energieketen.',
    url: 'https://www.justetf.com/en/etf-profile.html?isin=IE00BK5BCH80',
  },
  {
    isins: ['IE00BYX2JD69'],
    name: 'iShares MSCI World SRI UCITS ETF',
    ticker: 'SUSW',
    themes: ['breed-duurzaam'],
    sfdr: 8,
    level: 2,
    ter: 0.002,
    description: 'Wereldwijd gespreid met strenge SRI-screening: alleen de best scorende bedrijven per sector (best-in-class).',
    url: 'https://www.justetf.com/en/etf-profile.html?isin=IE00BYX2JD69',
  },
  {
    isins: ['IE00BNG8L278'],
    name: 'Vanguard ESG Global All Cap UCITS ETF',
    ticker: 'V3AA',
    themes: ['breed-duurzaam'],
    sfdr: 8,
    level: 1,
    ter: 0.0024,
    description: 'Zeer breed (large/mid/small cap, ontwikkeld + opkomend) met ESG-uitsluitingen: fossiel, wapens, tabak e.d.',
    url: 'https://www.justetf.com/en/etf-profile.html?isin=IE00BNG8L278',
  },
  {
    isins: ['NL0010408704'],
    name: 'VanEck World Equal Weight Screened UCITS ETF',
    ticker: 'TSWE',
    themes: ['breed-duurzaam'],
    sfdr: 8,
    level: 1,
    ter: 0.002,
    description: '250 gelijkgewogen bedrijven uit ontwikkelde landen, gescreend op o.a. fossiel, wapens en tabak. In Nederland gedomicilieerd (geen dividendlek).',
    url: 'https://www.justetf.com/en/etf-profile.html?isin=NL0010408704',
  },
  {
    isins: ['LU0278271951', 'LU0278272413', 'LU0785617340', 'LU0785617423'],
    name: 'Triodos Global Equities Impact Fund',
    themes: ['impact', 'breed-duurzaam'],
    sfdr: 9,
    level: 3,
    description: 'Actief impactfonds ("donkergroen", artikel 9): wereldwijde large caps geselecteerd op maatschappelijke en ecologische impact.',
    url: 'https://www.triodos.nl/fondsen',
  },
];

// ── Naamherkenning ───────────────────────────────────────────────────────────

const THEME_PATTERNS: { theme: SustainTheme; re: RegExp }[] = [
  { theme: 'water', re: /\bwater\b|\baqua/i },
  { theme: 'hernieuwbare-energie', re: /clean energy|renewable|new energy|solar|wind energy|hydrogen|energy transition/i },
  { theme: 'impact', re: /\bimpact\b/i },
];

const STRICT_PATTERNS: { label: string; re: RegExp }[] = [
  { label: 'SRI-index', re: /\bSRI\b/ },
  { label: 'Paris-Aligned (PAB)', re: /paris[- ]aligned|\bPAB\b/i },
  { label: 'Climate Transition (CTB)', re: /climate transition|\bCTB\b/ },
];

const LIGHT_PATTERNS: { label: string; re: RegExp }[] = [
  { label: 'ESG in naam', re: /\bESG\b/ },
  { label: 'screened/gescreend', re: /screened|gescreend/i },
  { label: 'sustainable/duurzaam in naam', re: /sustainab|duurzaam|socially responsible/i },
];

export interface NameSignals {
  level: SustainLevel;
  themes: SustainTheme[];
  signals: string[];
}

/** Herken duurzaamheidssignalen in een fondsnaam (SRI/PAB/CTB/ESG + thema's). */
export function analyzeFundName(name: string): NameSignals {
  const themes: SustainTheme[] = [];
  const signals: string[] = [];
  let level: SustainLevel = 0;

  for (const { label, re } of STRICT_PATTERNS) {
    if (re.test(name)) { signals.push(`naam bevat ${label}`); level = 2; }
  }
  for (const { theme, re } of THEME_PATTERNS) {
    if (re.test(name)) {
      themes.push(theme);
      signals.push(`thema ${THEME_LABELS[theme]} in naam`);
      // Een duurzaam themafonds belegt per definitie in het duurzame thema
      if (level < 2) level = 2;
    }
  }
  if (level < 2) {
    for (const { label, re } of LIGHT_PATTERNS) {
      if (re.test(name)) { signals.push(label); level = 1; break; }
    }
  }
  return { level, themes, signals };
}

// ── Classificatie ────────────────────────────────────────────────────────────

export interface AssetAssessment {
  level: SustainLevel;
  sfdr?: SfdrArticle;
  themes: SustainTheme[];
  signals: string[]; // waarom dit niveau — altijd uitlegbaar
  fundName?: string; // naam uit de database, indien gematcht
  note?: string; // toelichting/bron bij handmatige classificatie
  source: 'handmatig' | 'database' | 'naamherkenning' | 'geen';
}

function levelFromSfdr(sfdr: SfdrArticle | undefined): SustainLevel | undefined {
  if (sfdr === 9) return 3;
  if (sfdr === 8) return 1;
  if (sfdr === 6) return 0;
  return undefined;
}

/** Vind fondsinfo op ISIN (asset.isin, asset.type of asset.symbol). */
export function findFund(asset: Pick<Asset, 'isin' | 'type' | 'symbol'>): FundInfo | undefined {
  const keys = [asset.isin, asset.type, asset.symbol]
    .filter((k): k is string => !!k)
    .map(k => k.trim().toUpperCase());
  return SUSTAINABLE_FUNDS.find(f => f.isins.some(i => keys.includes(i.toUpperCase())));
}

/**
 * Beoordeel een holding. Voorrang: handmatige classificatie → geverifieerde
 * database → naamherkenning. Bij handmatige SFDR-invoer kan naamherkenning het
 * niveau alleen verhogen binnen art. 8 (SRI/PAB/thema → streng i.p.v. licht).
 */
export function assessAsset(asset: Asset): AssetAssessment {
  const manual = asset.sustainability;
  if (manual && (manual.sfdr !== undefined || (manual.themes?.length ?? 0) > 0)) {
    const nameSignals = analyzeFundName(asset.name);
    const themes = (manual.themes?.length ? manual.themes : nameSignals.themes) as SustainTheme[];
    let level = levelFromSfdr(manual.sfdr) ?? (themes.length > 0 || nameSignals.level >= 1 ? nameSignals.level : 0);
    // binnen art. 8: strenge signalen (SRI/PAB/thema) tillen licht → streng
    if (manual.sfdr === 8 && (nameSignals.level >= 2 || themes.length > 0)) level = 2;
    return {
      level,
      sfdr: manual.sfdr,
      themes,
      signals: [manual.sfdr !== undefined ? `handmatig: SFDR art. ${manual.sfdr}` : 'handmatig geclassificeerd', ...nameSignals.signals],
      note: manual.note,
      source: 'handmatig',
    };
  }

  const fund = findFund(asset);
  if (fund) {
    return {
      level: fund.level,
      sfdr: fund.sfdr,
      themes: fund.themes,
      signals: [`geverifieerd fonds${fund.sfdr ? ` (SFDR art. ${fund.sfdr})` : ''}`],
      fundName: fund.name,
      source: 'database',
    };
  }

  const nameSignals = analyzeFundName(asset.name);
  if (nameSignals.level > 0 || nameSignals.themes.length > 0) {
    return {
      level: nameSignals.level,
      themes: nameSignals.themes,
      signals: nameSignals.signals,
      source: 'naamherkenning',
    };
  }

  return { level: 0, themes: [], signals: [], source: 'geen' };
}

// ── Portfolio-score ──────────────────────────────────────────────────────────

export const LEVEL_COLORS: Record<SustainLevel, string> = {
  3: '#059669',
  2: '#34d399',
  1: '#6ee7b7',
  0: '#f59e0b',
};

export interface HoldingSustainability {
  asset: Asset;
  value: number;
  assessment: AssetAssessment;
}

export interface PortfolioSustainability {
  totalValue: number; // beleggingen excl. broker-cash
  cashValue: number; // broker-cash (niet meegewogen)
  byLevel: Record<SustainLevel, number>;
  pctSustainable: number; // niveau ≥ 1, gewogen naar waarde (0-100)
  pctStrict: number; // niveau ≥ 2 (0-100)
  pctImpact: number; // niveau 3 (0-100)
  byTheme: { theme: SustainTheme; value: number }[];
  holdings: HoldingSustainability[];
}

/**
 * Duurzaamheidsprofiel van de portefeuille, gewogen naar actuele waarde.
 * Broker-cash telt niet mee in de score (cash is duurzaam noch grijs).
 */
export function scorePortfolio(assets: Asset[]): PortfolioSustainability {
  const byLevel: Record<SustainLevel, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const themeMap = new Map<SustainTheme, number>();
  const holdings: HoldingSustainability[] = [];
  let totalValue = 0;
  let cashValue = 0;

  for (const asset of assets) {
    const value = asset.amount * asset.currentPrice;
    if (asset.assetClass === 'broker-cash') {
      cashValue += value;
      continue;
    }
    const assessment = assessAsset(asset);
    byLevel[assessment.level] += value;
    totalValue += value;
    for (const theme of assessment.themes) {
      themeMap.set(theme, (themeMap.get(theme) ?? 0) + value);
    }
    holdings.push({ asset, value, assessment });
  }

  const pct = (v: number) => (totalValue > 0 ? Math.round((v / totalValue) * 1000) / 10 : 0);
  return {
    totalValue,
    cashValue,
    byLevel,
    pctSustainable: pct(byLevel[1] + byLevel[2] + byLevel[3]),
    pctStrict: pct(byLevel[2] + byLevel[3]),
    pctImpact: pct(byLevel[3]),
    byTheme: [...themeMap.entries()]
      .map(([theme, value]) => ({ theme, value }))
      .sort((a, b) => b.value - a.value),
    holdings: holdings.sort((a, b) => b.value - a.value),
  };
}

/** Fondssuggesties per thema, zonder fondsen die al in de portefeuille zitten. */
export function suggestFunds(theme?: SustainTheme, ownedAssets: Asset[] = []): FundInfo[] {
  const owned = new Set(
    ownedAssets.flatMap(a => [a.isin, a.type, a.symbol])
      .filter((k): k is string => !!k)
      .map(k => k.trim().toUpperCase()),
  );
  return SUSTAINABLE_FUNDS
    .filter(f => !theme || f.themes.includes(theme))
    .filter(f => !f.isins.some(i => owned.has(i.toUpperCase())));
}
