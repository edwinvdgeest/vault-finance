import { useEffect, useMemo, useState } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, CartesianGrid,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { storage } from '../lib/storage';
import {
  scorePortfolio, suggestFunds, simulateInvestment, THEME_LABELS, LEVEL_LABELS, LEVEL_COLORS,
} from '../lib/sustainability';
import type { SustainTheme, SustainLevel, SfdrArticle } from '../lib/sustainability';
import {
  fetchPriceHistory, normalizeSeries, mergeSeries, annualizedReturn,
} from '../lib/performance';
import type { HistoryRange, PricePoint } from '../lib/performance';
import { getAccountBalance } from '../lib/analytics';
import type { Asset } from '../types';
import { formatCurrency } from '../lib/utils';

const LINE_COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#34d399', '#f43f5e', '#a78bfa'];
const RANGE_OPTIONS: { value: HistoryRange; label: string }[] = [
  { value: '1y', label: '1 jaar' },
  { value: '3y', label: '3 jaar' },
  { value: '5y', label: '5 jaar' },
];

function fmtPct(r: number): string {
  const pct = (r * 100).toFixed(1).replace('.', ',');
  return `${r >= 0 ? '+' : ''}${pct}%`;
}

/** Opzoeksleutel voor koershistorie: ETF via yahoo-symbool/ISIN, crypto via <SYM>-EUR. */
function historyKey(asset: Asset): string | null {
  if (asset.assetClass === 'broker-cash') return null;
  if (!asset.assetClass || asset.assetClass === 'crypto') return `${asset.symbol.toUpperCase()}-EUR`;
  return (asset as Asset & { yahooSymbol?: string }).yahooSymbol ?? asset.isin ?? asset.symbol;
}

const tooltipStyle = {
  background: 'rgba(15, 10, 30, 0.95)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10,
  color: 'white',
  fontSize: 13,
};

const ALL_THEMES: SustainTheme[] = ['water', 'hernieuwbare-energie', 'breed-duurzaam', 'impact'];
const LEVELS_DESC: SustainLevel[] = [3, 2, 1, 0];

const SFDR_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'SFDR onbekend' },
  { value: '9', label: 'Artikel 9 — donkergroen' },
  { value: '8', label: 'Artikel 8 — lichtgroen' },
  { value: '6', label: 'Artikel 6 — grijs' },
];

function LevelBadge({ level }: { level: SustainLevel }) {
  return (
    <span style={{
      fontSize: '0.62rem', fontWeight: 600, whiteSpace: 'nowrap',
      color: LEVEL_COLORS[level], background: `${LEVEL_COLORS[level]}1a`,
      border: `1px solid ${LEVEL_COLORS[level]}55`,
      padding: '0.1rem 0.4rem', borderRadius: '0.6rem',
    }}>
      {LEVEL_LABELS[level]}
    </span>
  );
}

export default function Sustainability() {
  const [assets, setAssets] = useState<Asset[]>(() => storage.getAssets());
  const [themeFilter, setThemeFilter] = useState<SustainTheme | null>(null);

  const score = useMemo(() => scorePortfolio(assets), [assets]);
  const suggestions = useMemo(() => suggestFunds(themeFilter ?? undefined, assets), [themeFilter, assets]);
  const hasHoldings = score.holdings.length > 0;

  // Beschikbaar spaargeld voor de wat-als-simulator: banksaldi + broker-cash
  const availableCash = useMemo(() => {
    const accounts = storage.getAccounts();
    const transactions = storage.getTransactions();
    const bankCash = accounts.reduce((s, acc) => s + getAccountBalance(acc, transactions), 0);
    return Math.max(0, Math.round(bankCash + score.cashValue));
  }, [score.cashValue]);

  const [investAmount, setInvestAmount] = useState<number | null>(null);
  const [investLevel, setInvestLevel] = useState<SustainLevel>(2);
  const amount = investAmount ?? Math.min(10000, Math.round(availableCash / 4 / 500) * 500);
  const simulation = useMemo(() => simulateInvestment(score, amount, investLevel), [score, amount, investLevel]);

  const donutData = LEVELS_DESC
    .filter(l => score.byLevel[l] > 0)
    .map(l => ({ name: LEVEL_LABELS[l], value: score.byLevel[l], level: l }));

  const themeChartData = score.byTheme.map(t => ({
    name: THEME_LABELS[t.theme],
    value: t.value,
  }));

  const simChartData = [
    { name: 'Nu', ...Object.fromEntries(LEVELS_DESC.map(l => [`l${l}`, score.byLevel[l]])) },
    { name: 'Na', ...Object.fromEntries(LEVELS_DESC.map(l => [`l${l}`, simulation.byLevel[l]])) },
  ];

  // Historische performance van holdings (genormaliseerd, index = 100).
  // Loading wordt afgeleid uit de request-signature: wijkt die af van het
  // opgeslagen resultaat, dan is er een fetch onderweg.
  const [perfRange, setPerfRange] = useState<HistoryRange>('3y');
  const perfHoldings = useMemo(
    () => score.holdings
      .map(h => ({ name: h.asset.name, key: historyKey(h.asset) }))
      .filter((h): h is { name: string; key: string } => !!h.key),
    [score.holdings],
  );
  const perfSig = `${perfRange}|${perfHoldings.map(h => h.key).join(',')}`;
  const [perfResult, setPerfResult] = useState<{
    sig: string;
    series: { name: string; points: PricePoint[]; annualized: number | null }[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (perfHoldings.length === 0) return;
    Promise.all(perfHoldings.map(async h => {
      const history = await fetchPriceHistory(h.key, perfRange);
      if (!history) return null;
      return { name: h.name, points: history.points, annualized: annualizedReturn(history.points) };
    })).then(results => {
      if (!cancelled) {
        setPerfResult({ sig: perfSig, series: results.filter((r): r is NonNullable<typeof r> => r !== null) });
      }
    });
    return () => { cancelled = true; };
  }, [perfHoldings, perfRange, perfSig]);

  const perfSeries = perfResult?.sig === perfSig ? perfResult.series : null;

  const perfChartData = useMemo(
    () => mergeSeries((perfSeries ?? []).map(s => ({ name: s.name, points: normalizeSeries(s.points) }))),
    [perfSeries],
  );

  // Rendement per jaar op de fondssuggestie-kaarten (3 jaar)
  const [suggestionReturns, setSuggestionReturns] = useState<Record<string, number | null>>({});
  useEffect(() => {
    let cancelled = false;
    const missing = suggestions.filter(f => !(f.isins[0] in suggestionReturns));
    if (missing.length === 0) return;
    Promise.all(missing.map(async f => {
      const history = await fetchPriceHistory(f.isins[0], '3y');
      return [f.isins[0], history ? annualizedReturn(history.points) : null] as const;
    })).then(entries => {
      if (!cancelled) setSuggestionReturns(prev => ({ ...prev, ...Object.fromEntries(entries) }));
    });
    return () => { cancelled = true; };
  }, [suggestions, suggestionReturns]);

  function updateSustainability(target: Asset, patch: { sfdr?: SfdrArticle; theme?: SustainTheme }) {
    const updated = assets.map(a => {
      if (a !== target) return a;
      const cur = a.sustainability ?? {};
      const themes = new Set(cur.themes ?? []);
      if (patch.theme) {
        if (themes.has(patch.theme)) themes.delete(patch.theme);
        else themes.add(patch.theme);
      }
      const sfdr = 'sfdr' in patch ? patch.sfdr : cur.sfdr;
      const next = { ...cur, sfdr, themes: [...themes] };
      return { ...a, sustainability: next.sfdr === undefined && next.themes.length === 0 && !next.note ? undefined : next };
    });
    setAssets(updated);
    storage.setAssets(updated);
  }

  const barSegments = LEVELS_DESC
    .map(level => ({ level, value: score.byLevel[level] }))
    .filter(s => s.value > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }} className="grid-kpis">
        <div className="glass-card" style={{ padding: '1rem' }}>
          <p className="section-title" style={{ marginBottom: '0.3rem' }}>Duurzaam belegd</p>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#34d399' }}>
            {hasHoldings ? `${score.pctSustainable}%` : '—'}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem' }}>
            Licht duurzaam of beter, gewogen naar waarde
          </div>
        </div>
        <div className="glass-card" style={{ padding: '1rem' }}>
          <p className="section-title" style={{ marginBottom: '0.3rem' }}>Streng duurzaam of impact</p>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#059669' }}>
            {hasHoldings ? `${score.pctStrict}%` : '—'}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem' }}>
            SRI/Paris-Aligned, themafondsen (water, energie) en artikel 9-fondsen
          </div>
        </div>
        <div className="glass-card" style={{ padding: '1rem' }}>
          <p className="section-title" style={{ marginBottom: '0.3rem' }}>Niet herkend</p>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b' }}>
            {formatCurrency(score.byLevel[0])}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem' }}>
            Classificeer hieronder — of vraag Claude het uit te zoeken
          </div>
        </div>
      </div>

      {/* Verdeling + holdings */}
      <div className="glass-card" style={{ padding: '1.25rem' }}>
        <p className="section-title">Portfolio-duurzaamheid</p>
        {!hasHoldings ? (
          <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
            Nog geen beleggingen gevonden. Importeer een DeGiro Portfolio.csv via de Import-pagina
            of voeg holdings toe via Instellingen — daarna zie je hier hoe duurzaam je portefeuille is.
          </p>
        ) : (
          <>
            {/* Stacked bar */}
            <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', margin: '0.5rem 0 0.75rem' }}>
              {barSegments.map(s => (
                <div
                  key={s.level}
                  title={`${LEVEL_LABELS[s.level]}: ${formatCurrency(s.value)}`}
                  style={{ width: `${(s.value / score.totalValue) * 100}%`, background: LEVEL_COLORS[s.level] }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {barSegments.map(s => (
                <span key={s.level} style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: LEVEL_COLORS[s.level], display: 'inline-block' }} />
                  {LEVEL_LABELS[s.level]} · {formatCurrency(s.value)}
                </span>
              ))}
              {score.cashValue > 0 && (
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  (+ {formatCurrency(score.cashValue)} broker-cash, niet meegewogen)
                </span>
              )}
            </div>

            {/* Grafieken: niveau-donut + thema's */}
            <div style={{ display: 'grid', gridTemplateColumns: themeChartData.length > 0 ? '1fr 1fr' : '1fr', gap: '1.5rem', alignItems: 'center', marginBottom: '1rem' }} className="grid-halves">
              <div style={{ position: 'relative' }}>
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%" cy="50%" innerRadius={62} outerRadius={90}
                      dataKey="value" nameKey="name" strokeWidth={0} paddingAngle={2}
                    >
                      {donutData.map(d => (
                        <Cell key={d.level} fill={LEVEL_COLORS[d.level]} style={{ fill: LEVEL_COLORS[d.level] }} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
                }}>
                  <span style={{ fontSize: '1.35rem', fontWeight: 700, color: '#34d399' }}>{score.pctSustainable}%</span>
                  <span style={{ fontSize: '0.62rem', color: '#64748b' }}>duurzaam</span>
                </div>
              </div>
              {themeChartData.length > 0 && (
                <div>
                  <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '0 0 0.25rem' }}>Belegd per duurzaam thema</p>
                  <ResponsiveContainer width="100%" height={Math.max(120, themeChartData.length * 48)}>
                    <BarChart data={themeChartData} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }}>
                      <XAxis
                        type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false}
                        tickFormatter={v => v >= 1000 ? `€${(v / 1000).toFixed(1)}k` : `€${v}`}
                      />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(Number(v))} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                      <Bar dataKey="value" fill="#06b6d4" style={{ fill: '#06b6d4' }} radius={[0, 3, 3, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Holdings */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {score.holdings.map(h => (
                <div
                  key={`${h.asset.type}-${h.asset.symbol}`}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: '0.4rem',
                    padding: '0.6rem 0.75rem',
                    background: 'rgba(255,255,255,0.03)', borderRadius: '0.375rem',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{h.asset.name}</span>
                      <LevelBadge level={h.assessment.level} />
                      {h.assessment.sfdr !== undefined && (
                        <span style={{ fontSize: '0.62rem', color: '#94a3b8' }}>SFDR art. {h.assessment.sfdr}</span>
                      )}
                      {h.assessment.themes.map(t => (
                        <span key={t} style={{ fontSize: '0.62rem', color: '#67e8f9' }}>{THEME_LABELS[t as SustainTheme] ?? t}</span>
                      ))}
                    </div>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{formatCurrency(h.value)}</span>
                  </div>

                  {/* Waarom dit niveau — altijd uitlegbaar */}
                  {h.assessment.signals.length > 0 && (
                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                      {h.assessment.signals.join(' · ')}
                      {h.assessment.note ? ` · 📝 ${h.assessment.note}` : ''}
                    </div>
                  )}

                  {/* Classificatie-editor voor holdings zonder geverifieerde database-match */}
                  {h.assessment.source !== 'database' && (
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <select
                        className="glass-input"
                        value={h.asset.sustainability?.sfdr?.toString() ?? ''}
                        onChange={e => updateSustainability(h.asset, {
                          sfdr: e.target.value ? Number(e.target.value) as SfdrArticle : undefined,
                        })}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem' }}
                      >
                        {SFDR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      {ALL_THEMES.map(t => {
                        const active = (h.asset.sustainability?.themes ?? []).includes(t);
                        return (
                          <button
                            key={t}
                            onClick={() => updateSustainability(h.asset, { theme: t })}
                            style={{
                              padding: '0.2rem 0.6rem', borderRadius: '1rem', fontSize: '0.68rem', cursor: 'pointer',
                              fontFamily: 'inherit',
                              border: active ? '1px solid rgba(6,182,212,0.6)' : '1px solid rgba(255,255,255,0.1)',
                              background: active ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.04)',
                              color: active ? '#67e8f9' : '#94a3b8',
                            }}
                          >
                            {THEME_LABELS[t]}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Wat-als-simulator */}
      {availableCash > 0 && (
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <p className="section-title">Wat als: spaargeld duurzaam beleggen</p>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', margin: '0.5rem 0 0.75rem' }}>
            <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.6rem', flex: '1 1 280px' }}>
              Bedrag
              <input
                type="range"
                min={0}
                max={availableCash}
                step={500}
                value={amount}
                onChange={e => setInvestAmount(Number(e.target.value))}
                style={{ flex: 1, accentColor: '#34d399' }}
              />
              <span style={{ fontWeight: 700, color: 'white', minWidth: 90, textAlign: 'right' }}>{formatCurrency(amount)}</span>
            </label>
            <select
              className="glass-input"
              value={investLevel}
              onChange={e => setInvestLevel(Number(e.target.value) as SustainLevel)}
              style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
            >
              <option value={3}>naar impactfonds (art. 9)</option>
              <option value={2}>naar streng duurzaam / themafonds</option>
              <option value={1}>naar licht duurzaam (ESG)</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 340px', minWidth: 0 }}>
              <ResponsiveContainer width="100%" height={110}>
                <BarChart data={simChartData} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                  <XAxis
                    type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={v => v >= 1000 ? `€${Math.round(v / 1000)}k` : `€${v}`}
                  />
                  <YAxis type="category" dataKey="name" width={34} tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v, key) => [formatCurrency(Number(v)), LEVEL_LABELS[Number(String(key).slice(1)) as SustainLevel]]}
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  />
                  {LEVELS_DESC.map(l => (
                    <Bar key={l} dataKey={`l${l}`} stackId="s" fill={LEVEL_COLORS[l]} style={{ fill: LEVEL_COLORS[l] }} maxBarSize={22} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                Duurzaam belegd: <strong style={{ color: '#34d399' }}>{score.pctSustainable}% → {simulation.pctSustainable}%</strong>
              </span>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                Streng of impact: <strong style={{ color: '#059669' }}>{score.pctStrict}% → {simulation.pctStrict}%</strong>
              </span>
              <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                Beleggingen: {formatCurrency(score.totalValue)} → {formatCurrency(simulation.totalValue)}
              </span>
            </div>
          </div>
          <p style={{ fontSize: '0.68rem', color: '#64748b', margin: '0.6rem 0 0' }}>
            Beschikbaar spaargeld (banksaldi + broker-cash): {formatCurrency(availableCash)}. Rekenvoorbeeld, geen advies —
            houd een buffer aan en spreid inleg in de tijd.
          </p>
        </div>
      )}

      {/* Historische performance */}
      {perfHoldings.length > 0 && (
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <p className="section-title" style={{ margin: 0 }}>Historische performance (index = 100)</p>
            <div style={{ display: 'flex', gap: '0.375rem' }}>
              {RANGE_OPTIONS.map(o => (
                <button
                  key={o.value}
                  onClick={() => setPerfRange(o.value)}
                  style={{
                    padding: '0.3rem 0.75rem', borderRadius: '2rem', fontSize: '0.75rem', cursor: 'pointer',
                    fontFamily: 'inherit',
                    border: perfRange === o.value ? '1px solid rgba(139,92,246,0.6)' : '1px solid rgba(255,255,255,0.1)',
                    background: perfRange === o.value ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
                    color: perfRange === o.value ? 'white' : '#94a3b8',
                    fontWeight: perfRange === o.value ? 600 : 400,
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {perfSeries === null ? (
            <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '1rem 0 0' }}>Koershistorie laden…</p>
          ) : perfSeries.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '1rem 0 0' }}>
              Geen koershistorie gevonden voor deze holdings.
            </p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={perfChartData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={d => {
                      const [y, m] = String(d).split('-');
                      const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
                      return `${months[Number(m) - 1]} '${y.slice(2)}`;
                    }}
                    minTickGap={40}
                  />
                  <YAxis
                    tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false}
                    domain={['auto', 'auto']} width={44}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v) => `${Number(v).toFixed(1).replace('.', ',')}`}
                  />
                  {perfSeries.map((s, i) => (
                    <Line
                      key={s.name}
                      type="monotone"
                      dataKey={s.name}
                      stroke={LINE_COLORS[i % LINE_COLORS.length]}
                      style={{ stroke: LINE_COLORS[i % LINE_COLORS.length] }}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                {perfSeries.map((s, i) => (
                  <span key={s.name} style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ width: 10, height: 3, borderRadius: 2, background: LINE_COLORS[i % LINE_COLORS.length], display: 'inline-block' }} />
                    {s.name}
                    {s.annualized !== null && (
                      <strong style={{ color: s.annualized >= 0 ? '#10b981' : '#ef4444' }}>{fmtPct(s.annualized)}/jr</strong>
                    )}
                  </span>
                ))}
              </div>
              <p style={{ fontSize: '0.68rem', color: '#64748b', margin: '0.5rem 0 0' }}>
                Koersen via Yahoo Finance, genormaliseerd op 100 aan het begin van de periode; rendement in de valuta
                van de notering, exclusief dividend en kosten. In het verleden behaalde resultaten bieden geen garantie.
              </p>
            </>
          )}
        </div>
      )}

      {/* Thema-verkenner */}
      <div className="glass-card" style={{ padding: '1.25rem' }}>
        <p className="section-title">Duurzame fondsen verkennen</p>
        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', margin: '0.5rem 0 1rem' }}>
          {[null, ...ALL_THEMES].map(t => (
            <button
              key={t ?? 'alle'}
              onClick={() => setThemeFilter(t)}
              style={{
                padding: '0.375rem 0.875rem', borderRadius: '2rem', fontSize: '0.8rem', cursor: 'pointer',
                fontFamily: 'inherit', transition: 'all 0.15s',
                border: themeFilter === t ? '1px solid rgba(52,211,153,0.6)' : '1px solid rgba(255,255,255,0.1)',
                background: themeFilter === t ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.04)',
                color: themeFilter === t ? '#34d399' : '#94a3b8',
                fontWeight: themeFilter === t ? 600 : 400,
              }}
            >
              {t ? THEME_LABELS[t] : 'Alle thema\'s'}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.75rem' }}>
          {suggestions.map(f => (
            <div
              key={f.isins[0]}
              style={{
                padding: '0.85rem 1rem', borderRadius: '0.5rem',
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', flexDirection: 'column', gap: '0.4rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{f.name}</span>
                {f.ticker && <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>{f.ticker}</span>}
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <LevelBadge level={f.level} />
                <span style={{ fontSize: '0.62rem', color: '#64748b' }}>
                  {f.sfdr ? `SFDR art. ${f.sfdr}` : 'SFDR: zie aanbieder'}
                </span>
                {f.themes.map(t => (
                  <span key={t} style={{ fontSize: '0.62rem', color: '#67e8f9' }}>{THEME_LABELS[t]}</span>
                ))}
                {f.ter !== undefined && (
                  <span style={{ fontSize: '0.62rem', color: '#94a3b8' }}>kosten {(f.ter * 100).toFixed(2).replace('.', ',')}%/jr</span>
                )}
                {suggestionReturns[f.isins[0]] != null && (
                  <span style={{ fontSize: '0.62rem', fontWeight: 600, color: suggestionReturns[f.isins[0]]! >= 0 ? '#10b981' : '#ef4444' }}>
                    {fmtPct(suggestionReturns[f.isins[0]]!)}/jr (3j)
                  </span>
                )}
              </div>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0, lineHeight: 1.45 }}>{f.description}</p>
              <a
                href={f.url} target="_blank" rel="noreferrer"
                style={{ fontSize: '0.72rem', color: '#34d399', textDecoration: 'none', marginTop: 'auto' }}
              >
                Fondsinformatie & actuele SFDR-status →
              </a>
            </div>
          ))}
          {suggestions.length === 0 && (
            <p style={{ color: '#64748b', fontSize: '0.8rem' }}>
              Alle fondsen binnen dit thema zitten al in je portefeuille.
            </p>
          )}
        </div>
      </div>

      {/* Uitleg + disclaimer */}
      <div className="glass-card" style={{ padding: '1rem 1.25rem', border: '1px solid rgba(245,158,11,0.25)' }}>
        <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 0.5rem', lineHeight: 1.55 }}>
          <strong>Hoe de niveaus werken</strong> — de app kijkt verder dan alleen de SFDR-indeling, omdat "artikel 8"
          zowel licht gescreende als behoorlijk strenge fondsen bevat: <em>Impact</em> = duurzaamheid is de doelstelling
          (artikel 9, de "donkergroene" fondsen); <em>Streng duurzaam</em> = SRI-, Paris-Aligned- of Climate
          Transition-index (wettelijk gedefinieerde labels) of een duurzaam themafonds; <em>Licht duurzaam</em> =
          ESG-gescreend. Elk niveau toont zijn onderbouwing ("signalen") bij de holding. Vraag Claude om
          niet-herkende fondsen te onderzoeken — die kan de classificatie met bronvermelding opslaan.
        </p>
        <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0, lineHeight: 1.55 }}>
          ⚠️ Dit is <strong>geen beleggingsadvies</strong>. De fondsenlijst is een handmatig samengesteld startpunt
          (ISIN's geverifieerd juli 2026); classificaties zijn indicatief en worden door aanbieders soms herzien —
          controleer de actuele status in het prospectus. Zie ook de{' '}
          <a
            href="https://www.consumentenbond.nl/beleggen/zelf-beleggen/duurzame-beleggingsfondsen"
            target="_blank" rel="noreferrer" style={{ color: '#34d399' }}
          >
            Consumentenbond-test van duurzame beleggingsfondsen
          </a>{' '}
          voor rendementsvergelijkingen. Spreiding, kosten en je beleggingshorizon blijven leidend.
        </p>
      </div>
    </div>
  );
}
