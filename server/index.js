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
];
const WORKSPACES = (process.env.VAULT_WORKSPACES
  ? process.env.VAULT_WORKSPACES.split(',').map(s => s.trim())
  : WORKSPACE_DEFS.map(w => w.slug));

const DATA_FILES = ['transactions.json', 'accounts.json', 'rules.json', 'assets.json', 'budgets.json', 'properties.json', 'settings.json'];

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

  app.get(`${prefix}/properties`, h.getProperties);
  app.post(`${prefix}/properties`, h.postProperties);

  app.get(`${prefix}/budgets`, h.getBudgets);
  app.post(`${prefix}/budgets`, h.postBudgets);
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
