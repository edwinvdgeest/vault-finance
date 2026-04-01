import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', 'data');
const PORT = process.env.PORT || 3001;
const STATIC_DIR = join(__dirname, '..', 'dist');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- JSON helpers ---
function readJSON(file) {
  const path = join(DATA_DIR, file);
  if (!existsSync(path)) return file.includes('settings') ? {} : [];
  try { return JSON.parse(readFileSync(path, 'utf-8')); }
  catch { return file.includes('settings') ? {} : []; }
}

function writeJSON(file, data) {
  writeFileSync(join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

// --- Transactions ---
app.get('/api/transactions', (_, res) => res.json(readJSON('transactions.json')));

app.post('/api/transactions', (req, res) => {
  const existing = readJSON('transactions.json');
  const existingIds = new Set(existing.map(t => t.id));
  const newTx = (req.body || []).filter(t => !existingIds.has(t.id));
  const merged = [...existing, ...newTx];
  writeJSON('transactions.json', merged);
  res.json({ imported: newTx.length, total: merged.length });
});

app.put('/api/transactions', (req, res) => {
  const txs = req.body || [];
  writeJSON('transactions.json', txs);
  res.json({ total: txs.length });
});

app.put('/api/transactions/:id', (req, res) => {
  const txs = readJSON('transactions.json');
  const idx = txs.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  txs[idx] = { ...txs[idx], ...req.body };
  writeJSON('transactions.json', txs);
  res.json(txs[idx]);
});

// --- Accounts ---
app.get('/api/accounts', (_, res) => res.json(readJSON('accounts.json')));

app.post('/api/accounts', (req, res) => {
  const accounts = req.body || [];
  writeJSON('accounts.json', accounts);
  res.json(accounts);
});

// --- Rules ---
app.get('/api/rules', (_, res) => res.json(readJSON('rules.json')));

app.post('/api/rules', (req, res) => {
  const rules = req.body || [];
  writeJSON('rules.json', rules);
  res.json(rules);
});

// --- Settings ---
app.get('/api/settings', (_, res) => res.json(readJSON('settings.json')));

app.post('/api/settings', (req, res) => {
  const settings = req.body || {};
  writeJSON('settings.json', settings);
  res.json(settings);
});

// --- Assets ---
app.get('/api/assets', (_, res) => res.json(readJSON('assets.json')));

app.post('/api/assets', (req, res) => {
  const assets = req.body || [];
  writeJSON('assets.json', assets);
  res.json(assets);
});

// --- Serve static files ---
if (existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));
  app.use((req, res, next) => { if (req.method === 'GET' && !req.path.startsWith('/api')) res.sendFile(join(STATIC_DIR, 'index.html')); else next(); });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Vault Finance API running on port ${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});

