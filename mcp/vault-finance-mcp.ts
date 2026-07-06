#!/usr/bin/env npx tsx
/**
 * Vault Finance MCP Server
 *
 * Stdio-based MCP server that exposes financial data and insights from the
 * Vault Finance Express API. Designed for use with Claude Code / Claude Desktop.
 *
 * Environment:
 *   VAULT_API_URL — Base URL of the Vault Finance API (default: http://localhost:3001)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  scorePortfolio, suggestFunds, THEME_LABELS, LEVEL_LABELS,
} from '../src/lib/sustainability';
import type { SustainTheme, SustainLevel } from '../src/lib/sustainability';
import type { Asset as LibAsset } from '../src/types';

const API = process.env.VAULT_API_URL || 'http://localhost:3001';
const DEFAULT_WORKSPACE = 'personal';

// ── Helpers ──────────────────────────────────────────────────────────────────

// Default workspace via het legacy /api-pad (alias voor 'personal'), zodat de
// MCP-server ook werkt tegen een oudere API-deploy zonder /api/ws-routes.
async function api<T>(path: string, workspace?: string): Promise<T> {
  const prefix = apiPrefix(workspace);
  const res = await fetch(`${API}${prefix}${path}`);
  if (!res.ok) throw new Error(`API ${prefix}${path}: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

function apiPrefix(workspace?: string): string {
  const ws = workspace || DEFAULT_WORKSPACE;
  return ws === DEFAULT_WORKSPACE ? '/api' : `/api/ws/${ws}`;
}

async function apiSend<T>(method: 'PUT' | 'POST', path: string, body: unknown, workspace?: string): Promise<T> {
  const prefix = apiPrefix(workspace);
  const res = await fetch(`${API}${prefix}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${method} ${prefix}${path}: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

const workspaceParam = z.string().optional()
  .describe("Workspace: 'personal' (privé, default), 'holding' (Unleashing Energy) of 'ouders'");

interface Transaction {
  id: string; date: string; account: string; accountName: string;
  amount: number; counterparty: string; name: string; description: string;
  category: string; originalDescription: string;
  labels?: string[]; note?: string; isInternal?: boolean;
}
interface Account {
  id: string; name: string; iban: string; bank: string;
  startingBalance: number; startingDate: string;
}
interface Budget { category: string; monthlyLimit: number; }
interface Asset {
  type: string; symbol: string; name: string;
  amount: number; currentPrice: number; lastUpdated?: string;
  assetClass?: 'crypto' | 'etf' | 'broker-cash'; broker?: string;
}
interface Property {
  id: string; label: string; currentValue: number; valuationDate: string;
  annualGrowth: number;
  mortgage?: { balance: number; interestRate: number; monthsRemaining: number; type: string; };
}

function fmt(n: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n);
}

function toYM(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  return `${months[Number(m) - 1]} ${y}`;
}

function getAccountBalance(acc: Account, txs: Transaction[], asOf?: Date): number {
  const filtered = txs.filter(tx => {
    if (tx.account !== acc.iban) return false;
    if (asOf) return new Date(tx.date + 'T00:00:00') <= asOf;
    return true;
  });
  return acc.startingBalance + filtered.reduce((s, t) => s + t.amount, 0);
}

function annuityPayment(balance: number, rate: number, months: number): number {
  if (balance <= 0 || months <= 0) return 0;
  const r = rate / 12;
  if (r === 0) return balance / months;
  return (balance * r) / (1 - Math.pow(1 + r, -months));
}

// ── Server ───────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'vault-finance',
  version: '1.0.0',
});

// ── Tool: vault_summary ──────────────────────────────────────────────────────

server.tool(
  'vault_summary',
  'Financieel overzicht: rekeningsaldi, beleggingen, netto vermogen, inkomen/uitgaven deze en vorige maand',
  {
    workspace: workspaceParam,
  },
  async ({ workspace }) => {
    const [txs, accounts, properties, assets] = await Promise.all([
      api<Transaction[]>('/transactions', workspace),
      api<Account[]>('/accounts', workspace),
      api<Property[]>('/properties', workspace),
      api<Asset[]>('/assets', workspace),
    ]);

    // Account balances
    const balances = accounts.map(a => ({
      name: a.name, iban: a.iban, bank: a.bank,
      balance: getAccountBalance(a, txs),
    }));
    const totalCash = balances.reduce((s, b) => s + b.balance, 0);

    // Assets (crypto + broker holdings)
    const assetValue = (a: Asset) => a.amount * a.currentPrice;
    const cryptoAssets = assets.filter(a => !a.assetClass || a.assetClass === 'crypto');
    const brokerAssets = assets.filter(a => a.assetClass === 'etf' || a.assetClass === 'broker-cash');
    const totalCrypto = cryptoAssets.reduce((s, a) => s + assetValue(a), 0);
    const totalBroker = brokerAssets.reduce((s, a) => s + assetValue(a), 0);
    const totalAssets = totalCrypto + totalBroker;

    // Property equity
    let propertyValue = 0, propertyDebt = 0;
    for (const p of properties) {
      propertyValue += p.currentValue;
      propertyDebt += p.mortgage?.balance ?? 0;
    }
    const propertyEquity = propertyValue - propertyDebt;

    const netWorth = totalCash + totalAssets + propertyEquity;

    // Data freshness
    const lastTxDate = txs.reduce((max, t) => (t.date > max ? t.date : max), '');
    const daysStale = lastTxDate
      ? Math.floor((Date.now() - new Date(lastTxDate + 'T00:00:00').getTime()) / 86400000)
      : null;

    // Monthly income/expense (this month + last month)
    const now = new Date();
    const thisMonth = toYM(now);
    const lastMonth = toYM(new Date(now.getFullYear(), now.getMonth() - 1, 1));

    function monthStats(ym: string) {
      const monthTxs = txs.filter(t => t.date.startsWith(ym) && !t.isInternal);
      const income = monthTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
      const expenses = monthTxs.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);
      return { income, expenses, net: income + expenses, count: monthTxs.length };
    }

    const thisStats = monthStats(thisMonth);
    const lastStats = monthStats(lastMonth);

    const lines = [
      '## Financieel Overzicht',
      '',
      '### Rekeningen',
      ...balances.map(b => `- **${b.name}** (${b.bank.toUpperCase()} ${b.iban.slice(-4)}): ${fmt(b.balance)}`),
      `- **Totaal cash**: ${fmt(totalCash)}`,
      '',
    ];

    if (assets.length > 0) {
      lines.push('### Beleggingen');
      for (const a of brokerAssets) {
        lines.push(`- **${a.name}** (${a.broker ?? 'broker'}): ${fmt(assetValue(a))}`);
      }
      for (const a of cryptoAssets) {
        lines.push(`- **${a.name}** (${a.amount} ${a.symbol}): ${fmt(assetValue(a))}`);
      }
      lines.push(`- **Totaal beleggingen**: ${fmt(totalAssets)}`);
      const oldestPrice = assets.reduce((min, a) => {
        if (!a.lastUpdated) return min;
        return !min || a.lastUpdated < min ? a.lastUpdated : min;
      }, '');
      if (oldestPrice) {
        const priceAge = Math.floor((Date.now() - new Date(oldestPrice).getTime()) / 86400000);
        if (priceAge > 7) lines.push(`  ⚠️ Koersen laatst bijgewerkt ${oldestPrice.slice(0, 10)} (${priceAge} dagen geleden)`);
      }
      lines.push('');
    }

    if (properties.length > 0) {
      lines.push('### Woning');
      for (const p of properties) {
        lines.push(`- **${p.label}**: waarde ${fmt(p.currentValue)}`);
        if (p.mortgage) {
          lines.push(`  - Hypotheek: ${fmt(p.mortgage.balance)} resterend, ${(p.mortgage.interestRate * 100).toFixed(1)}% rente`);
          lines.push(`  - Maandlast: ${fmt(annuityPayment(p.mortgage.balance, p.mortgage.interestRate, p.mortgage.monthsRemaining))}`);
        }
      }
      lines.push(`- **Overwaarde**: ${fmt(propertyEquity)}`);
      lines.push('');
    }

    const parts = [`cash ${fmt(totalCash)}`];
    if (totalAssets > 0) parts.push(`beleggingen ${fmt(totalAssets)}`);
    if (properties.length > 0) parts.push(`woning ${fmt(propertyEquity)}`);

    lines.push(
      '### Netto Vermogen',
      `**${fmt(netWorth)}** (${parts.join(' + ')})`,
      '',
      `### ${monthLabel(thisMonth)} (lopend)`,
      `- Inkomen: ${fmt(thisStats.income)}`,
      `- Uitgaven: ${fmt(thisStats.expenses)}`,
      `- Netto: ${fmt(thisStats.net)}`,
      `- ${thisStats.count} transacties`,
      '',
      `### ${monthLabel(lastMonth)}`,
      `- Inkomen: ${fmt(lastStats.income)}`,
      `- Uitgaven: ${fmt(lastStats.expenses)}`,
      `- Netto: ${fmt(lastStats.net)}`,
      `- ${lastStats.count} transacties`,
    );

    if (lastTxDate) {
      lines.push('', `_Laatste transactie: ${lastTxDate}_`);
      if (daysStale !== null && daysStale > 14) {
        lines.push(`⚠️ **Data is ${daysStale} dagen oud** — recente maanden zijn onvolledig. Importeer nieuwe bankafschriften via de Import-pagina.`);
      }
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

// ── Tool: vault_transactions ─────────────────────────────────────────────────

server.tool(
  'vault_transactions',
  'Zoek en filter transacties op datum, categorie, bedrag, naam of beschrijving',
  {
    from: z.string().optional().describe('Startdatum (YYYY-MM-DD)'),
    to: z.string().optional().describe('Einddatum (YYYY-MM-DD)'),
    category: z.string().optional().describe('Filter op categorie (bijv. "Boodschappen")'),
    search: z.string().optional().describe('Zoektekst in naam/beschrijving/counterparty'),
    min_amount: z.number().optional().describe('Minimumbedrag (negatief voor uitgaven)'),
    max_amount: z.number().optional().describe('Maximumbedrag'),
    account: z.string().optional().describe('Filter op IBAN of rekeningnaam'),
    label: z.string().optional().describe('Filter op label'),
    limit: z.number().optional().describe('Max aantal resultaten (default 50)'),
    show_ids: z.boolean().optional().describe('Toon transactie-ids (nodig voor vault_update_transaction)'),
    workspace: workspaceParam,
  },
  async ({ from, to, category, search, min_amount, max_amount, account, label, limit, show_ids, workspace }) => {
    let txs = await api<Transaction[]>('/transactions', workspace);

    // Apply filters
    if (from) txs = txs.filter(t => t.date >= from);
    if (to) txs = txs.filter(t => t.date <= to);
    if (category) {
      const cat = category.toLowerCase();
      txs = txs.filter(t => t.category.toLowerCase() === cat);
    }
    if (search) {
      const q = search.toLowerCase();
      txs = txs.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.counterparty.toLowerCase().includes(q) ||
        (t.note?.toLowerCase().includes(q)),
      );
    }
    if (min_amount !== undefined) txs = txs.filter(t => t.amount >= min_amount);
    if (max_amount !== undefined) txs = txs.filter(t => t.amount <= max_amount);
    if (account) {
      const acc = account.toLowerCase();
      txs = txs.filter(t => t.account.toLowerCase().includes(acc) || t.accountName?.toLowerCase().includes(acc));
    }
    if (label) {
      const lbl = label.toLowerCase();
      txs = txs.filter(t => t.labels?.some(l => l.toLowerCase() === lbl));
    }

    // Sort newest first, limit
    txs.sort((a, b) => b.date.localeCompare(a.date));
    const max = limit ?? 50;
    const total = txs.length;
    txs = txs.slice(0, max);

    const lines = [`${total} transacties gevonden${total > max ? ` (eerste ${max} getoond)` : ''}`, ''];

    for (const t of txs) {
      const tags = [t.category];
      if (t.isInternal) tags.push('intern');
      if (t.labels?.length) tags.push(...t.labels);
      lines.push(`**${t.date}** | ${fmt(t.amount)} | ${t.name} | ${tags.join(', ')}${t.note ? ` | 📝 ${t.note}` : ''}${show_ids ? `\n  id: \`${t.id}\`` : ''}`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

// ── Tool: vault_spending ─────────────────────────────────────────────────────

server.tool(
  'vault_spending',
  'Uitgaven per categorie voor een periode, met optionele vergelijking met vorige periode',
  {
    from: z.string().optional().describe('Startdatum (YYYY-MM-DD), default: begin deze maand'),
    to: z.string().optional().describe('Einddatum (YYYY-MM-DD), default: vandaag'),
    compare: z.boolean().optional().describe('Vergelijk met vorige gelijke periode (default: true)'),
    workspace: workspaceParam,
  },
  async ({ from, to, compare, workspace }) => {
    const txs = await api<Transaction[]>('/transactions', workspace);
    const now = new Date();
    const startStr = from ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const endStr = to ?? now.toISOString().slice(0, 10);

    const periodTxs = txs.filter(t => t.date >= startStr && t.date <= endStr && !t.isInternal && t.amount < 0);

    // Group by category
    const catMap = new Map<string, { total: number; count: number }>();
    for (const t of periodTxs) {
      const entry = catMap.get(t.category) ?? { total: 0, count: 0 };
      entry.total += Math.abs(t.amount);
      entry.count++;
      catMap.set(t.category, entry);
    }

    const sorted = [...catMap.entries()].sort((a, b) => b[1].total - a[1].total);
    const grandTotal = sorted.reduce((s, [, v]) => s + v.total, 0);

    // Optional: compare with previous period of same length
    let prevMap: Map<string, number> | undefined;
    if (compare !== false) {
      const start = new Date(startStr + 'T00:00:00');
      const end = new Date(endStr + 'T00:00:00');
      const days = Math.round((end.getTime() - start.getTime()) / 86400000);
      const prevEnd = new Date(start.getTime() - 86400000);
      const prevStart = new Date(prevEnd.getTime() - days * 86400000);
      const prevStartStr = prevStart.toISOString().slice(0, 10);
      const prevEndStr = prevEnd.toISOString().slice(0, 10);

      const prevTxs = txs.filter(t => t.date >= prevStartStr && t.date <= prevEndStr && !t.isInternal && t.amount < 0);
      prevMap = new Map<string, number>();
      for (const t of prevTxs) {
        prevMap.set(t.category, (prevMap.get(t.category) ?? 0) + Math.abs(t.amount));
      }
    }

    const lines = [
      `## Uitgaven per categorie`,
      `Periode: ${startStr} t/m ${endStr}`,
      `Totaal: **${fmt(grandTotal)}**`,
      '',
    ];

    for (const [cat, { total, count }] of sorted) {
      const pct = ((total / grandTotal) * 100).toFixed(1);
      let line = `- **${cat}**: ${fmt(total)} (${pct}%, ${count}x)`;
      if (prevMap) {
        const prev = prevMap.get(cat) ?? 0;
        if (prev > 0) {
          const delta = ((total - prev) / prev * 100).toFixed(0);
          line += ` — vorige periode: ${fmt(prev)} (${Number(delta) > 0 ? '+' : ''}${delta}%)`;
        } else {
          line += ' — *nieuw*';
        }
      }
      lines.push(line);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

// ── Tool: vault_trends ───────────────────────────────────────────────────────

server.tool(
  'vault_trends',
  'Maandelijks overzicht van inkomen, uitgaven en spaarquote over de afgelopen N maanden',
  {
    months: z.number().optional().describe('Aantal maanden terug (default: 12)'),
    workspace: workspaceParam,
  },
  async ({ months, workspace }) => {
    const txs = await api<Transaction[]>('/transactions', workspace);
    const n = months ?? 12;
    const now = new Date();

    const data: { month: string; label: string; income: number; expenses: number; net: number }[] = [];

    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = toYM(d);
      const monthTxs = txs.filter(t => t.date.startsWith(ym) && !t.isInternal);
      const income = monthTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
      const expenses = monthTxs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
      data.push({ month: ym, label: monthLabel(ym), income, expenses, net: income - expenses });
    }

    const avgIncome = data.reduce((s, d) => s + d.income, 0) / data.length;
    const avgExpenses = data.reduce((s, d) => s + d.expenses, 0) / data.length;
    const avgSavings = avgIncome - avgExpenses;
    const savingsRate = avgIncome > 0 ? (avgSavings / avgIncome * 100).toFixed(1) : '0';

    const lines = [
      `## Maandelijkse trend (${n} maanden)`,
      '',
      '| Maand | Inkomen | Uitgaven | Netto |',
      '|-------|---------|----------|-------|',
      ...data.map(d => `| ${d.label} | ${fmt(d.income)} | ${fmt(d.expenses)} | ${fmt(d.net)} |`),
      '',
      `**Gemiddeld**: inkomen ${fmt(avgIncome)}, uitgaven ${fmt(avgExpenses)}, netto ${fmt(avgSavings)}`,
      `**Spaarquote**: ${savingsRate}%`,
    ];

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

// ── Tool: vault_top_merchants ────────────────────────────────────────────────

server.tool(
  'vault_top_merchants',
  'Top uitgaven per winkelier/bedrijf voor een periode',
  {
    from: z.string().optional().describe('Startdatum (YYYY-MM-DD)'),
    to: z.string().optional().describe('Einddatum (YYYY-MM-DD)'),
    limit: z.number().optional().describe('Aantal resultaten (default: 20)'),
    workspace: workspaceParam,
  },
  async ({ from, to, limit, workspace }) => {
    const txs = await api<Transaction[]>('/transactions', workspace);
    const now = new Date();
    const startStr = from ?? `${now.getFullYear()}-01-01`;
    const endStr = to ?? now.toISOString().slice(0, 10);

    const filtered = txs.filter(t => t.date >= startStr && t.date <= endStr && !t.isInternal && t.amount < 0);

    const map = new Map<string, { total: number; count: number; category: string }>();
    for (const t of filtered) {
      const key = t.name || t.counterparty || 'Onbekend';
      const entry = map.get(key) ?? { total: 0, count: 0, category: t.category };
      entry.total += Math.abs(t.amount);
      entry.count++;
      map.set(key, entry);
    }

    const sorted = [...map.entries()].sort((a, b) => b[1].total - a[1].total);
    const max = limit ?? 20;
    const grandTotal = sorted.reduce((s, [, v]) => s + v.total, 0);

    const lines = [
      `## Top merchants (${startStr} t/m ${endStr})`,
      '',
      ...sorted.slice(0, max).map(([name, { total, count, category }], i) => {
        const pct = ((total / grandTotal) * 100).toFixed(1);
        return `${i + 1}. **${name}** — ${fmt(total)} (${count}x, ${pct}%) [${category}]`;
      }),
    ];

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

// ── Tool: vault_recurring ────────────────────────────────────────────────────

server.tool(
  'vault_recurring',
  'Detecteer actieve terugkerende uitgaven (abonnementen, vaste lasten) met interval en maandbedrag',
  {
    min_occurrences: z.number().optional().describe('Minimaal aantal keer voorgekomen (default: 3)'),
    include_inactive: z.boolean().optional().describe('Toon ook gestopte abonnementen (default: false)'),
    workspace: workspaceParam,
  },
  async ({ min_occurrences, include_inactive, workspace }) => {
    const txs = await api<Transaction[]>('/transactions', workspace);
    const minOcc = min_occurrences ?? 3;

    const filtered = txs.filter(t => t.amount < 0 && !t.isInternal);
    const map = new Map<string, { amounts: number[]; dates: string[]; category: string }>();

    for (const t of filtered) {
      const key = t.name || t.counterparty;
      if (!key) continue;
      const entry = map.get(key) ?? { amounts: [], dates: [], category: t.category };
      entry.amounts.push(Math.abs(t.amount));
      entry.dates.push(t.date);
      map.set(key, entry);
    }

    // "Actief" wordt beoordeeld t.o.v. de laatste transactie in de dataset,
    // zodat een verouderde import niet alles als gestopt markeert.
    const refDate = filtered.reduce((max, t) => (t.date > max ? t.date : max), '');
    const refTime = refDate ? new Date(refDate + 'T00:00:00').getTime() : Date.now();

    function median(nums: number[]): number {
      const s = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
    }

    function intervalLabel(days: number): string {
      if (days <= 10) return 'wekelijks';
      if (days <= 45) return 'maandelijks';
      if (days <= 130) return 'per kwartaal';
      if (days <= 250) return 'halfjaarlijks';
      return 'jaarlijks';
    }

    const analyzed = [...map.entries()]
      .filter(([, v]) => v.amounts.length >= minOcc)
      .map(([name, { amounts, dates, category }]) => {
        const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
        const variance = amounts.reduce((s, a) => s + Math.pow(a - avg, 2), 0) / amounts.length;
        const cv = Math.sqrt(variance) / avg; // coefficient of variation
        dates.sort();
        const times = dates.map(d => new Date(d + 'T00:00:00').getTime());
        const gaps: number[] = [];
        for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]) / 86400000);
        const interval = median(gaps);
        const daysSinceLast = (refTime - times[times.length - 1]) / 86400000;
        const monthly = interval > 0 ? avg * (30.44 / interval) : avg;
        const active = daysSinceLast <= Math.max(2 * interval, 45);
        return {
          name, avg, count: amounts.length, category, cv,
          lastDate: dates[dates.length - 1], interval, monthly, active,
        };
      })
      // consistent bedrag én een plausibel herhaalpatroon (wekelijks t/m jaarlijks);
      // frequenter dan ~6 dagen is los koopgedrag (boodschappen), geen vaste last
      .filter(r => r.cv < 0.3 && r.interval >= 6 && r.interval <= 400);

    const active = analyzed.filter(r => r.active).sort((a, b) => b.monthly - a.monthly);
    const inactive = analyzed.filter(r => !r.active).sort((a, b) => b.monthly - a.monthly);
    const totalMonthly = active.reduce((s, r) => s + r.monthly, 0);

    const fmtLine = (r: typeof analyzed[number]) =>
      `- **${r.name}** — ${fmt(r.avg)}/keer, ${intervalLabel(r.interval)} (~elke ${Math.round(r.interval)}d) — ~${fmt(r.monthly)}/mnd — ${r.count}x, ${r.category} — laatst: ${r.lastDate}`;

    const lines = [
      `## Actieve terugkerende uitgaven (≥${minOcc}x, consistent bedrag)`,
      refDate ? `_Peildatum: ${refDate} (laatste transactie in dataset)_` : '',
      '',
      ...active.map(fmtLine),
      '',
      `**Totaal actieve vaste lasten**: ~${fmt(totalMonthly)}/maand (~${fmt(totalMonthly * 12)}/jaar)`,
    ];

    if (include_inactive && inactive.length > 0) {
      lines.push('', `## Gestopte abonnementen (${inactive.length})`, '', ...inactive.map(fmtLine));
    } else if (inactive.length > 0) {
      lines.push('', `_${inactive.length} gestopte abonnementen verborgen (gebruik include_inactive: true)_`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

// ── Tool: vault_tax_overview ─────────────────────────────────────────────────

server.tool(
  'vault_tax_overview',
  'Belastingoverzicht: betaald en ontvangen per jaar en type (Belastingdienst, Gemeente, etc.)',
  {
    year: z.number().optional().describe('Specifiek jaar (default: alle jaren)'),
    workspace: workspaceParam,
  },
  async ({ year, workspace }) => {
    const txs = await api<Transaction[]>('/transactions', workspace);

    const taxTxs = txs.filter(t => t.category === 'Belastingen');

    // Classify tax type from name/description
    const taxTypes = ['belastingdienst', 'gemeente', 'waterschap', 'cak', 'duo', 'cjib'];
    function classifyTax(t: Transaction): string {
      const text = `${t.name} ${t.description}`.toLowerCase();
      for (const type of taxTypes) {
        if (text.includes(type)) return type.charAt(0).toUpperCase() + type.slice(1);
      }
      return 'Overig';
    }

    // Group by year → type
    const yearMap = new Map<number, Map<string, { paid: number; refunded: number; count: number }>>();
    for (const t of taxTxs) {
      const y = parseInt(t.date.slice(0, 4));
      if (year && y !== year) continue;
      if (!yearMap.has(y)) yearMap.set(y, new Map());
      const typeMap = yearMap.get(y)!;
      const type = classifyTax(t);
      const entry = typeMap.get(type) ?? { paid: 0, refunded: 0, count: 0 };
      if (t.amount < 0) entry.paid += Math.abs(t.amount);
      else entry.refunded += t.amount;
      entry.count++;
      typeMap.set(type, entry);
    }

    const sortedYears = [...yearMap.keys()].sort((a, b) => b - a);

    const lines = ['## Belastingoverzicht', ''];
    for (const y of sortedYears) {
      const types = [...yearMap.get(y)!.entries()].sort((a, b) => b[1].paid - a[1].paid);
      const totalPaid = types.reduce((s, [, v]) => s + v.paid, 0);
      const totalRefund = types.reduce((s, [, v]) => s + v.refunded, 0);

      lines.push(`### ${y} — netto ${fmt(totalPaid - totalRefund)} betaald`);
      for (const [type, { paid, refunded, count }] of types) {
        lines.push(`- **${type}**: ${fmt(paid)} betaald${refunded > 0 ? `, ${fmt(refunded)} terug` : ''} (${count}x)`);
      }
      lines.push('');
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

// ── Tool: vault_budget_status ────────────────────────────────────────────────

server.tool(
  'vault_budget_status',
  'Budget voortgang: hoeveel is besteed t.o.v. het maandbudget per categorie',
  {
    month: z.string().optional().describe('Maand (YYYY-MM), default: huidige maand'),
    workspace: workspaceParam,
  },
  async ({ month, workspace }) => {
    const [txs, budgets] = await Promise.all([
      api<Transaction[]>('/transactions', workspace),
      api<Budget[]>('/budgets', workspace),
    ]);

    if (budgets.length === 0) {
      return { content: [{ type: 'text', text: 'Geen budgetten ingesteld. Stel budgetten in via Instellingen.' }] };
    }

    const ym = month ?? toYM(new Date());
    const monthTxs = txs.filter(t => t.date.startsWith(ym) && !t.isInternal && t.amount < 0);

    // Spending per category
    const spending = new Map<string, number>();
    for (const t of monthTxs) {
      spending.set(t.category, (spending.get(t.category) ?? 0) + Math.abs(t.amount));
    }

    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const monthProgress = dayOfMonth / daysInMonth;

    const lines = [
      `## Budget status ${monthLabel(ym)}`,
      `(${dayOfMonth}/${daysInMonth} dagen = ${(monthProgress * 100).toFixed(0)}% van de maand)`,
      '',
    ];

    for (const b of budgets.sort((a, z) => z.monthlyLimit - a.monthlyLimit)) {
      const spent = spending.get(b.category) ?? 0;
      const pct = b.monthlyLimit > 0 ? (spent / b.monthlyLimit * 100) : 0;
      const remaining = Math.max(0, b.monthlyLimit - spent);
      const status = pct > 100 ? '🔴' : pct > monthProgress * 100 ? '🟡' : '🟢';
      lines.push(`${status} **${b.category}**: ${fmt(spent)} / ${fmt(b.monthlyLimit)} (${pct.toFixed(0)}%) — ${fmt(remaining)} over`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

// ── Tool: vault_box3 ─────────────────────────────────────────────────────────

server.tool(
  'vault_box3',
  'Box 3-voorbereiding: banktegoeden op de peildatum (1 januari), gereconstrueerd uit de transactiehistorie, plus beleggingen',
  {
    year: z.number().optional().describe('Belastingjaar (default: huidig jaar); peildatum is 1 januari van dit jaar'),
    workspace: workspaceParam,
  },
  async ({ year, workspace }) => {
    const [txs, accounts, assets] = await Promise.all([
      api<Transaction[]>('/transactions', workspace),
      api<Account[]>('/accounts', workspace),
      api<Asset[]>('/assets', workspace),
    ]);

    const y = year ?? new Date().getFullYear();
    const peildatum = `${y}-01-01`;
    const asOf = new Date(`${y - 1}-12-31T00:00:00`);

    const lines = [
      `## Box 3 vermogen — peildatum ${peildatum}`,
      '',
      '### Banktegoeden',
    ];

    // Historie die pas ná de peildatum begint → saldo mogelijk onvolledig
    const firstTxDate = new Map<string, string>();
    for (const t of txs) {
      const cur = firstTxDate.get(t.account);
      if (!cur || t.date < cur) firstTxDate.set(t.account, t.date);
    }

    let totalCash = 0;
    for (const acc of accounts) {
      const balance = getAccountBalance(acc, txs, asOf);
      totalCash += balance;
      const firstTx = firstTxDate.get(acc.iban);
      const reliable = (firstTx !== undefined && firstTx <= peildatum) || acc.startingDate <= peildatum;
      const warning = reliable ? '' : ' ⚠️ *transactiehistorie begint ná de peildatum — saldo mogelijk onvolledig*';
      lines.push(`- **${acc.name}** (${acc.iban.slice(-4)}): ${fmt(balance)}${warning}`);
    }
    lines.push(`- **Totaal banktegoeden**: ${fmt(totalCash)}`);

    if (assets.length > 0) {
      const assetValue = (a: Asset) => a.amount * a.currentPrice;
      const totalAssets = assets.reduce((s, a) => s + assetValue(a), 0);
      lines.push(
        '',
        '### Beleggingen & crypto (indicatief)',
        ...assets.map(a => `- **${a.name}**: ${fmt(assetValue(a))}`),
        `- **Totaal**: ${fmt(totalAssets)}`,
        '',
        '_Beleggingen tonen huidige aantallen × huidige koers. Voor de aangifte geldt de werkelijke waarde op de peildatum — controleer die in je broker/wallet-jaaroverzicht._',
      );
    }

    lines.push(
      '',
      '_De eigen woning (hoofdverblijf) valt in box 1, niet in box 3. Banktegoeden zijn gereconstrueerd uit transacties t/m 31 december ' + (y - 1) + '; controleer met de jaaroverzichten van de bank._',
    );

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

// ── Tool: vault_update_transaction ───────────────────────────────────────────

server.tool(
  'vault_update_transaction',
  'Werk een transactie bij: categorie, notitie en/of labels. Gebruik vault_transactions met show_ids voor het transactie-id.',
  {
    id: z.string().describe('Transactie-id (via vault_transactions met show_ids: true)'),
    category: z.string().optional().describe('Nieuwe categorie (bijv. "Boodschappen")'),
    note: z.string().optional().describe('Notitie bij de transactie (lege string verwijdert de notitie)'),
    labels: z.array(z.string()).optional().describe('Labels (vervangt bestaande labels)'),
    workspace: workspaceParam,
  },
  async ({ id, category, note, labels, workspace }) => {
    const patch: Record<string, unknown> = {};
    if (category !== undefined) patch.category = category;
    if (note !== undefined) patch.note = note;
    if (labels !== undefined) patch.labels = labels;
    if (Object.keys(patch).length === 0) {
      return { content: [{ type: 'text', text: 'Geen wijzigingen opgegeven: geef category, note en/of labels mee.' }] };
    }

    const updated = await apiSend<Transaction>('PUT', `/transactions/${encodeURIComponent(id)}`, patch, workspace);

    const tags = [updated.category, ...(updated.labels ?? [])];
    return {
      content: [{
        type: 'text',
        text: `Transactie bijgewerkt:\n**${updated.date}** | ${fmt(updated.amount)} | ${updated.name} | ${tags.join(', ')}${updated.note ? ` | 📝 ${updated.note}` : ''}`,
      }],
    };
  },
);

// ── Tool: vault_refresh_prices ───────────────────────────────────────────────

server.tool(
  'vault_refresh_prices',
  'Ververs crypto- en ETF-koersen van de beleggingen (CoinGecko/Yahoo Finance) op de server',
  {
    workspace: workspaceParam,
  },
  async ({ workspace }) => {
    const result = await apiSend<{ updated: number; skipped: number; assets: Asset[] }>(
      'POST', '/assets/refresh', undefined, workspace,
    );
    const lines = [
      `Koersen ververst: ${result.updated} bijgewerkt, ${result.skipped} overgeslagen.`,
      '',
      ...result.assets.map(a => `- **${a.name}**: ${fmt(a.amount * a.currentPrice)} (koers ${fmt(a.currentPrice)}, ${a.lastUpdated?.slice(0, 10) ?? 'onbekend'})`),
    ];
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

// ── Tool: vault_sustainability ───────────────────────────────────────────────

server.tool(
  'vault_sustainability',
  'Duurzaamheidsprofiel van de beleggingsportefeuille (SFDR artikel 6/8/9, thema\'s zoals water en hernieuwbare energie) plus fondssuggesties per thema',
  {
    theme: z.enum(['water', 'hernieuwbare-energie', 'breed-duurzaam', 'impact']).optional()
      .describe('Filter fondssuggesties op thema (default: alle thema\'s)'),
    workspace: workspaceParam,
  },
  async ({ theme, workspace }) => {
    const assets = await api<LibAsset[]>('/assets', workspace);
    const score = scorePortfolio(assets);

    const lines = ['## Duurzaamheid van de portefeuille', ''];

    if (score.holdings.length === 0) {
      lines.push('_Geen beleggingen gevonden. Importeer een DeGiro Portfolio.csv of voeg holdings toe via Instellingen._');
    } else {
      lines.push(
        `- **Duurzaam belegd** (licht duurzaam of beter): ${score.pctSustainable}% van ${fmt(score.totalValue)}`,
        `- **Streng duurzaam of impact** (SRI/Paris-Aligned, themafondsen, art. 9): ${score.pctStrict}%`,
        `- **Impact / donkergroen** (art. 9): ${score.pctImpact}%`,
        '',
        '### Verdeling',
        ...([3, 2, 1, 0] as SustainLevel[])
          .filter(l => score.byLevel[l] > 0)
          .map(l => `- ${LEVEL_LABELS[l]}: ${fmt(score.byLevel[l])}`),
      );
      if (score.cashValue > 0) lines.push(`- Broker-cash (niet meegewogen): ${fmt(score.cashValue)}`);

      if (score.byTheme.length > 0) {
        lines.push('', '### Per thema', ...score.byTheme.map(t =>
          `- ${THEME_LABELS[t.theme]}: ${fmt(t.value)}`));
      }

      lines.push('', '### Holdings');
      for (const h of score.holdings) {
        const a = h.assessment;
        const themes = a.themes.length > 0
          ? ` — ${a.themes.map(t => THEME_LABELS[t as SustainTheme] ?? t).join(', ')}`
          : '';
        const why = a.signals.length > 0 ? ` _(${a.signals.join('; ')}${a.note ? `; 📝 ${a.note}` : ''})_` : '';
        const todo = a.source === 'geen'
          ? ' *(niet herkend — onderzoek dit fonds en leg de classificatie vast met vault_classify_asset)*'
          : '';
        lines.push(`- **${h.asset.name}**: ${fmt(h.value)} — ${LEVEL_LABELS[a.level]}${a.sfdr ? ` (SFDR art. ${a.sfdr})` : ''}${themes}${why}${todo}`);
      }
    }

    const suggestions = suggestFunds(theme, assets);
    if (suggestions.length > 0) {
      lines.push('', `### Fondssuggesties${theme ? ` — ${THEME_LABELS[theme]}` : ''}`);
      for (const f of suggestions) {
        const sfdr = f.sfdr ? `SFDR art. ${f.sfdr}` : 'SFDR: zie aanbieder';
        const ter = f.ter !== undefined ? `, kosten ${(f.ter * 100).toFixed(2)}%/jr` : '';
        lines.push(`- **${f.name}**${f.ticker ? ` (${f.ticker})` : ''} — ${f.themes.map(t => THEME_LABELS[t]).join('/')} — ${sfdr}${ter}`, `  ${f.description} ${f.url}`);
      }
    }

    lines.push(
      '',
      '_Geen beleggingsadvies. SFDR-classificaties zijn indicatief; controleer het prospectus. Vergelijk rendementen o.a. via de Consumentenbond-test van duurzame beleggingsfondsen._',
    );

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

// ── Tool: vault_classify_asset ───────────────────────────────────────────────

server.tool(
  'vault_classify_asset',
  'Leg de duurzaamheidsclassificatie van een holding vast (SFDR, thema\'s, bronnotitie). Gebruik dit na eigen onderzoek (prospectus/aanbieder) voor fondsen die de app niet herkent.',
  {
    asset: z.string().describe('ISIN, ticker of (deel van de) naam van de holding'),
    sfdr: z.union([z.literal(6), z.literal(8), z.literal(9)]).optional()
      .describe('SFDR-artikel: 9 (donkergroen), 8 (lichtgroen) of 6 (grijs)'),
    themes: z.array(z.enum(['water', 'hernieuwbare-energie', 'breed-duurzaam', 'impact'])).optional()
      .describe('Duurzame thema\'s van het fonds'),
    note: z.string().optional().describe('Bron/toelichting, bijv. "SFDR-status prospectus aanbieder, jul 2026"'),
    clear: z.boolean().optional().describe('true = verwijder de handmatige classificatie'),
    workspace: workspaceParam,
  },
  async ({ asset, sfdr, themes, note, clear, workspace }) => {
    const assets = await api<LibAsset[]>('/assets', workspace);
    const q = asset.trim().toUpperCase();

    const matches = assets.filter(a => {
      const keys = [a.isin, a.type, a.symbol].filter((k): k is string => !!k).map(k => k.toUpperCase());
      return keys.includes(q) || a.name.toUpperCase().includes(q);
    });
    if (matches.length === 0) {
      return { content: [{ type: 'text', text: `Geen holding gevonden voor "${asset}". Beschikbaar: ${assets.map(a => a.name).join(', ')}` }] };
    }
    if (matches.length > 1) {
      return { content: [{ type: 'text', text: `"${asset}" is niet eenduidig: ${matches.map(a => `${a.name} (${a.isin ?? a.symbol})`).join(', ')}. Gebruik de ISIN.` }] };
    }

    const target = matches[0];
    const updated = assets.map(a => {
      if (a !== target) return a;
      if (clear) return { ...a, sustainability: undefined };
      return { ...a, sustainability: { ...a.sustainability, sfdr, themes, note } };
    });
    await apiSend<LibAsset[]>('POST', '/assets', updated, workspace);

    if (clear) {
      return { content: [{ type: 'text', text: `Handmatige classificatie van **${target.name}** verwijderd.` }] };
    }
    const parts = [
      sfdr !== undefined ? `SFDR art. ${sfdr}` : null,
      themes?.length ? `thema's: ${themes.map(t => THEME_LABELS[t]).join(', ')}` : null,
      note ? `notitie: ${note}` : null,
    ].filter(Boolean);
    return {
      content: [{
        type: 'text',
        text: `Classificatie van **${target.name}** opgeslagen (${parts.join(' — ')}). De Duurzaam-pagina en vault_sustainability gebruiken dit direct.`,
      }],
    };
  },
);

// ── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(err => {
  console.error('MCP server failed:', err);
  process.exit(1);
});
