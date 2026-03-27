import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { storage } from '../lib/storage';
import {
  getNetWorth,
  getMonthlyNetWorthTrend,
  getMonthlyIncomeExpense,
  getCategorySpending,
  getAccountBreakdown,
  getTopExpenses,
  getLastMonthEnd,
  filterByPeriod,
} from '../lib/analytics';
import { formatCurrency, getPeriodDates } from '../lib/utils';
import type { PeriodFilter } from '../types';

const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: 'this-month', label: 'Deze maand' },
  { value: 'last-month', label: 'Vorige maand' },
  { value: 'quarter', label: 'Kwartaal' },
  { value: 'year', label: 'Jaar' },
  { value: 'custom', label: 'Aangepast' },
];

const PIE_COLORS = [
  '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444',
  '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#84cc16',
];

function GlassCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="glass-card" style={{ padding: '1.25rem', ...style }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
      {children}
    </p>
  );
}

const tooltipStyle = {
  background: 'rgba(15, 10, 30, 0.95)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10,
  color: 'white',
  fontSize: 13,
};

export default function Dashboard() {
  const [period, setPeriod] = useState<PeriodFilter>('this-month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [btcPrice, setBtcPrice] = useState<number | null>(null);

  const transactions = storage.getTransactions();
  const accounts = storage.getAccounts();
  const assets = storage.getAssets();
  const btcAsset = assets.find(a => a.type === 'bitcoin');
  const btcAmount = btcAsset?.amount ?? 0;
  const effectiveBtcPrice = btcPrice ?? btcAsset?.lastPrice ?? 0;

  const { start, end } = getPeriodDates(period, customStart, customEnd);
  const periodTxs = filterByPeriod(transactions, start, end);

  const currentNetWorth = getNetWorth(accounts, transactions, effectiveBtcPrice, btcAmount);
  const lastMonthNetWorth = getNetWorth(accounts, transactions, effectiveBtcPrice, btcAmount, getLastMonthEnd());
  const netWorthDelta = currentNetWorth - lastMonthNetWorth;
  const netWorthDeltaPct = lastMonthNetWorth !== 0 ? (netWorthDelta / Math.abs(lastMonthNetWorth)) * 100 : 0;

  const trendData = getMonthlyNetWorthTrend(accounts, transactions, effectiveBtcPrice, btcAmount);
  const incomeExpenseData = getMonthlyIncomeExpense(periodTxs, start, end);
  const categoryData = getCategorySpending(periodTxs);
  const accountData = getAccountBreakdown(accounts, transactions);
  const top5 = getTopExpenses(periodTxs);

  useEffect(() => {
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur')
      .then(r => r.json())
      .then((data: { bitcoin: { eur: number } }) => {
        setBtcPrice(data.bitcoin.eur);
        if (btcAsset) {
          const updated = assets.map(a =>
            a.type === 'bitcoin' ? { ...a, lastPrice: data.bitcoin.eur, lastUpdated: new Date().toISOString() } : a,
          );
          storage.setAssets(updated);
        }
      })
      .catch(() => {});
  }, []);

  const isEmpty = accounts.length === 0 && transactions.length === 0;

  if (isEmpty) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <GlassCard style={{ textAlign: 'center', padding: '3rem 2rem', maxWidth: 400 }}>
          <div style={{ fontSize: 48, marginBottom: '1rem' }}>📊</div>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', fontWeight: 600 }}>Geen data</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
            Importeer je bankafschriften via de Import pagina om te beginnen.
          </p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Net worth header */}
      <GlassCard>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <SectionTitle>Netto vermogen</SectionTitle>
            <div style={{ fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              <span className="accent-gradient-text">{formatCurrency(currentNetWorth)}</span>
            </div>
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <span style={{ color: netWorthDelta >= 0 ? '#10b981' : '#ef4444', fontSize: '0.9rem', fontWeight: 600 }}>
                {netWorthDelta >= 0 ? '+' : ''}{formatCurrency(netWorthDelta)}
              </span>
              <span style={{ color: netWorthDelta >= 0 ? '#10b981' : '#ef4444', fontSize: '0.85rem' }}>
                ({netWorthDeltaPct >= 0 ? '+' : ''}{netWorthDeltaPct.toFixed(1)}%)
              </span>
              <span style={{ color: '#64748b', fontSize: '0.8rem' }}>t.o.v. vorige maand</span>
            </div>
            {btcAmount > 0 && (
              <div style={{ marginTop: '0.5rem', color: '#94a3b8', fontSize: '0.8rem' }}>
                ₿ {btcAmount} × {effectiveBtcPrice > 0 ? formatCurrency(effectiveBtcPrice) : '—'} = {formatCurrency(btcAmount * effectiveBtcPrice)}
              </div>
            )}
          </div>

          {/* Period filter */}
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                style={{
                  padding: '0.375rem 0.875rem',
                  borderRadius: '2rem',
                  border: period === opt.value ? '1px solid rgba(139,92,246,0.6)' : '1px solid rgba(255,255,255,0.1)',
                  background: period === opt.value ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
                  color: period === opt.value ? 'white' : '#94a3b8',
                  fontSize: '0.8rem',
                  fontWeight: period === opt.value ? 600 : 400,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.15s',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {period === 'custom' && (
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <input
              type="date"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              className="glass-input"
              style={{ padding: '0.375rem 0.625rem', fontSize: '0.85rem' }}
            />
            <span style={{ color: '#64748b' }}>—</span>
            <input
              type="date"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
              className="glass-input"
              style={{ padding: '0.375rem 0.625rem', fontSize: '0.85rem' }}
            />
          </div>
        )}
      </GlassCard>

      {/* Charts row 1: Net worth trend + Account breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.25rem' }}>
        <GlassCard>
          <SectionTitle>Vermogensontwikkeling (12 maanden)</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="netWorthGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#8b5cf6" />
                  <stop offset="100%" stopColor="#06b6d4" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `€${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value) => [formatCurrency(Number(value)), 'Vermogen']}
              />
              <Line
                type="monotone"
                dataKey="netWorth"
                stroke="url(#netWorthGradient)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: '#8b5cf6' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </GlassCard>

        <GlassCard>
          <SectionTitle>Rekeningen</SectionTitle>
          {accountData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={accountData.filter(a => a.balance > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    dataKey="balance"
                    nameKey="name"
                  >
                    {accountData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                {accountData.map((acc, i) => (
                  <div key={acc.iban} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>{acc.name}</span>
                    </div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: acc.balance >= 0 ? '#10b981' : '#ef4444' }}>
                      {formatCurrency(acc.balance)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Geen rekeningen</p>
          )}
        </GlassCard>
      </div>

      {/* Charts row 2: Income/Expense + Category spending */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        <GlassCard>
          <SectionTitle>Inkomsten vs. Uitgaven</SectionTitle>
          {incomeExpenseData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={incomeExpenseData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => `€${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => [
                    formatCurrency(Number(value)),
                    name === 'income' ? 'Inkomsten' : 'Uitgaven',
                  ]}
                />
                <Legend
                  formatter={name => name === 'income' ? 'Inkomsten' : 'Uitgaven'}
                  wrapperStyle={{ fontSize: 12, color: '#94a3b8' }}
                />
                <Bar dataKey="income" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={40} />
                <Bar dataKey="expenses" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Geen data voor deze periode</p>
          )}
        </GlassCard>

        <GlassCard>
          <SectionTitle>Uitgaven per categorie</SectionTitle>
          {categoryData.length > 0 ? (
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div style={{ flex: '0 0 160px' }}>
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie
                      data={categoryData.slice(0, 8)}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={72}
                      dataKey="amount"
                      nameKey="category"
                    >
                      {categoryData.slice(0, 8).map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {categoryData.slice(0, 8).map((cat, i) => (
                  <div key={cat.category} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                      <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>{cat.category}</span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600 }}>
                      {formatCurrency(cat.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Geen uitgaven in deze periode</p>
          )}
        </GlassCard>
      </div>

      {/* Top 5 expenses */}
      <GlassCard>
        <SectionTitle>Top 5 uitgaven deze periode</SectionTitle>
        {top5.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {top5.map(tx => (
              <div
                key={tx.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.625rem 0.875rem',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: '0.5rem',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{tx.name || tx.counterparty}</span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{tx.date} · {tx.category}</span>
                </div>
                <span style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.95rem' }}>
                  {formatCurrency(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Geen uitgaven in deze periode</p>
        )}
      </GlassCard>
    </div>
  );
}
