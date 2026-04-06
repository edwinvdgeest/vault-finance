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

const API = process.env.VAULT_API_URL || 'http://localhost:3001';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${API}/api${path}`);
  if (!res.ok) throw new Error(`API ${path}: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

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
  'Financieel overzicht: rekeningsaldi, netto vermogen, inkomen/uitgaven deze en vorige maand',
  {},
  async () => {
    const [txs, accounts, properties] = await Promise.all([
      api<Transaction[]>('/transactions'),
      api<Account[]>('/accounts'),
      api<Property[]>('/properties'),
    ]);

    // Account balances
    const balances = accounts.map(a => ({
      name: a.name, iban: a.iban, bank: a.bank,
      balance: getAccountBalance(a, txs),
    }));
    const totalCash = balances.reduce((s, b) => s + b.balance, 0);

    // Property equity
    let propertyValue = 0, propertyDebt = 0;
    for (const p of properties) {
      propertyValue += p.currentValue;
      propertyDebt += p.mortgage?.balance ?? 0;
    }
    const propertyEquity = propertyValue - propertyDebt;

    const netWorth = totalCash + propertyEquity;

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

    lines.push(
      '### Netto Vermogen',
      `**${fmt(netWorth)}**` + (properties.length > 0 ? ` (cash ${fmt(totalCash)} + woning ${fmt(propertyEquity)})` : ''),
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
  },
  async ({ from, to, category, search, min_amount, max_amount, account, label, limit }) => {
    let txs = await api<Transaction[]>('/transactions');

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
      lines.push(`**${t.date}** | ${fmt(t.amount)} | ${t.name} | ${tags.join(', ')}${t.note ? ` | 📝 ${t.note}` : ''}`);
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
  },
  async ({ from, to, compare }) => {
    const txs = await api<Transaction[]>('/transactions');
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
  },
  async ({ months }) => {
    const txs = await api<Transaction[]>('/transactions');
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
  },
  async ({ from, to, limit }) => {
    const txs = await api<Transaction[]>('/transactions');
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
  'Detecteer terugkerende uitgaven (abonnementen, vaste lasten)',
  {
    min_occurrences: z.number().optional().describe('Minimaal aantal keer voorgekomen (default: 3)'),
  },
  async ({ min_occurrences }) => {
    const txs = await api<Transaction[]>('/transactions');
    const minOcc = min_occurrences ?? 3;

    // Group by (name, approximate amount) — use rounded amount as key
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

    const recurring = [...map.entries()]
      .filter(([, v]) => v.amounts.length >= minOcc)
      .map(([name, { amounts, dates, category }]) => {
        const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
        // Check if amounts are consistent (low variance = likely subscription)
        const variance = amounts.reduce((s, a) => s + Math.pow(a - avg, 2), 0) / amounts.length;
        const cv = Math.sqrt(variance) / avg; // coefficient of variation
        dates.sort();
        return { name, avg, count: amounts.length, category, cv, lastDate: dates[dates.length - 1] };
      })
      .filter(r => r.cv < 0.3) // consistent amounts only
      .sort((a, b) => b.avg * b.count - a.avg * a.count); // sort by total impact

    const lines = [
      `## Terugkerende uitgaven (≥${minOcc}x, consistent bedrag)`,
      '',
      ...recurring.map(r => {
        const monthly = `~${fmt(r.avg)}/keer`;
        const yearly = fmt(r.avg * 12);
        return `- **${r.name}** — ${monthly} (${r.count}x, ${r.category}) — ~${yearly}/jaar — laatst: ${r.lastDate}`;
      }),
      '',
      `**Totaal maandelijks vaste lasten**: ~${fmt(recurring.reduce((s, r) => s + r.avg, 0))}`,
    ];

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

// ── Tool: vault_tax_overview ─────────────────────────────────────────────────

server.tool(
  'vault_tax_overview',
  'Belastingoverzicht: betaald en ontvangen per jaar en type (Belastingdienst, Gemeente, etc.)',
  {
    year: z.number().optional().describe('Specifiek jaar (default: alle jaren)'),
  },
  async ({ year }) => {
    const txs = await api<Transaction[]>('/transactions');

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
  },
  async ({ month }) => {
    const [txs, budgets] = await Promise.all([
      api<Transaction[]>('/transactions'),
      api<Budget[]>('/budgets'),
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

// ── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(err => {
  console.error('MCP server failed:', err);
  process.exit(1);
});
