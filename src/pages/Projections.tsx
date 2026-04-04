import { useState, useMemo } from 'react';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import { storage } from '../lib/storage';
import { getNetWorth, getPeriodSummary, filterByPeriod } from '../lib/analytics';
import { formatCurrency, getPeriodDates } from '../lib/utils';
import { runProjection, runScenarioMedian } from '../lib/projections';
import type { ProjectionResult, LifePhase } from '../lib/projections';

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

const SCENARIO_COLORS = ['#06b6d4', '#f59e0b', '#10b981'];
const SCENARIO_LABELS = ['Conservatief', 'Normaal', 'Agressief'];

type Tab = 'projection' | 'scenarios' | 'fire';

export default function Projections() {
  const transactions = storage.getTransactions();
  const accounts = storage.getAccounts();

  const currentNetWorth = getNetWorth(accounts, transactions, 0);
  const { start, end } = getPeriodDates('year');
  const yearTxs = filterByPeriod(transactions, start, end);
  const summary = getPeriodSummary(yearTxs);
  const avgMonthlySavings = Math.max(0, Math.round(summary.cashflow / 12));

  const [tab, setTab] = useState<Tab>('projection');

  // Shared inputs
  const [startCapital, setStartCapital] = useState(Math.round(currentNetWorth));
  const [monthlyContrib, setMonthlyContrib] = useState(avgMonthlySavings || 500);
  const [annualReturn, setAnnualReturn] = useState(7);
  const [volatility, setVolatility] = useState(15);
  const [inflation, setInflation] = useState(2);
  const [years, setYears] = useState(20);
  const [goalAmount, setGoalAmount] = useState(1000000);
  const [adjustInflation, setAdjustInflation] = useState(false);

  // Life phases
  const [phases, setPhases] = useState<LifePhase[]>([]);
  const [showPhases, setShowPhases] = useState(false);

  // FIRE
  const [monthlyExpenses, setMonthlyExpenses] = useState(3000);
  const [withdrawalRate, setWithdrawalRate] = useState(4);
  const fireNumber = Math.round((monthlyExpenses * 12) / (withdrawalRate / 100));

  // Base projection params
  const baseParams = useMemo(() => ({
    startCapital,
    monthlyContribution: monthlyContrib,
    annualReturn: annualReturn / 100,
    annualVolatility: volatility / 100,
    inflationRate: inflation / 100,
    years,
    simulations: 500,
    goalAmount: tab === 'fire' ? fireNumber : goalAmount,
    adjustForInflation: adjustInflation,
    phases: showPhases && phases.length > 0 ? phases : undefined,
  }), [startCapital, monthlyContrib, annualReturn, volatility, inflation, years, goalAmount, adjustInflation, phases, showPhases, tab, fireNumber]);

  // Main projection
  const result: ProjectionResult = useMemo(() => runProjection(baseParams), [baseParams]);

  // Scenario comparison (3 scenarios: -2% return, base, +2% return)
  const scenarios = useMemo(() => {
    if (tab !== 'scenarios') return null;
    const conservative = runScenarioMedian({ ...baseParams, annualReturn: Math.max(0, baseParams.annualReturn - 0.02) });
    const normal = runScenarioMedian(baseParams);
    const aggressive = runScenarioMedian({ ...baseParams, annualReturn: baseParams.annualReturn + 0.02 });

    return result.yearlyData.map((d, i) => ({
      label: d.label,
      year: d.year,
      conservative: conservative[i] ?? 0,
      normal: normal[i] ?? 0,
      aggressive: aggressive[i] ?? 0,
    }));
  }, [tab, baseParams, result.yearlyData]);

  const currentYear = new Date().getFullYear();

  function addPhase() {
    const lastYear = phases.length > 0 ? Math.max(...phases.map(p => p.fromYear)) + 5 : 5;
    setPhases([...phases, {
      id: `phase-${Date.now()}`,
      label: `Fase ${phases.length + 2}`,
      fromYear: lastYear,
      monthlyContribution: monthlyContrib,
    }]);
  }

  function updatePhase(id: string, updates: Partial<LifePhase>) {
    setPhases(phases.map(p => p.id === id ? { ...p, ...updates } : p));
  }

  function removePhase(id: string) {
    setPhases(phases.filter(p => p.id !== id));
  }

  const tabStyle = (t: Tab) => ({
    padding: '0.5rem 1.25rem',
    borderRadius: '2rem',
    border: tab === t ? '1px solid rgba(139,92,246,0.6)' : '1px solid rgba(255,255,255,0.1)',
    background: tab === t ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
    color: tab === t ? 'white' : '#94a3b8',
    fontSize: '0.85rem',
    fontWeight: tab === t ? 600 : 400,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button style={tabStyle('projection')} onClick={() => setTab('projection')}>Projectie</button>
        <button style={tabStyle('scenarios')} onClick={() => setTab('scenarios')}>Scenario's</button>
        <button style={tabStyle('fire')} onClick={() => setTab('fire')}>FIRE</button>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: tab === 'fire' ? 'repeat(4, 1fr)' : 'repeat(4, 1fr)', gap: '1rem' }} className="grid-kpis">
        {tab === 'fire' ? (
          <>
            <div className="glass-card" style={{ padding: '1rem' }}>
              <p style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>FIRE-getal</p>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f59e0b' }}>{formatCurrency(fireNumber)}</div>
              <p style={{ fontSize: '0.65rem', color: '#475569', marginTop: '0.2rem' }}>{withdrawalRate}% van {formatCurrency(monthlyExpenses * 12)}/jaar</p>
            </div>
            <div className="glass-card" style={{ padding: '1rem' }}>
              <p style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>FIRE bereikt in</p>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: result.fireYear ? '#10b981' : '#ef4444' }}>
                {result.fireYear ? `${result.fireYear} jaar (${currentYear + result.fireYear})` : `>${years} jaar`}
              </div>
            </div>
            <div className="glass-card" style={{ padding: '1rem' }}>
              <p style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Kans op FIRE na {years}j</p>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: result.probabilityAboveGoal >= 70 ? '#10b981' : result.probabilityAboveGoal >= 40 ? '#f59e0b' : '#ef4444' }}>
                {result.probabilityAboveGoal}%
              </div>
            </div>
            <div className="glass-card" style={{ padding: '1rem' }}>
              <p style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>Mediaan na {years}j</p>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10b981' }}>{formatCurrency(result.medianFinal)}</div>
            </div>
          </>
        ) : (
          <>
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
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: result.probabilityAboveGoal >= 70 ? '#10b981' : result.probabilityAboveGoal >= 40 ? '#f59e0b' : '#ef4444' }}>
                {result.probabilityAboveGoal}%
              </div>
            </div>
          </>
        )}
      </div>

      {/* Chart */}
      <div className="glass-card" style={{ padding: '1.25rem' }}>
        <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
          {tab === 'scenarios' ? 'Scenario vergelijking — mediaan' :
           tab === 'fire' ? `FIRE projectie — ${formatCurrency(fireNumber)} doel` :
           `Vermogensprojectie — 500 simulaties${adjustInflation ? ' (gecorrigeerd voor inflatie)' : ''}`}
        </p>
        <ResponsiveContainer width="100%" height={380}>
          {tab === 'scenarios' && scenarios ? (
            <LineChart data={scenarios} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false}
                interval={years <= 10 ? 0 : years <= 20 ? 1 : 4} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={v => v >= 1000000 ? `€${(v / 1000000).toFixed(1)}M` : `€${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={tooltipStyle}
                formatter={(value: number, name: string) => {
                  const labels: Record<string, string> = { conservative: `Conservatief (${annualReturn - 2}%)`, normal: `Normaal (${annualReturn}%)`, aggressive: `Agressief (${annualReturn + 2}%)` };
                  return [formatCurrency(value), labels[name] ?? name];
                }} />
              <Legend formatter={(name: string) => {
                const labels: Record<string, string> = { conservative: `Conservatief (${annualReturn - 2}%)`, normal: `Normaal (${annualReturn}%)`, aggressive: `Agressief (${annualReturn + 2}%)` };
                return labels[name] ?? name;
              }} wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
              <Line type="monotone" dataKey="conservative" stroke={SCENARIO_COLORS[0]} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="normal" stroke={SCENARIO_COLORS[1]} strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="aggressive" stroke={SCENARIO_COLORS[2]} strokeWidth={2} dot={false} />
              {goalAmount > 0 && (
                <ReferenceLine y={goalAmount} stroke="#ef4444" strokeDasharray="6 4" strokeWidth={1}
                  label={{ value: `Doel: ${formatCurrency(goalAmount)}`, fill: '#ef4444', fontSize: 10, position: 'right' }} />
              )}
            </LineChart>
          ) : (
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
              <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false}
                interval={years <= 10 ? 0 : years <= 20 ? 1 : 4} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={v => v >= 1000000 ? `€${(v / 1000000).toFixed(1)}M` : `€${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={tooltipStyle}
                formatter={(value: number, name: string) => {
                  const labels: Record<string, string> = { p90: 'P90 (optimistisch)', p75: 'P75', p50: 'Mediaan', p25: 'P25', p10: 'P10 (pessimistisch)' };
                  return [formatCurrency(value), labels[name] ?? name];
                }} />
              <Area type="monotone" dataKey="p90" stackId="bg" stroke="none" fill="url(#bandOuter)" />
              <Area type="monotone" dataKey="p10" stackId="bg2" stroke="none" fill="none" />
              <Area type="monotone" dataKey="p75" stackId="bg3" stroke="none" fill="url(#bandInner)" />
              <Area type="monotone" dataKey="p25" stackId="bg4" stroke="none" fill="none" />
              <Area type="monotone" dataKey="p10" stroke="#64748b" strokeWidth={1} strokeDasharray="4 4" fill="none" dot={false} />
              <Area type="monotone" dataKey="p90" stroke="#8b5cf6" strokeWidth={1} strokeDasharray="4 4" fill="none" dot={false} />
              <Area type="monotone" dataKey="p50" stroke="#06b6d4" strokeWidth={2.5} fill="none" dot={false} />
              {/* Goal / FIRE line */}
              {(tab === 'fire' ? fireNumber : goalAmount) > 0 && (
                <ReferenceLine
                  y={tab === 'fire' ? fireNumber : goalAmount}
                  stroke={tab === 'fire' ? '#10b981' : '#f59e0b'}
                  strokeDasharray="6 4" strokeWidth={1.5}
                  label={{
                    value: tab === 'fire' ? `FIRE: ${formatCurrency(fireNumber)}` : `Doel: ${formatCurrency(goalAmount)}`,
                    fill: tab === 'fire' ? '#10b981' : '#f59e0b', fontSize: 11, position: 'right',
                  }}
                />
              )}
              {/* FIRE year marker */}
              {tab === 'fire' && result.fireYear && (
                <ReferenceLine
                  x={String(currentYear + result.fireYear)}
                  stroke="#10b981" strokeDasharray="4 4" strokeWidth={1}
                  label={{ value: `FIRE ${currentYear + result.fireYear}`, fill: '#10b981', fontSize: 10, position: 'top' }}
                />
              )}
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* FIRE settings */}
      {tab === 'fire' && (
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1rem' }}>
            FIRE instellingen
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem 2rem' }} className="grid-halves">
            <SliderInput
              label="Maandelijkse kosten" value={monthlyExpenses}
              onChange={setMonthlyExpenses}
              min={1000} max={10000} step={250}
              format={v => formatCurrency(v)}
            />
            <SliderInput
              label="Onttrekkingspercentage" value={withdrawalRate}
              onChange={setWithdrawalRate}
              min={2} max={6} step={0.5}
              format={v => `${v}%`}
            />
          </div>
          <p style={{ fontSize: '0.75rem', color: '#475569', marginTop: '0.75rem' }}>
            FIRE-getal = jaarlijkse kosten ({formatCurrency(monthlyExpenses * 12)}) / onttrekkingspercentage ({withdrawalRate}%) = <span style={{ color: '#f59e0b', fontWeight: 600 }}>{formatCurrency(fireNumber)}</span>
          </p>
        </div>
      )}

      {/* Life phases */}
      <div className="glass-card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showPhases ? '1rem' : 0 }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
            Levensfasen
          </p>
          <button
            onClick={() => setShowPhases(!showPhases)}
            style={{
              background: showPhases ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${showPhases ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: '0.375rem',
              color: showPhases ? '#c4b5fd' : '#64748b',
              padding: '0.3rem 0.75rem', fontSize: '0.75rem', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {showPhases ? 'Aan' : 'Uit'}
          </button>
        </div>
        {showPhases && (
          <>
            {/* Default phase (now) */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', marginBottom: '0.5rem',
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '0.5rem',
            }}>
              <span style={{ fontSize: '0.8rem', color: '#06b6d4', fontWeight: 600, minWidth: 60 }}>Nu</span>
              <span style={{ fontSize: '0.8rem', color: '#cbd5e1', flex: 1 }}>Huidige situatie</span>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>€</span>
              <input
                type="number" className="glass-input"
                style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', width: '5rem', textAlign: 'right' }}
                value={monthlyContrib} onChange={e => setMonthlyContrib(parseFloat(e.target.value) || 0)}
              />
              <span style={{ fontSize: '0.7rem', color: '#475569' }}>/mnd</span>
              <div style={{ width: 28 }} />
            </div>
            {/* Custom phases */}
            {phases.map(phase => (
              <div key={phase.id} style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', marginBottom: '0.5rem',
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '0.5rem',
              }}>
                <span style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 600, minWidth: 60 }}>+{phase.fromYear}j</span>
                <input
                  className="glass-input"
                  style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', flex: 1 }}
                  value={phase.label}
                  onChange={e => updatePhase(phase.id, { label: e.target.value })}
                  placeholder="Omschrijving..."
                />
                <span style={{ fontSize: '0.7rem', color: '#475569' }}>na</span>
                <input
                  type="number" className="glass-input"
                  style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', width: '3rem', textAlign: 'right' }}
                  value={phase.fromYear} min={1} max={years}
                  onChange={e => updatePhase(phase.id, { fromYear: parseInt(e.target.value) || 1 })}
                />
                <span style={{ fontSize: '0.7rem', color: '#475569' }}>jaar: €</span>
                <input
                  type="number" className="glass-input"
                  style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', width: '5rem', textAlign: 'right' }}
                  value={phase.monthlyContribution}
                  onChange={e => updatePhase(phase.id, { monthlyContribution: parseFloat(e.target.value) || 0 })}
                />
                <span style={{ fontSize: '0.7rem', color: '#475569' }}>/mnd</span>
                <button onClick={() => removePhase(phase.id)}
                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}
                >×</button>
              </div>
            ))}
            <button
              className="glass-button"
              style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', fontFamily: 'inherit', fontWeight: 600, color: '#94a3b8', marginTop: '0.25rem' }}
              onClick={addPhase}
            >
              + Fase toevoegen
            </button>
          </>
        )}
      </div>

      {/* General settings */}
      <div className="glass-card" style={{ padding: '1.25rem' }}>
        <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1rem' }}>
          Instellingen
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem 2rem' }} className="grid-halves">
          <SliderInput label="Startkapitaal" value={startCapital} onChange={setStartCapital}
            min={0} max={2000000} step={10000} format={v => formatCurrency(v)} />
          {!showPhases && (
            <SliderInput label="Maandelijkse inleg" value={monthlyContrib} onChange={setMonthlyContrib}
              min={0} max={10000} step={100} format={v => formatCurrency(v)} />
          )}
          <SliderInput label="Verwacht rendement (jaar)" value={annualReturn} onChange={setAnnualReturn}
            min={0} max={15} step={0.5} format={v => `${v}%`} />
          <SliderInput label="Volatiliteit (jaar)" value={volatility} onChange={setVolatility}
            min={0} max={30} step={1} format={v => `${v}%`} />
          <SliderInput label="Inflatie (jaar)" value={inflation} onChange={setInflation}
            min={0} max={5} step={0.5} format={v => `${v}%`} />
          <SliderInput label="Horizon" value={years} onChange={setYears}
            min={5} max={40} step={1} format={v => `${v} jaar`} />
          {tab !== 'fire' && (
            <div>
              <label style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.3rem', display: 'block' }}>Doelbedrag</label>
              <input type="number" className="glass-input"
                style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', width: '100%' }}
                value={goalAmount} step={50000}
                onChange={e => setGoalAmount(parseFloat(e.target.value) || 0)} />
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', paddingTop: tab !== 'fire' ? '1.2rem' : 0 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={adjustInflation} onChange={e => setAdjustInflation(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#8b5cf6' }} />
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Corrigeer voor inflatie</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
