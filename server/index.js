import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', 'data');
const PORT = process.env.PORT || 3001;
const STATIC_DIR = join(__dirname, '..', 'dist');

// Workspace descriptors — labels/accents live here so renaming doesn't touch the frontend build.
const WORKSPACE_DEFS = [
  { slug: 'personal', label: 'Privé', accent: '#8b5cf6' },
  { slug: 'holding', label: 'Unleashing Energy', accent: '#f59e0b' },
  { slug: 'ouders', label: 'Ouders', accent: '#10b981' },
];
const WORKSPACES = (process.env.VAULT_WORKSPACES
  ? process.env.VAULT_WORKSPACES.split(',').map(s => s.trim())
  : WORKSPACE_DEFS.map(w => w.slug));

const DATA_FILES = ['transactions.json', 'accounts.json', 'rules.json', 'assets.json', 'budgets.json', 'properties.json', 'scenarios.json', 'settings.json'];

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
for (const ws of WORKSPACES) mkdirSync(join(DATA_DIR, ws), { recursive: true });

// One-shot migration: if flat *.json exists at DATA_DIR root, move it into data/personal/.
// Only runs when data/personal/ is otherwise empty (first boot after refactor).
function migrateFlatToPersonal() {
  const personalDir = join(DATA_DIR, 'personal');
  const personalFiles = existsSync(personalDir) ? readdirSync(personalDir) : [];
  if (personalFiles.length > 0) return; // already migrated

  let moved = 0;
  for (const f of DATA_FILES) {
    const src = join(DATA_DIR, f);
    if (!existsSync(src)) continue;
    renameSync(src, join(personalDir, f));
    moved++;
  }
  if (moved > 0) console.log(`[migration] Moved ${moved} flat data file(s) into data/personal/`);
}
migrateFlatToPersonal();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- JSON helpers (workspace-scoped) ---
function readJSON(workspace, file) {
  const path = join(DATA_DIR, workspace, file);
  if (!existsSync(path)) return file.includes('settings') ? {} : [];
  try { return JSON.parse(readFileSync(path, 'utf-8')); }
  catch { return file.includes('settings') ? {} : []; }
}

function writeJSON(workspace, file, data) {
  const dir = join(DATA_DIR, workspace);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), JSON.stringify(data, null, 2));
}

// --- Asset price refresh ---
// Ververst crypto- (CoinGecko) en ETF-koersen (Yahoo Finance, via ISIN) zodat
// het vermogen ook zonder handmatige DeGiro-import actueel blijft.
// PRICE_REFRESH_INTERVAL_MIN=0 schakelt de automatische verversing uit.
const PRICE_REFRESH_MIN = Number(process.env.PRICE_REFRESH_INTERVAL_MIN ?? 360);

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (vault-finance)' } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

// Kandidaat-symbolen voor een EUR-notering. DeGiro's "Symbool/ISIN"-kolom bevat
// soms een ticker (VWRL) en soms een ISIN; tickers proberen we direct op
// Amsterdam (.AS) en Xetra (.DE), daarna valt alles terug op Yahoo-search.
async function yahooSymbolCandidates(asset) {
  if (asset.yahooSymbol) return [asset.yahooSymbol];
  const candidates = [];
  const sym = (asset.symbol || '').trim().toUpperCase();
  if (sym && !ISIN_RE.test(sym)) candidates.push(`${sym}.AS`, `${sym}.DE`, sym);
  try {
    const q = asset.isin || asset.type;
    const search = await fetchJson(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`);
    const quotes = (search.quotes || []).filter(x => x.symbol).map(x => x.symbol);
    candidates.push(
      ...quotes.filter(s => s.endsWith('.AS')),
      ...quotes.filter(s => s.endsWith('.DE')),
      ...quotes.filter(s => !s.endsWith('.AS') && !s.endsWith('.DE')),
    );
  } catch {
    // search is optioneel; ticker-kandidaten blijven over
  }
  return [...new Set(candidates)];
}

// Probeert kandidaten tot er één met een EUR-koers gevonden is. Is er alleen
// een notering in een andere valuta (bijv. USD op de LSE), dan wordt die met
// de actuele wisselkoers naar EUR omgerekend.
async function fetchEurQuote(asset) {
  let fallback = null;
  for (const symbol of await yahooSymbolCandidates(asset)) {
    try {
      const chart = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`);
      const meta = chart.chart?.result?.[0]?.meta;
      if (meta?.regularMarketPrice == null) continue;
      if (meta.currency === 'EUR') return { symbol, price: meta.regularMarketPrice };
      if (!fallback) fallback = { symbol, price: meta.regularMarketPrice, currency: meta.currency };
    } catch {
      // volgende kandidaat proberen
    }
  }

  if (fallback) {
    let { price, currency } = fallback;
    if (currency === 'GBp') { price /= 100; currency = 'GBP'; } // LSE noteert in pence
    try {
      const fx = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${currency}EUR%3DX?range=1d&interval=1d`);
      const rate = fx.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (rate) return { symbol: fallback.symbol, price: price * rate };
    } catch {
      // geen wisselkoers beschikbaar → koers uit de CSV-import blijft staan
    }
  }
  return null;
}

async function refreshWorkspacePrices(ws) {
  const assets = readJSON(ws, 'assets.json');
  if (!Array.isArray(assets) || assets.length === 0) return { updated: 0, skipped: 0 };
  const now = new Date().toISOString();
  let updated = 0, skipped = 0;

  const isCrypto = a => !a.assetClass || a.assetClass === 'crypto';
  const cryptoIds = [...new Set(assets.filter(isCrypto).map(a => a.type))];
  let cryptoPrices = {};
  if (cryptoIds.length > 0) {
    try {
      cryptoPrices = await fetchJson(`https://api.coingecko.com/api/v3/simple/price?ids=${cryptoIds.join(',')}&vs_currencies=eur`);
    } catch (err) {
      console.warn(`[prices] CoinGecko: ${err.message}`);
    }
  }

  for (const asset of assets) {
    if (isCrypto(asset)) {
      const price = cryptoPrices[asset.type]?.eur;
      if (price != null) {
        asset.currentPrice = price;
        asset.lastPrice = price;
        asset.lastUpdated = now;
        updated++;
      } else skipped++;
    } else if (asset.assetClass === 'etf') {
      try {
        // Alleen EUR-noteringen overnemen; anders blijft de DeGiro-importprijs staan
        const quote = await fetchEurQuote(asset);
        if (quote) {
          asset.currentPrice = quote.price;
          asset.lastPrice = quote.price;
          asset.lastUpdated = now;
          asset.yahooSymbol = quote.symbol;
          updated++;
        } else skipped++;
      } catch (err) {
        console.warn(`[prices] ${asset.symbol}: ${err.message}`);
        skipped++;
      }
    }
    // broker-cash: nominale waarde, geen koers nodig
  }

  if (updated > 0) writeJSON(ws, 'assets.json', assets);
  return { updated, skipped };
}

// ── Koershistorie (voor performance-grafieken) ───────────────────────────────
// Proxy naar Yahoo Finance (omzeilt CORS in de browser) met in-memory cache.
const HISTORY_RANGES = { '1y': '1d', '3y': '1wk', '5y': '1wk', 'max': '1mo' };
const HISTORY_TTL_MS = 6 * 60 * 60 * 1000;
const historyCache = new Map(); // `${q}|${range}` → { ts, data }

async function fetchChartSeries(symbol, range) {
  const interval = HISTORY_RANGES[range];
  const chart = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`);
  const result = chart.chart?.result?.[0];
  const meta = result?.meta;
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  if (!meta?.regularMarketPrice || timestamps.length === 0) return null;
  const points = timestamps
    .map((t, i) => [new Date(t * 1000).toISOString().slice(0, 10), closes[i]])
    .filter(([, c]) => c != null)
    .map(([d, c]) => [d, Math.round(c * 10000) / 10000]);
  if (points.length < 2) return null;
  return { symbol, currency: meta.currency, points };
}

async function getPriceHistory(q, range) {
  const key = `${q}|${range}`;
  const cached = historyCache.get(key);
  if (cached && Date.now() - cached.ts < HISTORY_TTL_MS) return cached.data;

  // Zelfde resolutie als de koersverversing: EUR-notering heeft voorkeur,
  // anders de eerst gevonden notering (voor rendement in % maakt de valuta
  // van de notering weinig uit).
  const pseudoAsset = { symbol: q, isin: ISIN_RE.test(q.toUpperCase()) ? q.toUpperCase() : undefined, type: q };
  let fallback = null;
  let data = null;
  for (const symbol of await yahooSymbolCandidates(pseudoAsset)) {
    try {
      const series = await fetchChartSeries(symbol, range);
      if (!series) continue;
      if (series.currency === 'EUR') { data = series; break; }
      if (!fallback) fallback = series;
    } catch {
      // volgende kandidaat
    }
  }
  data = data ?? fallback;
  if (data) {
    historyCache.set(key, { ts: Date.now(), data });
    if (historyCache.size > 200) historyCache.delete(historyCache.keys().next().value);
  }
  return data;
}

async function refreshAllPrices() {
  for (const ws of WORKSPACES) {
    try {
      const r = await refreshWorkspacePrices(ws);
      if (r.updated > 0) console.log(`[prices] ${ws}: ${r.updated} koers(en) bijgewerkt`);
    } catch (err) {
      console.warn(`[prices] ${ws}: ${err.message}`);
    }
  }
}

if (PRICE_REFRESH_MIN > 0) {
  setTimeout(refreshAllPrices, 15_000);
  setInterval(refreshAllPrices, PRICE_REFRESH_MIN * 60 * 1000);
}

// --- Handler factory ---
function makeHandlers(ws) {
  return {
    // Transactions
    getTransactions: (_, res) => res.json(readJSON(ws, 'transactions.json')),
    postTransactions: (req, res) => {
      const existing = readJSON(ws, 'transactions.json');
      const existingIds = new Set(existing.map(t => t.id));
      const newTx = (req.body || []).filter(t => !existingIds.has(t.id));
      const merged = [...existing, ...newTx];
      writeJSON(ws, 'transactions.json', merged);
      res.json({ imported: newTx.length, total: merged.length });
    },
    putTransactions: (req, res) => {
      const txs = req.body || [];
      writeJSON(ws, 'transactions.json', txs);
      res.json({ total: txs.length });
    },
    putTransactionById: (req, res) => {
      const txs = readJSON(ws, 'transactions.json');
      const idx = txs.findIndex(t => t.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: 'Not found' });
      txs[idx] = { ...txs[idx], ...req.body };
      writeJSON(ws, 'transactions.json', txs);
      res.json(txs[idx]);
    },
    // Accounts
    getAccounts: (_, res) => res.json(readJSON(ws, 'accounts.json')),
    postAccounts: (req, res) => {
      const accounts = req.body || [];
      writeJSON(ws, 'accounts.json', accounts);
      res.json(accounts);
    },
    // Rules
    getRules: (_, res) => res.json(readJSON(ws, 'rules.json')),
    postRules: (req, res) => {
      const rules = req.body || [];
      writeJSON(ws, 'rules.json', rules);
      res.json(rules);
    },
    // Settings
    getSettings: (_, res) => res.json(readJSON(ws, 'settings.json')),
    postSettings: (req, res) => {
      const settings = req.body || {};
      writeJSON(ws, 'settings.json', settings);
      res.json(settings);
    },
    // Assets
    getAssets: (_, res) => res.json(readJSON(ws, 'assets.json')),
    postAssets: (req, res) => {
      const assets = req.body || [];
      writeJSON(ws, 'assets.json', assets);
      res.json(assets);
    },
    refreshAssetPrices: async (_, res) => {
      try {
        const result = await refreshWorkspacePrices(ws);
        res.json({ ...result, assets: readJSON(ws, 'assets.json') });
      } catch (err) {
        res.status(502).json({ error: err.message });
      }
    },
    // Properties
    getProperties: (_, res) => res.json(readJSON(ws, 'properties.json')),
    postProperties: (req, res) => {
      const properties = req.body || [];
      writeJSON(ws, 'properties.json', properties);
      res.json(properties);
    },
    // Budgets
    getBudgets: (_, res) => res.json(readJSON(ws, 'budgets.json')),
    postBudgets: (req, res) => {
      const budgets = req.body || [];
      writeJSON(ws, 'budgets.json', budgets);
      res.json(budgets);
    },
    // Scenarios
    getScenarios: (_, res) => res.json(readJSON(ws, 'scenarios.json')),
    postScenarios: (req, res) => {
      const scenarios = req.body || [];
      writeJSON(ws, 'scenarios.json', scenarios);
      res.json(scenarios);
    },
  };
}

function registerRoutes(app, prefix, h) {
  app.get(`${prefix}/transactions`, h.getTransactions);
  app.post(`${prefix}/transactions`, h.postTransactions);
  app.put(`${prefix}/transactions`, h.putTransactions);
  app.put(`${prefix}/transactions/:id`, h.putTransactionById);

  app.get(`${prefix}/accounts`, h.getAccounts);
  app.post(`${prefix}/accounts`, h.postAccounts);

  app.get(`${prefix}/rules`, h.getRules);
  app.post(`${prefix}/rules`, h.postRules);

  app.get(`${prefix}/settings`, h.getSettings);
  app.post(`${prefix}/settings`, h.postSettings);

  app.get(`${prefix}/assets`, h.getAssets);
  app.post(`${prefix}/assets`, h.postAssets);
  app.post(`${prefix}/assets/refresh`, h.refreshAssetPrices);

  app.get(`${prefix}/properties`, h.getProperties);
  app.post(`${prefix}/properties`, h.postProperties);

  app.get(`${prefix}/budgets`, h.getBudgets);
  app.post(`${prefix}/budgets`, h.postBudgets);

  app.get(`${prefix}/scenarios`, h.getScenarios);
  app.post(`${prefix}/scenarios`, h.postScenarios);
}

// Workspace-scoped routes
for (const ws of WORKSPACES) registerRoutes(app, `/api/ws/${ws}`, makeHandlers(ws));

// Legacy routes: alias to 'personal' workspace so the existing MCP server (read-only)
// keeps working without changes. Same underlying files as /api/ws/personal/*.
registerRoutes(app, '/api', makeHandlers('personal'));

// --- Workspace metadata ---
app.get('/api/workspaces', (_, res) => {
  const descriptors = WORKSPACES.map(slug => {
    const def = WORKSPACE_DEFS.find(w => w.slug === slug);
    return def ?? { slug, label: slug, accent: '#64748b' };
  });
  res.json(descriptors);
});

// --- Koershistorie (marktdata, niet workspace-gebonden) ---
app.get('/api/prices/history', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const range = (req.query.range || '3y').toString();
  if (!q) return res.status(400).json({ error: 'q (ISIN/ticker) is verplicht' });
  if (!HISTORY_RANGES[range]) return res.status(400).json({ error: `range moet een van ${Object.keys(HISTORY_RANGES).join(', ')} zijn` });
  try {
    const data = await getPriceHistory(q, range);
    if (!data) return res.status(404).json({ error: `Geen koershistorie gevonden voor "${q}"` });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// --- Health (referenced by docker-compose healthcheck) ---
app.get('/api/health', (_, res) => res.json({ ok: true }));

// --- Serve static files ---
if (existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));
  app.use((req, res, next) => { if (req.method === 'GET' && !req.path.startsWith('/api')) res.sendFile(join(STATIC_DIR, 'index.html')); else next(); });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Vault Finance API running on port ${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`Workspaces: ${WORKSPACES.join(', ')}`);
});
