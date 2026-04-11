import { useState, useMemo } from 'react';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import { storage } from '../lib/storage';
import { getNetWorth, getPeriodSummary, filterByPeriod, getRobustMonthlyNetSavings } from '../lib/analytics';
import { formatCurrency, getPeriodDates } from '../lib/utils';
import { runProjection, runScenarioMedian } from '../lib/projections';
import type { ProjectionResult, LifePhase, PropertyProjection } from '../lib/projections';
import { forecastCashflow } from '../lib/cashflow';
import { getMonthlyPayment, getTotalPropertyEquity } from '../lib/property';
import ScenarioEditor from '../components/ScenarioEditor';
import type { Scenario } from '../types';

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

type Tab = 'projection' | 'scenarios' | 'fire';

export default function Projections() {
  const transactions = storage.getTransactions();
  const accounts = storage.getAccounts();
  const properties = storage.getProperties();

  const propertyEquity = getTotalPropertyEquity(properties).equity;
  const currentNetWorth = getNetWorth(accounts, transactions, 0, 0);
  const hasProperty = properties.length > 0;

  // Combine all properties into a single aggregated projection (if any)
  const aggregatedProperty: PropertyProjection | null = hasProperty ? (() => {
    const totals = getTotalPropertyEquity(properties);
    // Use first property's growth/mortgage params (most common case: one woning)
    // For multiple, sum mortgage balance and use weighted rates
    let totalBalance = 0;
    let weightedRate = 0;
    let maxMonths = 0;
    let weightedGrowth = 0;
    let totalValue = 0;
    for (const p of properties) {
      totalValue += p.currentValue;
      weightedGrowth += p.currentValue * p.annualGrowth;
      if (p.mortgage) {
        totalBalance += p.mortgage.balance;
        weightedRate += p.mortgage.balance * p.mortgage.interestRate;
        maxMonths = Math.max(maxMonths, p.mortgage.monthsRemaining);
      }
    }
    const avgGrowth = totalValue > 0 ? weightedGrowth / totalValue : 0.03;
    const avgRate = totalBalance > 0 ? weightedRate / totalBalance : 0;
    const monthlyPayment = getMonthlyPayment(totalBalance, avgRate, maxMonths);
    return {
      startValue: totals.value,
      startDebt: totals.debt,
      annualGrowth: avgGrowth,
      monthlyPayment,
      interestRate: avgRate,
      monthsRemaining: maxMonths,
    };
  })() : null;
  const { start, end } = getPeriodDates('year');
  const yearTxs = filterByPeriod(transactions, start, end);
  const summary = getPeriodSummary(yearTxs);
  const avgMonthlySavings = Math.max(0, Math.round(summary.cashflow / 12));

  const [tab, setTab] = useState<Tab>('projection');

  // Scenarios (what-if events)
  const [scenariosState, setScenariosState] = useState<Scenario[]>(() => storage.getScenarios());
  const initialSettings = storage.getSettings() as { activeScenarioId?: string | null; compareScenarioIds?: string[]; cashflowBaselineOverride?: number | null };
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(initialSettings.activeScenarioId ?? null);
  const [compareScenarioIds, setCompareScenarioIds] = useState<string[]>(initialSettings.compareScenarioIds ?? []);
  const [compareMode, setCompareMode] = useState(false);
  const [cashflowBaselineOverride, setCashflowBaselineOverride] = useState<number | null>(
    initialSettings.cashflowBaselineOverride ?? null,
  );

  const activeScenario = scenariosState.find(s => s.id === activeScenarioId) ?? null;
  const compareScenarios = scenariosState.filter(s => compareScenarioIds.includes(s.id));

  function handleScenariosChange(next: Scenario[]) {
    setScenariosState(next);
    storage.setScenarios(next);
  }
  function handleActiveChange(id: string | null) {
    setActiveScenarioId(id);
    storage.updateSettings({ activeScenarioId: id });
  }
  function handleCompareChange(ids: string[]) {
    setCompareScenarioIds(ids);
    storage.updateSettings({ compareScenarioIds: ids });
  }

  const avgHistoricalSavings = useMemo(() => Math.round(getRobustMonthlyNetSavings(transactions, 12)), [transactions]);

  function handleBaselineOverrideChange(v: number | null) {
    setCashflowBaselineOverride(v);
    storage.updateSettings({ cashflowBaselineOverride: v });
  }

  const [includeProperty, setIncludeProperty] = useState(hasProperty);

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

  // Base projection params (baseline — without events)
  const baselineParams = useMemo(() => ({
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
    property: includeProperty && aggregatedProperty ? aggregatedProperty : undefined,
  }), [startCapital, monthlyContrib, annualReturn, volatility, inflation, years, goalAmount, adjustInflation, phases, showPhases, tab, fireNumber, includeProperty, aggregatedProperty]);

  // Projection params with active scenario events applied
  const baseParams = useMemo(() => ({
    ...baselineParams,
    events: activeScenario?.events,
  }), [baselineParams, activeScenario]);

  // Main projection (active scenario)
  const result: ProjectionResult = useMemo(() => runProjection(baseParams), [baseParams]);

  // Baseline projection (no events) — used for impact-delta + scenarios-tab overlay
  const baselineResult: ProjectionResult = useMemo(() => {
    if (!activeScenario && compareScenarios.length === 0) return result;
    return runProjection(baselineParams);
  }, [baselineParams, activeScenario, compareScenarios.length, result]);

  // Short-term cashflow forecast (deterministic, 24 months)
  const cashflow = useMemo(
    () => forecastCashflow(transactions, accounts, activeScenario?.events ?? [], 24, cashflowBaselineOverride),
    [transactions, accounts, activeScenario, cashflowBaselineOverride],
  );

  // Compare-mode scenario overlay (median lines per selected scenario)
  const compareData = useMemo(() => {
    if (tab !== 'scenarios') return null;
    const baselineMedian = runScenarioMedian(baselineParams);
    const scenarioSeries = compareScenarios.map(s => ({
      scenario: s,
      medians: runScenarioMedian({ ...baselineParams, events: s.events }),
    }));
    return baselineResult.yearlyData.map((d, i) => {
      const row: Record<string, number | string> = { label: d.label, year: d.year, baseline: baselineMedian[i] ?? 0 };
      for (const ss of scenarioSeries) row[ss.scenario.id] = ss.medians[i] ?? 0;
      return row;
    });
  }, [tab, baselineParams, compareScenarios, baselineResult.yearlyData]);

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
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={tabStyle('projection')} onClick={() => setTab('projection')}>Projectie</button>
        <button style={tabStyle('scenarios')} onClick={() => setTab('scenarios')}>Scenario's</button>
        <button style={tabStyle('fire')} onClick={() => setTab('fire')}>FIRE</button>

        {tab === 'projection' && scenariosState.length > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Actief scenario</span>
            <select
              value={activeScenarioId ?? ''}
              onChange={e => handleActiveChange(e.target.value || null)}
              className="glass-input"
              style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', minWidth: 180 }}
            >
              <option value="">— Baseline (geen events) —</option>
              {scenariosState.map(s => (
                <option key={s.id} value={s.id}>{s.label} ({s.events.length})</option>
              ))}
            </select>
          </div>
        )}
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
              {includeProperty && aggregatedProperty && (() => {
                const last = result.yearlyData[result.yearlyData.length - 1];
                const eq = typeof last?.propertyEquity === 'number' ? last.propertyEquity : 0;
                return (
                  <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.3rem' }}>
                    + 🏠 {formatCurrency(eq)} = <strong style={{ color: '#cbd5e1' }}>{formatCurrency(result.medianFinal + eq)}</strong>
                  </div>
                );
              })()}
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
          {tab === 'scenarios'
            ? (compareMode ? 'Scenario vergelijking — mediaan' : activeScenario ? `Actief scenario: ${activeScenario.label}` : 'Vermogensprojectie — baseline')
            : tab === 'fire'
            ? `FIRE projectie — ${formatCurrency(fireNumber)} doel`
            : `Vermogensprojectie${activeScenario ? ` — ${activeScenario.label}` : ''} — 500 simulaties${adjustInflation ? ' (gecorrigeerd voor inflatie)' : ''}`}
        </p>
        <ResponsiveContainer width="100%" height={380}>
          {tab === 'scenarios' && compareMode && compareData ? (
            <LineChart data={compareData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false}
                interval={years <= 10 ? 0 : years <= 20 ? 1 : 4} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={v => v >= 1000000 ? `€${(v / 1000000).toFixed(1)}M` : `€${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={tooltipStyle}
                formatter={(value, name) => {
                  if (name === 'baseline') return [formatCurrency(Number(value)), 'Baseline'];
                  const s = compareScenarios.find(x => x.id === name);
                  return [formatCurrency(Number(value)), s?.label ?? String(name)];
                }} />
              <Legend formatter={(name: string) => {
                if (name === 'baseline') return 'Baseline';
                const s = compareScenarios.find(x => x.id === name);
                return s?.label ?? name;
              }} wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
              <Line type="monotone" dataKey="baseline" stroke="#64748b" strokeWidth={2} strokeDasharray="4 4" dot={false} />
              {compareScenarios.map((s, i) => (
                <Line key={s.id} type="monotone" dataKey={s.id}
                  stroke={s.color ?? SCENARIO_COLORS[i % SCENARIO_COLORS.length]} strokeWidth={2.5} dot={false} />
              ))}
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
                formatter={(value, name) => {
                  const labels: Record<string, string> = { p90: 'P90 (optimistisch)', p75: 'P75', p50: 'Mediaan', p25: 'P25', p10: 'P10 (pessimistisch)' };
                  return [formatCurrency(Number(value)), labels[String(name)] ?? String(name)];
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

      {/* Short-term cashflow forecast (24 months, deterministic) */}
      {tab !== 'fire' && (
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
              Korte-termijn kasstroom — 24 mnd
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Baseline €</span>
              <input
                type="number"
                value={Math.round(cashflow.baselineNet)}
                step={50}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  handleBaselineOverrideChange(isNaN(v) ? null : v);
                }}
                className="glass-input"
                style={{ padding: '0.25rem 0.4rem', fontSize: '0.75rem', width: '6rem', textAlign: 'right' }}
              />
              <span style={{ fontSize: '0.7rem', color: '#64748b' }}>/mnd</span>
              {cashflowBaselineOverride !== null && (
                <button
                  type="button"
                  onClick={() => handleBaselineOverrideChange(null)}
                  title={`Reset naar automatisch (€${avgHistoricalSavings.toLocaleString('nl-NL')}/mnd — mediaan 12 mnd)`}
                  style={{
                    padding: '0.2rem 0.5rem', fontSize: '0.7rem', fontWeight: 600,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '0.375rem', color: '#94a3b8', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  ↺ auto
                </button>
              )}
              <span style={{ fontSize: '0.65rem', color: '#475569' }}>
                {cashflowBaselineOverride === null ? 'mediaan 12 mnd' : 'eigen'}
              </span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }} className="grid-halves">
            <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ fontSize: '0.65rem', color: '#94a3b8', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Minimum saldo</p>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: cashflow.minBalance < 0 ? '#ef4444' : '#cbd5e1' }}>
                {formatCurrency(cashflow.minBalance)}
              </div>
            </div>
            <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ fontSize: '0.65rem', color: '#94a3b8', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Event-impact (24 mnd)</p>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: cashflow.totalEventImpact < 0 ? '#f87171' : cashflow.totalEventImpact > 0 ? '#10b981' : '#cbd5e1' }}>
                {cashflow.totalEventImpact > 0 ? '+' : ''}{formatCurrency(cashflow.totalEventImpact)}
              </div>
            </div>
            <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ fontSize: '0.65rem', color: '#94a3b8', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Events gepland</p>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#cbd5e1' }}>
                {activeScenario?.events.length ?? 0}
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={cashflow.months} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="cashflowGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} interval={1} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => v >= 1000 ? `€${(v / 1000).toFixed(0)}k` : `€${v}`} />
              <Tooltip contentStyle={tooltipStyle}
                formatter={(value, name) => {
                  const labels: Record<string, string> = { projectedBalance: 'Met scenario', baselineBalance: 'Baseline' };
                  return [formatCurrency(Number(value)), labels[String(name)] ?? String(name)];
                }} />
              <Area type="monotone" dataKey="baselineBalance" stroke="#64748b" strokeWidth={1.5} strokeDasharray="4 4" fill="none" dot={false} />
              <Area type="monotone" dataKey="projectedBalance" stroke="#06b6d4" strokeWidth={2.5} fill="url(#cashflowGradient)" dot={false} />
              <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="2 4" strokeWidth={1} />
              {(activeScenario?.events ?? []).map(ev => {
                const match = cashflow.months.find(m => m.month === ev.startMonth);
                if (!match) return null;
                return (
                  <ReferenceLine key={ev.id} x={match.label} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth={1}
                    label={{ value: ev.label, fill: '#f59e0b', fontSize: 9, position: 'top' }} />
                );
              })}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Impact summary when an active scenario is set */}
      {tab !== 'fire' && activeScenario && (
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
            Impact t.o.v. baseline
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }} className="grid-halves">
            <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ fontSize: '0.65rem', color: '#94a3b8', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Δ mediaan na {years}j</p>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: result.medianFinal < baselineResult.medianFinal ? '#f87171' : '#10b981' }}>
                {result.medianFinal - baselineResult.medianFinal >= 0 ? '+' : ''}{formatCurrency(result.medianFinal - baselineResult.medianFinal)}
              </div>
            </div>
            <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ fontSize: '0.65rem', color: '#94a3b8', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Δ P10 na {years}j</p>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: result.p10Final < baselineResult.p10Final ? '#f87171' : '#10b981' }}>
                {result.p10Final - baselineResult.p10Final >= 0 ? '+' : ''}{formatCurrency(result.p10Final - baselineResult.p10Final)}
              </div>
            </div>
            <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ fontSize: '0.65rem', color: '#94a3b8', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>FIRE-jaar shift</p>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#cbd5e1' }}>
                {baselineResult.fireYear && result.fireYear
                  ? `${result.fireYear - baselineResult.fireYear >= 0 ? '+' : ''}${result.fireYear - baselineResult.fireYear} jaar`
                  : baselineResult.fireYear && !result.fireYear
                  ? `niet meer <${years}j`
                  : '—'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scenario editor (on scenarios tab) */}
      {tab === 'scenarios' && (
        <ScenarioEditor
          scenarios={scenariosState}
          activeId={activeScenarioId}
          compareIds={compareScenarioIds}
          compareMode={compareMode}
          onScenariosChange={handleScenariosChange}
          onActiveChange={handleActiveChange}
          onCompareChange={handleCompareChange}
          onCompareModeChange={setCompareMode}
        />
      )}

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
            <div>
              <SliderInput label="Maandelijkse inleg" value={monthlyContrib} onChange={setMonthlyContrib}
                min={0} max={10000} step={100} format={v => formatCurrency(v)} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem' }}>
                <button
                  type="button"
                  onClick={() => setMonthlyContrib(Math.max(0, avgHistoricalSavings))}
                  className="glass-button"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.7rem', fontWeight: 600, color: '#c4b5fd', cursor: 'pointer', fontFamily: 'inherit' }}
                  title="Mediaan over 12 mnd — robuust tegen uitschiertermaanden"
                >
                  Bereken uit historie (mediaan 12 mnd)
                </button>
                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                  {formatCurrency(avgHistoricalSavings)}/mnd
                </span>
              </div>
            </div>
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
          {hasProperty && (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={includeProperty} onChange={e => setIncludeProperty(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#8b5cf6' }} />
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  🏠 Woning meenemen ({formatCurrency(propertyEquity)} overwaarde)
                </span>
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
