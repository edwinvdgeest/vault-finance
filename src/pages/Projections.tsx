import { useState, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { storage } from '../lib/storage';
import { getNetWorth, getPeriodSummary, filterByPeriod } from '../lib/analytics';
import { formatCurrency, getPeriodDates } from '../lib/utils';
import { runProjection } from '../lib/projections';
import type { ProjectionResult } from '../lib/projections';

const tooltipStyle = {
  background: 'rgba(15, 10, 30, 0.95)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10,
  color: 'white',
  fontSize: 13,
};

function SliderInput({
  label, value, onChange, min, max, step, format,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; format?: (v: number) => string;
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
        <label style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{label}</label>
        <span style={{ fontSize: '0.78rem', color: '#cbd5e1', fontWeight: 600 }}>
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: '#8b5cf6', cursor: 'pointer' }}
      />
    </div>
  );
}

export default function Projections() {
  const transactions = storage.getTransactions();
  const accounts = storage.getAccounts();
  const assets = storage.getAssets();

  // Auto-calculate defaults from actual data
  const currentNetWorth = getNetWorth(accounts, transactions, 0); // exclude crypto for projection base
  const { start, end } = getPeriodDates('year');
  const yearTxs = filterByPeriod(transactions, start, end);
  const summary = getPeriodSummary(yearTxs);
  const avgMonthlySavings = Math.max(0, Math.round(summary.cashflow / 12));

  // Inputs
  const [startCapital, setStartCapital] = useState(Math.round(currentNetWorth));
  const [monthlyContrib, setMonthlyContrib] = useState(avgMonthlySavings || 500);
  const [annualReturn, setAnnualReturn] = useState(7);
  const [volatility, setVolatility] = useState(15);
  const [inflation, setInflation] = useState(2);
  const [years, setYears] = useState(20);
  const [goalAmount, setGoalAmount] = useState(1000000);
  const [adjustInflation, setAdjustInflation] = useState(false);

  // Run simulation
  const result: ProjectionResult = useMemo(() => {
    return runProjection({
      startCapital,
      monthlyContribution: monthlyContrib,
      annualReturn: annualReturn / 100,
      annualVolatility: volatility / 100,
      inflationRate: inflation / 100,
      years,
      simulations: 500,
      goalAmount,
      adjustForInflation: adjustInflation,
    });
  }, [startCapital, monthlyContrib, annualReturn, volatility, inflation, years, goalAmount, adjustInflation]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }} className="grid-kpis">
        <div className="glass-card" style={{ padding: '1rem' }}>
          <p style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Mediaan na {years} jaar</p>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10b981' }}>{formatCurrency(result.medianFinal)}</div>
        </div>
        <div className="glass-card" style={{ padding: '1rem' }}>
          <p style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Pessimistisch (P10)</p>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f59e0b' }}>{formatCurrency(result.p10Final)}</div>
        </div>
        <div className="glass-card" style={{ padding: '1rem' }}>
          <p style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Optimistisch (P90)</p>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#8b5cf6' }}>{formatCurrency(result.p90Final)}</div>
        </div>
        <div className="glass-card" style={{ padding: '1rem' }}>
          <p style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Kans op doel ({formatCurrency(goalAmount)})</p>
          <div style={{
            fontSize: '1.25rem', fontWeight: 700,
            color: result.probabilityAboveGoal >= 70 ? '#10b981' : result.probabilityAboveGoal >= 40 ? '#f59e0b' : '#ef4444',
          }}>
            {result.probabilityAboveGoal}%
          </div>
        </div>
      </div>

      {/* Fan chart */}
      <div className="glass-card" style={{ padding: '1.25rem' }}>
        <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
          Vermogensprojectie — 500 simulaties{adjustInflation ? ' (gecorrigeerd voor inflatie)' : ''}
        </p>
        <ResponsiveContainer width="100%" height={380}>
          <AreaChart data={result.yearlyData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
            <defs>
              <linearGradient id="bandOuter" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.08} />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="bandInner" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="label"
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={false} tickLine={false}
              interval={years <= 10 ? 0 : years <= 20 ? 1 : 4}
            />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={false} tickLine={false}
              tickFormatter={v => v >= 1000000 ? `€${(v / 1000000).toFixed(1)}M` : `€${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number, name: string) => {
                const labels: Record<string, string> = { p90: 'P90 (optimistisch)', p75: 'P75', p50: 'Mediaan', p25: 'P25', p10: 'P10 (pessimistisch)' };
                return [formatCurrency(value), labels[name] ?? name];
              }}
            />
            {/* Outer band: P10-P90 */}
            <Area type="monotone" dataKey="p90" stackId="bg" stroke="none" fill="url(#bandOuter)" />
            <Area type="monotone" dataKey="p10" stackId="bg2" stroke="none" fill="none" />
            {/* Inner band: P25-P75 */}
            <Area type="monotone" dataKey="p75" stackId="bg3" stroke="none" fill="url(#bandInner)" />
            <Area type="monotone" dataKey="p25" stackId="bg4" stroke="none" fill="none" />
            {/* P10 line */}
            <Area type="monotone" dataKey="p10" stroke="#64748b" strokeWidth={1} strokeDasharray="4 4" fill="none" dot={false} />
            {/* P90 line */}
            <Area type="monotone" dataKey="p90" stroke="#8b5cf6" strokeWidth={1} strokeDasharray="4 4" fill="none" dot={false} />
            {/* Median line */}
            <Area type="monotone" dataKey="p50" stroke="#06b6d4" strokeWidth={2.5} fill="none" dot={false} />
            {/* Goal line */}
            {goalAmount > 0 && (
              <ReferenceLine
                y={goalAmount}
                stroke="#f59e0b"
                strokeDasharray="6 4"
                strokeWidth={1.5}
                label={{ value: `Doel: ${formatCurrency(goalAmount)}`, fill: '#f59e0b', fontSize: 11, position: 'right' }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Settings */}
      <div className="glass-card" style={{ padding: '1.25rem' }}>
        <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1rem' }}>
          Instellingen
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem 2rem' }} className="grid-halves">
          <SliderInput
            label="Startkapitaal" value={startCapital}
            onChange={setStartCapital}
            min={0} max={2000000} step={10000}
            format={v => formatCurrency(v)}
          />
          <SliderInput
            label="Maandelijkse inleg" value={monthlyContrib}
            onChange={setMonthlyContrib}
            min={0} max={10000} step={100}
            format={v => formatCurrency(v)}
          />
          <SliderInput
            label="Verwacht rendement (jaar)" value={annualReturn}
            onChange={setAnnualReturn}
            min={0} max={15} step={0.5}
            format={v => `${v}%`}
          />
          <SliderInput
            label="Volatiliteit (jaar)" value={volatility}
            onChange={setVolatility}
            min={0} max={30} step={1}
            format={v => `${v}%`}
          />
          <SliderInput
            label="Inflatie (jaar)" value={inflation}
            onChange={setInflation}
            min={0} max={5} step={0.5}
            format={v => `${v}%`}
          />
          <SliderInput
            label="Horizon" value={years}
            onChange={setYears}
            min={5} max={40} step={1}
            format={v => `${v} jaar`}
          />
          <div>
            <label style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.3rem', display: 'block' }}>Doelbedrag</label>
            <input
              type="number"
              className="glass-input"
              style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', width: '100%' }}
              value={goalAmount}
              step={50000}
              onChange={e => setGoalAmount(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', paddingTop: '1.2rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={adjustInflation}
                onChange={e => setAdjustInflation(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#8b5cf6' }}
              />
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Corrigeer voor inflatie</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
