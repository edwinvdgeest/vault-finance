/**
 * Merchant-naam normalisatie. Ruwe transactienamen bevatten vaak filiaalnummers,
 * plaatsnamen en pas-referenties (bv. "Lidl 371 Noordwijk,PAS322") die dezelfde
 * keten in tientallen losse "merchants" opsplitsen als er letterlijk op wordt
 * gegroepeerd. Deze module levert één stabiele sleutel + nette weergavenaam per
 * merchant, zodat groeperingen (top-merchants, vaste-lasten-detectie, handmatige
 * categorie-regels) filiaal-varianten samenvoegen.
 */

export interface MerchantMatch {
  key: string;
  displayName: string;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Geseed uit dezelfde letterlijke termen als de merchant-achtige categorieën in
 * categorizer.ts (Boodschappen, Abonnementen, Internet & Telecom, Auto, Kleding &
 * Mode, Cadeaus & Shopping, Persoonlijke verzorging, Tuin & Huishouden, Sport &
 * Gezondheid, Horeca, Parkeren) — bewust NIET automatisch afgeleid van
 * multi-bedrijf-categorieën zoals Verzekeringen/Belastingen, waar één canonieke
 * merchantnaam geen zin heeft.
 */
const MERCHANT_CHAINS: { canonical: string; terms: string[] }[] = [
  // Boodschappen
  { canonical: 'Albert Heijn', terms: ['albert heijn'] },
  { canonical: 'Jumbo', terms: ['jumbo'] },
  { canonical: 'Lidl', terms: ['lidl'] },
  { canonical: 'Picnic', terms: ['picnic'] },
  { canonical: 'Dirk', terms: ['dirk'] },
  { canonical: 'Aldi', terms: ['aldi'] },
  { canonical: 'Plus', terms: ['plus'] },
  { canonical: 'Spar', terms: ['spar'] },
  { canonical: 'Dekamarkt', terms: ['dekamarkt'] },
  { canonical: 'Coop', terms: ['coop'] },
  // Abonnementen
  { canonical: 'Netflix', terms: ['netflix'] },
  { canonical: 'Spotify', terms: ['spotify'] },
  { canonical: 'Disney+', terms: ['disney'] },
  { canonical: 'YouTube', terms: ['youtube'] },
  { canonical: 'HBO Max', terms: ['hbo max'] },
  { canonical: 'Videoland', terms: ['videoland'] },
  { canonical: 'NRC', terms: ['nrc'] },
  { canonical: 'Volkskrant', terms: ['volkskrant'] },
  { canonical: 'Apple', terms: ['apple', 'icloud'] },
  // Internet & Telecom
  { canonical: 'Ziggo', terms: ['ziggo'] },
  { canonical: 'Odido', terms: ['odido'] },
  { canonical: 'T-Mobile', terms: ['t-mobile'] },
  { canonical: 'Tele2', terms: ['tele2'] },
  { canonical: 'Vodafone', terms: ['vodafone'] },
  { canonical: 'Simyo', terms: ['simyo'] },
  { canonical: 'Ben', terms: ['ben'] },
  { canonical: 'KPN', terms: ['kpn'] },
  // Auto
  { canonical: 'Shell', terms: ['shell'] },
  { canonical: 'TotalEnergies', terms: ['totalenergies'] },
  { canonical: 'BP', terms: ['bp'] },
  { canonical: 'Tango', terms: ['tango'] },
  // Sport & Gezondheid
  { canonical: 'CrossFit', terms: ['crossfit'] },
  { canonical: 'Decathlon', terms: ['decathlon'] },
  { canonical: 'Intersport', terms: ['intersport'] },
  // Horeca
  { canonical: 'Deliveroo', terms: ['deliveroo'] },
  { canonical: 'Thuisbezorgd', terms: ['thuisbezorgd'] },
  { canonical: 'Uber Eats', terms: ['uber eats'] },
  // Kleding & Mode
  { canonical: 'Zalando', terms: ['zalando'] },
  { canonical: 'H&M', terms: ['h&m'] },
  { canonical: 'Zara', terms: ['zara'] },
  { canonical: 'Wehkamp', terms: ['wehkamp'] },
  { canonical: 'Primark', terms: ['primark'] },
  { canonical: 'C&A', terms: ['c&a'] },
  { canonical: 'WE Fashion', terms: ['we fashion'] },
  { canonical: 'Vero Moda', terms: ['vero moda'] },
  { canonical: 'Nike', terms: ['nike'] },
  { canonical: 'Adidas', terms: ['adidas'] },
  // Cadeaus & Shopping
  { canonical: 'Bol.com', terms: ['bol.com'] },
  { canonical: 'Amazon', terms: ['amazon'] },
  { canonical: 'Coolblue', terms: ['coolblue'] },
  { canonical: 'MediaMarkt', terms: ['mediamarkt'] },
  { canonical: 'IKEA', terms: ['ikea'] },
  { canonical: 'Action', terms: ['action'] },
  { canonical: 'HEMA', terms: ['hema'] },
  { canonical: 'Blokker', terms: ['blokker'] },
  // Persoonlijke verzorging
  { canonical: 'Kruidvat', terms: ['kruidvat'] },
  { canonical: 'Etos', terms: ['etos'] },
  { canonical: 'Douglas', terms: ['douglas'] },
  { canonical: 'Rituals', terms: ['rituals'] },
  // Tuin & Huishouden
  { canonical: 'Gamma', terms: ['gamma'] },
  { canonical: 'Praxis', terms: ['praxis'] },
  { canonical: 'Hornbach', terms: ['hornbach'] },
  { canonical: 'Karwei', terms: ['karwei'] },
  { canonical: 'Intratuin', terms: ['intratuin'] },
  // Parkeren
  { canonical: 'Q-Park', terms: ['q-park'] },
];

// Woordgrens-matchers i.p.v. plain substring: voorkomt dat korte, generieke termen
// (bv. "plus", "ben", "bp") per ongeluk binnen een ander woord matchen.
const CHAIN_MATCHERS = MERCHANT_CHAINS.map(chain => ({
  canonical: chain.canonical,
  regexes: chain.terms.map(t => new RegExp(`\\b${escapeRegex(t)}\\b`, 'i')),
}));

function titleCase(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

export function normalizeMerchant(name?: string, counterparty?: string): MerchantMatch {
  const raw = (name || counterparty || '').trim();
  if (!raw) return { key: '(onbekend)', displayName: '(onbekend)' };

  // Bunq-transactieregels plakken metadata (,PAS322 / ,NR:...) achter de
  // merchantnaam met een komma — dit is altijd ruis, nooit onderdeel van de naam.
  const withoutSuffix = raw.split(',')[0].trim() || raw;
  const text = withoutSuffix.toLowerCase();

  for (const chain of CHAIN_MATCHERS) {
    if (chain.regexes.some(r => r.test(text))) {
      return { key: chain.canonical.toLowerCase(), displayName: chain.canonical };
    }
  }

  // Generieke heuristiek: knip tokens af vanaf het eerste losstaande numerieke
  // token (filiaalnummer), zonder namen met cijfers middenin te breken (7-eleven).
  const tokens = text.split(/\s+/).filter(Boolean);
  const cutIndex = tokens.findIndex(t => /^\d+$/.test(t));
  let coreTokens = cutIndex === -1 ? tokens : tokens.slice(0, cutIndex);
  if (coreTokens.length === 0) coreTokens = tokens.slice(0, 1);

  let key = coreTokens.join(' ').trim();
  if (key.length < 3) key = tokens.slice(0, 2).join(' ').trim() || text;

  return { key, displayName: titleCase(key) };
}
