import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  getPeriodSummary,
  getRecurringExpenses,
  getCategoryTrend,
  getLabelSpending,
  getBudgetProgress,
  getTopMerchants,
  getCashflowSankey,
} from '../lib/analytics';
import { formatCurrency, getPeriodDates } from '../lib/utils';
import MiniSparkline from '../components/MiniSparkline';
import CashflowSankey from '../components/CashflowSankey';
import type { Asset, PeriodFilter } from '../types';

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

// All CoinGecko IDs to fetch prices for
const COINGECKO_IDS = 'bitcoin,bitcoin-cash,bitcoin-cash-sv,ecash,apenft,tether';

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

function assetSymbol(a: Asset): string {
  return a.symbol || (a.type === 'bitcoin' ? 'BTC' : a.type.toUpperCase().replace(/-/g, ''));
}

function assetName(a: Asset): string {
  return a.name || (a.type === 'bitcoin' ? 'Bitcoin' : a.type);
}

function assetPrice(a: Asset, prices: Record<string, number>): number {
  return prices[a.type] ?? a.currentPrice ?? a.lastPrice ?? 0;
}

function computeTotalCryptoValue(assets: Asset[], prices: Record<string, number>): number {
  return assets.reduce((sum, a) => sum + a.amount * assetPrice(a, prices), 0);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodFilter>('year');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [cryptoPrices, setCryptoPrices] = useState<Record<string, number>>({});

  const transactions = storage.getTransactions();
  const accounts = storage.getAccounts();
  const assets = storage.getAssets();

  const { start, end, label: periodLabel } = getPeriodDates(period, customStart, customEnd, periodOffset);
  const periodTxs = filterByPeriod(transactions, start, end);

  const totalCryptoValue = computeTotalCryptoValue(assets, cryptoPrices);
  const currentNetWorth = getNetWorth(accounts, transactions, totalCryptoValue);
  const lastMonthTotalCrypto = computeTotalCryptoValue(assets, cryptoPrices);
  const lastMonthNetWorth = getNetWorth(accounts, transactions, lastMonthTotalCrypto, getLastMonthEnd());
  const netWorthDelta = currentNetWorth - lastMonthNetWorth;
  const netWorthDeltaPct = lastMonthNetWorth !== 0 ? (netWorthDelta / Math.abs(lastMonthNetWorth)) * 100 : 0;

  const trendData = getMonthlyNetWorthTrend(accounts, transactions, totalCryptoValue);
  const incomeExpenseData = getMonthlyIncomeExpense(periodTxs, start, end);
  const categoryData = getCategorySpending(periodTxs);
  const accountData = getAccountBreakdown(accounts, transactions);
  const top5 = getTopExpenses(periodTxs);
  const periodSummary = getPeriodSummary(periodTxs);
  const recurring = getRecurringExpenses(transactions);
  const categoryTrends = getCategoryTrend(transactions);
  const labelSpending = getLabelSpending(periodTxs);
  const budgets = storage.getBudgets();
  const budgetProgress = getBudgetProgress(periodTxs, budgets, start, end);
  const topMerchants = getTopMerchants(periodTxs);
  const cashflowSankey = getCashflowSankey(periodTxs);

  useEffect(() => {
    fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${COINGECKO_IDS}&vs_currencies=eur`)
      .then(r => r.json())
      .then((data: Record<string, { eur: number }>) => {
        const priceMap: Record<string, number> = {};
        for (const [id, val] of Object.entries(data)) {
          priceMap[id] = val.eur;
        }
        setCryptoPrices(priceMap);
        if (assets.length > 0) {
          const now = new Date().toISOString();
          const updated = assets.map(a => {
            const price = priceMap[a.type];
            if (price == null) return a;
            return { ...a, currentPrice: price, lastPrice: price, lastUpdated: now };
          });
          storage.setAssets(updated);
        }
      })
      .catch(() => {});
  }, []);

  const isEmpty = accounts.length === 0 && transactions.length === 0 && assets.length === 0;

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
            <div className="net-worth-amount" style={{ fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
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
            {totalCryptoValue > 0 && (
              <div style={{ marginTop: '0.5rem', color: '#94a3b8', fontSize: '0.8rem' }}>
                Crypto: <span style={{ color: '#f59e0b' }}>{formatCurrency(totalCryptoValue)}</span>
              </div>
            )}
          </div>

          {/* Period filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
              {PERIOD_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setPeriod(opt.value); setPeriodOffset(0); }}
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
            {period !== 'custom' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  onClick={() => setPeriodOffset(o => o - 1)}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem', padding: '0.2rem 0.5rem', fontFamily: 'inherit', lineHeight: 1 }}
                >‹</button>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8', minWidth: 140, textAlign: 'center' }}>
                  {periodLabel}
                </span>
                <button
                  onClick={() => setPeriodOffset(o => Math.min(o + 1, 0))}
                  disabled={periodOffset === 0}
                  style={{ background: 'none', border: 'none', color: periodOffset === 0 ? '#334155' : '#94a3b8', cursor: periodOffset === 0 ? 'default' : 'pointer', fontSize: '1rem', padding: '0.2rem 0.5rem', fontFamily: 'inherit', lineHeight: 1 }}
                >›</button>
              </div>
            )}
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

      {/* Cashflow KPI's */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }} className="grid-kpis">
        <GlassCard>
          <SectionTitle>Inkomsten</SectionTitle>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>
            {formatCurrency(periodSummary.income)}
          </div>
        </GlassCard>
        <GlassCard>
          <SectionTitle>Uitgaven</SectionTitle>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444' }}>
            {formatCurrency(periodSummary.expenses)}
          </div>
        </GlassCard>
        <GlassCard>
          <SectionTitle>Cashflow</SectionTitle>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: periodSummary.cashflow >= 0 ? '#10b981' : '#ef4444' }}>
              {periodSummary.cashflow >= 0 ? '+' : ''}{formatCurrency(periodSummary.cashflow)}
            </span>
            {periodSummary.savingsRate !== 0 && (
              <span style={{
                fontSize: '0.8rem', fontWeight: 600,
                color: periodSummary.savingsRate >= 0 ? '#10b981' : '#ef4444',
                background: periodSummary.savingsRate >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                padding: '0.15rem 0.5rem', borderRadius: '1rem',
              }}>
                {periodSummary.savingsRate >= 0 ? '+' : ''}{periodSummary.savingsRate}%
              </span>
            )}
          </div>
        </GlassCard>
      </div>

      {/* Crypto Portfolio */}
      {assets.length > 0 && (
        <GlassCard>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <SectionTitle>Crypto portfolio</SectionTitle>
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#f59e0b' }}>
              {formatCurrency(totalCryptoValue)}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {assets.map(asset => {
              const price = assetPrice(asset, cryptoPrices);
              const value = asset.amount * price;
              const sym = assetSymbol(asset);
              const nm = assetName(asset);
              return (
                <div
                  key={asset.type}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '3rem 1fr auto auto',
                    gap: '0.75rem',
                    alignItems: 'center',
                    padding: '0.5rem 0.75rem',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: '#c4b5fd',
                    background: 'rgba(139,92,246,0.15)',
                    padding: '0.2rem 0.35rem',
                    borderRadius: '0.25rem',
                    textAlign: 'center',
                    letterSpacing: '0.04em',
                  }}>
                    {sym}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{nm}</span>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      {asset.amount.toLocaleString('nl-NL', { maximumSignificantDigits: 8 })} × {price > 0 ? formatCurrency(price) : '—'}
                    </span>
                  </div>
                  <span style={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: value > 0.01 ? '#10b981' : '#475569',
                    textAlign: 'right',
                  }}>
                    {formatCurrency(value)}
                  </span>
                  {asset.purchasePrice != null && asset.purchasePrice > 0 && price > 0 && (
                    <span style={{
                      fontSize: '0.72rem',
                      color: price >= asset.purchasePrice ? '#10b981' : '#ef4444',
                      textAlign: 'right',
                    }}>
                      {price >= asset.purchasePrice ? '+' : ''}{(((price - asset.purchasePrice) / asset.purchasePrice) * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* Charts row 1: Net worth trend + Account breakdown */}
      <div className="grid-main">
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
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} style={{ fill: PIE_COLORS[i % PIE_COLORS.length] }} />
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
      <div className="grid-halves">
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
                <Bar dataKey="income" fill="#8b5cf6" style={{ fill: '#8b5cf6' }} radius={[3, 3, 0, 0]} maxBarSize={40} />
                <Bar dataKey="expenses" fill="#06b6d4" style={{ fill: '#06b6d4' }} radius={[3, 3, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Geen data voor deze periode</p>
          )}
        </GlassCard>

        <GlassCard>
          <SectionTitle>Uitgaven per categorie</SectionTitle>
          {categoryData.length > 0 ? (
            <div className="category-chart-inner" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
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
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} style={{ fill: PIE_COLORS[i % PIE_COLORS.length] }} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {categoryData.slice(0, 8).map((cat, i) => {
                  const trend = categoryTrends.get(cat.category);
                  return (
                    <div key={cat.category} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, minWidth: 0 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                        <span style={{ fontSize: '0.75rem', color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.category}</span>
                      </div>
                      {trend && <MiniSparkline data={trend.map(t => t.amount)} color={PIE_COLORS[i % PIE_COLORS.length]} />}
                      <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {formatCurrency(cat.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Geen uitgaven in deze periode</p>
          )}
        </GlassCard>
      </div>

      {/* Cashflow Sankey */}
      {cashflowSankey.links.length > 0 && (
        <GlassCard>
          <SectionTitle>Cashflow</SectionTitle>
          <CashflowSankey data={cashflowSankey} />
        </GlassCard>
      )}

      {/* Budget vs. Actual */}
      {budgetProgress.length > 0 && (
        <GlassCard>
          <SectionTitle>Budget</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {budgetProgress.map(b => {
              const color = b.percentage > 100 ? '#ef4444' : b.percentage > 80 ? '#f59e0b' : '#10b981';
              const barWidth = Math.min(b.percentage, 100);
              return (
                <div key={b.category}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>{b.category}</span>
                    <span style={{ fontSize: '0.75rem', color }}>
                      {formatCurrency(b.spent)} / {formatCurrency(b.limit)}
                      <span style={{ marginLeft: '0.4rem', fontWeight: 600 }}>({b.percentage}%)</span>
                    </span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${barWidth}%`, background: color, borderRadius: 3, transition: 'width 0.3s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* Top merchants */}
      {topMerchants.length > 0 && (
        <GlassCard>
          <SectionTitle>Top tegenpartijen</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {topMerchants.map((m, i) => (
              <div
                key={m.name}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem',
                  padding: '0.4rem 0.625rem',
                  background: 'rgba(255,255,255,0.03)', borderRadius: '0.375rem',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.7rem', color: '#475569', fontWeight: 600, minWidth: '1.2rem' }}>{i + 1}</span>
                  <span style={{ fontSize: '0.8rem', color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                </div>
                <MiniSparkline data={m.trend} color={PIE_COLORS[i % PIE_COLORS.length]} />
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#ef4444' }}>{formatCurrency(m.total)}</div>
                  <div style={{ fontSize: '0.65rem', color: '#64748b' }}>{m.count}×</div>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Top 5 expenses */}
      <GlassCard>
        <SectionTitle>Top 5 uitgaven deze periode</SectionTitle>
        {top5.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {top5.map(tx => (
              <div
                key={tx.id}
                onClick={() => navigate(`/transactions?start=${tx.date}&end=${tx.date}`)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.625rem 0.875rem',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: '0.5rem',
                  border: '1px solid rgba(255,255,255,0.06)',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
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

      {/* Recurring expenses + Label spending */}
      <div className="grid-halves">
        {/* Vaste lasten */}
        {recurring.length > 0 && (
          <GlassCard>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <SectionTitle>Vaste lasten</SectionTitle>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ef4444' }}>
                {formatCurrency(recurring.reduce((s, r) => s + r.avgAmount, 0))}/mnd
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {recurring.slice(0, 10).map(r => (
                <div
                  key={r.name}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.4rem 0.625rem',
                    background: 'rgba(255,255,255,0.03)', borderRadius: '0.375rem',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{r.category}</div>
                  </div>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#ef4444', whiteSpace: 'nowrap' }}>
                    {formatCurrency(r.avgAmount)}/mnd
                  </span>
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* Label spending */}
        {labelSpending.length > 0 && (
          <GlassCard>
            <SectionTitle>Uitgaven per label</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {labelSpending.map(ls => (
                <div
                  key={ls.label}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.4rem 0.625rem',
                    background: 'rgba(255,255,255,0.03)', borderRadius: '0.375rem',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{
                      fontSize: '0.72rem', color: '#fbbf24',
                      background: 'rgba(245,158,11,0.12)', padding: '0.1rem 0.4rem',
                      borderRadius: '0.5rem', border: '1px solid rgba(245,158,11,0.25)',
                    }}>
                      {ls.label}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{ls.count} transacties</span>
                  </div>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: ls.amount >= 0 ? '#10b981' : '#ef4444', whiteSpace: 'nowrap' }}>
                    {ls.amount >= 0 ? '+' : ''}{formatCurrency(ls.amount)}
                  </span>
                </div>
              ))}
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
