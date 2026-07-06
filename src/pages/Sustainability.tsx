import { useMemo, useState } from 'react';
import { storage } from '../lib/storage';
import {
  scorePortfolio, suggestFunds, THEME_LABELS, LEVEL_LABELS, LEVEL_COLORS,
} from '../lib/sustainability';
import type { SustainTheme, SustainLevel, SfdrArticle } from '../lib/sustainability';
import type { Asset } from '../types';
import { formatCurrency } from '../lib/utils';

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

            {/* Thema-verdeling */}
            {score.byTheme.length > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                {score.byTheme.map(t => (
                  <span key={t.theme} style={{
                    fontSize: '0.72rem', color: '#67e8f9', background: 'rgba(6,182,212,0.1)',
                    border: '1px solid rgba(6,182,212,0.3)', padding: '0.2rem 0.6rem', borderRadius: '1rem',
                  }}>
                    {THEME_LABELS[t.theme]}: {formatCurrency(t.value)}
                  </span>
                ))}
              </div>
            )}

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
