import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { storage } from '../lib/storage';
import { getTaxBreakdown } from '../lib/analytics';
import type { TaxYearBreakdown, TaxType } from '../lib/analytics';
import { formatCurrency, formatDate } from '../lib/utils';

const tooltipStyle = {
  background: 'rgba(15, 10, 30, 0.95)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10,
  color: 'white',
  fontSize: 13,
};

const TYPE_COLORS: Record<TaxType, string> = {
  Belastingdienst: '#8b5cf6',
  Gemeente: '#06b6d4',
  Waterschap: '#10b981',
  CAK: '#f59e0b',
  DUO: '#ec4899',
  CJIB: '#ef4444',
  Overig: '#64748b',
};

export default function Taxes() {
  const navigate = useNavigate();
  const transactions = storage.getTransactions();

  const allYears = useMemo(() => getTaxBreakdown(transactions), [transactions]);
  const availableYears = allYears.map(y => y.year);
  const currentYear = new Date().getFullYear().toString();

  const [selectedYear, setSelectedYear] = useState(() => {
    if (availableYears.includes(currentYear)) return currentYear;
    return availableYears[0] ?? currentYear;
  });

  const current: TaxYearBreakdown | undefined = allYears.find(y => y.year === selectedYear);
  const prior: TaxYearBreakdown | undefined = allYears.find(y => y.year === String(parseInt(selectedYear) - 1));

  const pctDelta = current && prior && prior.pctOfIncome !== 0
    ? Math.round((current.pctOfIncome - prior.pctOfIncome) * 10) / 10
    : null;

  const yearIdx = availableYears.indexOf(selectedYear);
  const canGoBack = yearIdx < availableYears.length - 1;
  const canGoForward = yearIdx > 0;

  function navToTransactions(type: TaxType) {
    const params = new URLSearchParams({
      category: 'Belastingen',
      search: type,
      start: `${selectedYear}-01-01`,
      end: `${selectedYear}-12-31`,
    });
    navigate(`/transactions?${params.toString()}`);
  }

  // Per-year data (last 6 years, oldest to newest for chart)
  const chartData = allYears.slice(0, 6).slice().reverse().map(y => ({
    year: y.year,
    paid: y.paid,
    refunds: y.refunds,
    net: y.net,
  }));

  if (allYears.length === 0) {
    return (
      <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
        Geen belasting-transacties gevonden. Importeer transacties en categoriseer ze als "Belastingen".
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Year navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button
          onClick={() => canGoBack && setSelectedYear(availableYears[yearIdx + 1])}
          disabled={!canGoBack}
          className="glass-button"
          style={{ padding: '0.4rem 0.75rem', fontSize: '1rem', fontFamily: 'inherit', cursor: canGoBack ? 'pointer' : 'default', color: canGoBack ? '#94a3b8' : '#334155' }}
        >
          ‹
        </button>
        <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>{selectedYear}</span>
        <button
          onClick={() => canGoForward && setSelectedYear(availableYears[yearIdx - 1])}
          disabled={!canGoForward}
          className="glass-button"
          style={{ padding: '0.4rem 0.75rem', fontSize: '1rem', fontFamily: 'inherit', cursor: canGoForward ? 'pointer' : 'default', color: canGoForward ? '#94a3b8' : '#334155' }}
        >
          ›
        </button>
      </div>

      {current && (
        <>
          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }} className="grid-kpis">
            <div className="glass-card" style={{ padding: '1rem' }}>
              <p className="section-title" style={{ marginBottom: '0.3rem' }}>Netto belasting</p>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444' }}>
                {formatCurrency(current.net)}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem' }}>
                {formatCurrency(current.paid)} betaald − {formatCurrency(current.refunds)} terug
              </div>
            </div>
            <div className="glass-card" style={{ padding: '1rem' }}>
              <p className="section-title" style={{ marginBottom: '0.3rem' }}>% van inkomen</p>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b' }}>
                {current.pctOfIncome}%
              </div>
              {pctDelta !== null && (
                <div style={{ fontSize: '0.7rem', color: pctDelta <= 0 ? '#10b981' : '#ef4444', marginTop: '0.25rem' }}>
                  {pctDelta >= 0 ? '↑' : '↓'} {Math.abs(pctDelta)}pp t.o.v. {parseInt(selectedYear) - 1}
                </div>
              )}
            </div>
            <div className="glass-card" style={{ padding: '1rem' }}>
              <p className="section-title" style={{ marginBottom: '0.3rem' }}>Teruggave</p>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>
                {formatCurrency(current.refunds)}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem' }}>
                {current.transactions.filter(t => t.amount > 0).length} teruggaves
              </div>
            </div>
          </div>

          {/* Per-year chart */}
          {chartData.length > 1 && (
            <div className="glass-card" style={{ padding: '1.25rem' }}>
              <p className="section-title">Belasting per jaar</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="year" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    axisLine={false} tickLine={false}
                    tickFormatter={v => v >= 1000 ? `€${(v / 1000).toFixed(1)}k` : `€${v}`}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value, name) => {
                      const labels: Record<string, string> = { paid: 'Betaald', refunds: 'Teruggave', net: 'Netto' };
                      return [formatCurrency(Number(value)), labels[String(name)] ?? String(name)];
                    }}
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  />
                  <Legend
                    formatter={(name: string) => {
                      const labels: Record<string, string> = { paid: 'Betaald', refunds: 'Teruggave' };
                      return labels[name] ?? name;
                    }}
                    wrapperStyle={{ fontSize: 12, color: '#94a3b8' }}
                  />
                  <Bar dataKey="paid" fill="#ef4444" style={{ fill: '#ef4444' }} radius={[3, 3, 0, 0]} maxBarSize={50} onClick={(d: unknown) => { const y = (d as { payload?: { year?: string } })?.payload?.year; if (y) setSelectedYear(y); }} cursor="pointer" />
                  <Bar dataKey="refunds" fill="#10b981" style={{ fill: '#10b981' }} radius={[3, 3, 0, 0]} maxBarSize={50} onClick={(d: unknown) => { const y = (d as { payload?: { year?: string } })?.payload?.year; if (y) setSelectedYear(y); }} cursor="pointer" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Per-type breakdown */}
          {current.byType.length > 0 && (
            <div className="glass-card" style={{ padding: '1.25rem' }}>
              <p className="section-title">Per type — {selectedYear}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '1.5rem', alignItems: 'center' }} className="grid-halves">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={current.byType.filter(t => t.net > 0)}
                      cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                      dataKey="net" nameKey="type"
                    >
                      {current.byType.filter(t => t.net > 0).map(t => (
                        <Cell key={t.type} fill={TYPE_COLORS[t.type]} style={{ fill: TYPE_COLORS[t.type] }} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  {current.byType.map(t => (
                    <div
                      key={t.type}
                      onClick={() => navToTransactions(t.type)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem',
                        padding: '0.5rem 0.75rem',
                        background: 'rgba(255,255,255,0.03)', borderRadius: '0.375rem',
                        border: '1px solid rgba(255,255,255,0.05)',
                        cursor: 'pointer', transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: 9, height: 9, borderRadius: '50%', background: TYPE_COLORS[t.type], flexShrink: 0 }} />
                        <span style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>{t.type}</span>
                        <span style={{ fontSize: '0.68rem', color: '#475569' }}>{t.count}×</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline', fontSize: '0.8rem', fontWeight: 600 }}>
                        {t.refunds > 0 && <span style={{ color: '#10b981' }}>+{formatCurrency(t.refunds)}</span>}
                        <span style={{ color: '#ef4444' }}>−{formatCurrency(t.paid)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Transactions list */}
          {current.transactions.length > 0 && (
            <div className="glass-card" style={{ padding: '1.25rem' }}>
              <p className="section-title">Transacties {selectedYear} ({current.transactions.length})</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {current.transactions.map(tx => (
                  <div
                    key={tx.id}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '0.5rem 0.75rem',
                      background: 'rgba(255,255,255,0.03)', borderRadius: '0.375rem',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {tx.name || tx.counterparty}
                        </span>
                        {tx.amount > 0 && <span title="Teruggave" style={{ fontSize: '0.6rem', color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '0.05rem 0.3rem', borderRadius: '0.5rem', fontWeight: 600 }}>teruggave</span>}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.1rem' }}>
                        {formatDate(tx.date)}
                      </div>
                    </div>
                    <span style={{
                      fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap',
                      color: tx.amount >= 0 ? '#10b981' : '#ef4444',
                    }}>
                      {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
