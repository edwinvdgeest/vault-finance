import { useState } from 'react';
import type { Scenario, ScenarioEvent, ScenarioEventKind } from '../types';
import { formatCurrency } from '../lib/utils';

interface Props {
  scenarios: Scenario[];
  activeId: string | null;
  compareIds: string[];
  compareMode: boolean;
  onScenariosChange: (scenarios: Scenario[]) => void;
  onActiveChange: (id: string | null) => void;
  onCompareChange: (ids: string[]) => void;
  onCompareModeChange: (b: boolean) => void;
}

const PRESET_COLORS = ['#06b6d4', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#ec4899'];

const MAX_COMPARE = 3;

function nextJulyYM(): string {
  const now = new Date();
  const y = now.getMonth() < 6 ? now.getFullYear() : now.getFullYear() + 1;
  return `${y}-07`;
}

function monthOffsetYM(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function yearOffsetYM(years: number, month = 1): string {
  const now = new Date();
  return `${now.getFullYear() + years}-${String(month).padStart(2, '0')}`;
}

type Preset = {
  key: string;
  emoji: string;
  label: string;
  build: () => Omit<ScenarioEvent, 'id'>;
};

const PRESETS: Preset[] = [
  {
    key: 'vacation',
    emoji: '🏖',
    label: 'Vakantie',
    build: () => ({ label: 'Vakantie', kind: 'oneOff', amount: -3000, startMonth: nextJulyYM() }),
  },
  {
    key: 'home',
    emoji: '🏠',
    label: 'Verbouwing',
    build: () => ({ label: 'Verbouwing', kind: 'oneOff', amount: -25000, startMonth: monthOffsetYM(6) }),
  },
  {
    key: 'sabbatical',
    emoji: '🌏',
    label: 'Sabbatical',
    build: () => ({ label: 'Sabbatical', kind: 'recurring', amount: -4000, startMonth: yearOffsetYM(2), endMonth: yearOffsetYM(3, 12) }),
  },
  {
    key: 'bonus',
    emoji: '💰',
    label: 'Extra inkomen',
    build: () => ({ label: 'Extra inkomen', kind: 'oneOff', amount: 1000, startMonth: monthOffsetYM(1) }),
  },
];

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function ScenarioEditor({
  scenarios, activeId, compareIds, compareMode,
  onScenariosChange, onActiveChange, onCompareChange, onCompareModeChange,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(scenarios[0]?.id ?? null);
  const [draftLabel, setDraftLabel] = useState<string>('');
  const [draftKind, setDraftKind] = useState<ScenarioEventKind>('oneOff');
  const [draftAmount, setDraftAmount] = useState<number>(-1000);
  const [draftStart, setDraftStart] = useState<string>(monthOffsetYM(1));
  const [draftEnd, setDraftEnd] = useState<string>(monthOffsetYM(3));
  const [formOpen, setFormOpen] = useState(false);

  const selected = scenarios.find(s => s.id === selectedId) ?? null;

  function saveScenarios(next: Scenario[]) {
    onScenariosChange(next);
  }

  function createScenario() {
    const id = makeId('scn');
    const color = PRESET_COLORS[scenarios.length % PRESET_COLORS.length];
    const scenario: Scenario = {
      id,
      label: `Scenario ${scenarios.length + 1}`,
      events: [],
      color,
      createdAt: new Date().toISOString(),
    };
    saveScenarios([...scenarios, scenario]);
    setSelectedId(id);
  }

  function renameScenario(id: string, label: string) {
    saveScenarios(scenarios.map(s => (s.id === id ? { ...s, label } : s)));
  }

  function deleteScenario(id: string) {
    if (!confirm('Scenario verwijderen?')) return;
    const next = scenarios.filter(s => s.id !== id);
    saveScenarios(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
    if (activeId === id) onActiveChange(null);
    if (compareIds.includes(id)) onCompareChange(compareIds.filter(x => x !== id));
  }

  function applyPreset(preset: Preset) {
    const build = preset.build();
    setDraftLabel(build.label);
    setDraftKind(build.kind);
    setDraftAmount(build.amount);
    setDraftStart(build.startMonth);
    if (build.endMonth) setDraftEnd(build.endMonth);
    setFormOpen(true);
  }

  function addEventToSelected() {
    if (!selected || !draftLabel.trim()) return;
    const ev: ScenarioEvent = {
      id: makeId('ev'),
      label: draftLabel.trim(),
      kind: draftKind,
      amount: draftAmount,
      startMonth: draftStart,
      ...(draftKind === 'recurring' ? { endMonth: draftEnd } : {}),
    };
    saveScenarios(scenarios.map(s => (s.id === selected.id ? { ...s, events: [...s.events, ev] } : s)));
    setFormOpen(false);
    setDraftLabel('');
  }

  function deleteEvent(scenarioId: string, eventId: string) {
    saveScenarios(scenarios.map(s => (s.id === scenarioId ? { ...s, events: s.events.filter(e => e.id !== eventId) } : s)));
  }

  function toggleCompare(id: string) {
    if (compareIds.includes(id)) {
      onCompareChange(compareIds.filter(x => x !== id));
    } else if (compareIds.length < MAX_COMPARE) {
      onCompareChange([...compareIds, id]);
    }
  }

  const cardStyle: React.CSSProperties = {
    padding: '1rem',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '0.5rem',
  };

  const inputStyle: React.CSSProperties = {
    padding: '0.35rem 0.55rem',
    fontSize: '0.8rem',
    background: 'rgba(0,0,0,0.25)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '0.375rem',
    color: '#cbd5e1',
    fontFamily: 'inherit',
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }} className="grid-halves">
      {/* Left column — scenario list */}
      <div className="glass-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
            Scenario's
          </p>
          <button onClick={createScenario} className="glass-button"
            style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem', fontFamily: 'inherit', fontWeight: 600, color: '#c4b5fd', cursor: 'pointer' }}>
            + Nieuw
          </button>
        </div>

        {/* Compare mode toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none', fontSize: '0.75rem', color: '#94a3b8' }}>
          <input type="checkbox" checked={compareMode} onChange={e => onCompareModeChange(e.target.checked)}
            style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#8b5cf6' }} />
          Vergelijk meerdere scenario's
        </label>

        {scenarios.length === 0 && (
          <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>
            Nog geen scenario's. Klik "+ Nieuw" om er één te maken.
          </p>
        )}

        {scenarios.map(s => {
          const isSelected = selectedId === s.id;
          const isActive = activeId === s.id;
          const inCompare = compareIds.includes(s.id);
          return (
            <div key={s.id} style={{
              ...cardStyle,
              cursor: 'pointer',
              borderColor: isSelected ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.08)',
              background: isSelected ? 'rgba(139,92,246,0.08)' : cardStyle.background,
            }} onClick={() => setSelectedId(s.id)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.color ?? '#8b5cf6', flexShrink: 0 }} />
                <input
                  value={s.label}
                  onChange={e => renameScenario(s.id, e.target.value)}
                  onClick={e => e.stopPropagation()}
                  style={{
                    flex: 1, background: 'transparent', border: 'none', color: '#cbd5e1',
                    fontSize: '0.85rem', fontWeight: 600, fontFamily: 'inherit', padding: 0, minWidth: 0,
                  }}
                />
                <button
                  onClick={e => { e.stopPropagation(); deleteScenario(s.id); }}
                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}
                  title="Verwijder scenario"
                >×</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{s.events.length} event{s.events.length === 1 ? '' : 's'}</span>
                {isActive && !compareMode && (
                  <span style={{ fontSize: '0.65rem', color: '#c4b5fd', background: 'rgba(139,92,246,0.15)', padding: '0.1rem 0.4rem', borderRadius: '0.375rem' }}>
                    ACTIEF
                  </span>
                )}
                {compareMode && inCompare && (
                  <span style={{ fontSize: '0.65rem', color: '#06b6d4', background: 'rgba(6,182,212,0.15)', padding: '0.1rem 0.4rem', borderRadius: '0.375rem' }}>
                    IN VERGELIJKING
                  </span>
                )}
              </div>
              <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.35rem' }} onClick={e => e.stopPropagation()}>
                {compareMode ? (
                  <button
                    onClick={() => toggleCompare(s.id)}
                    disabled={!inCompare && compareIds.length >= MAX_COMPARE}
                    style={{
                      flex: 1, padding: '0.3rem 0.6rem', fontSize: '0.7rem', fontWeight: 600,
                      background: inCompare ? 'rgba(6,182,212,0.2)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${inCompare ? 'rgba(6,182,212,0.5)' : 'rgba(255,255,255,0.1)'}`,
                      borderRadius: '0.375rem',
                      color: inCompare ? '#67e8f9' : '#94a3b8',
                      cursor: !inCompare && compareIds.length >= MAX_COMPARE ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      opacity: !inCompare && compareIds.length >= MAX_COMPARE ? 0.5 : 1,
                    }}
                  >
                    {inCompare ? '✓ in vergelijking' : '+ vergelijk'}
                  </button>
                ) : (
                  <button
                    onClick={() => onActiveChange(isActive ? null : s.id)}
                    style={{
                      flex: 1, padding: '0.3rem 0.6rem', fontSize: '0.7rem', fontWeight: 600,
                      background: isActive ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${isActive ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.1)'}`,
                      borderRadius: '0.375rem',
                      color: isActive ? '#c4b5fd' : '#94a3b8',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {isActive ? '✓ actief' : 'activeer'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Right column — events of selected scenario */}
      <div className="glass-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {!selected ? (
          <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
            Selecteer een scenario links of maak een nieuwe aan om events toe te voegen.
          </p>
        ) : (
          <>
            <div>
              <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0, marginBottom: '0.5rem' }}>
                Events in "{selected.label}"
              </p>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                {PRESETS.map(p => (
                  <button key={p.key} onClick={() => applyPreset(p)}
                    style={{
                      padding: '0.35rem 0.7rem', fontSize: '0.75rem', fontWeight: 600,
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '0.375rem', color: '#cbd5e1', cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                    {p.emoji} {p.label}
                  </button>
                ))}
                <button onClick={() => { setFormOpen(true); setDraftLabel(''); setDraftKind('oneOff'); setDraftAmount(-1000); setDraftStart(monthOffsetYM(1)); }}
                  style={{
                    padding: '0.35rem 0.7rem', fontSize: '0.75rem', fontWeight: 600,
                    background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)',
                    borderRadius: '0.375rem', color: '#c4b5fd', cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                  + Event
                </button>
              </div>
            </div>

            {/* Inline event form */}
            {formOpen && (
              <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input
                  value={draftLabel}
                  onChange={e => setDraftLabel(e.target.value)}
                  placeholder="Label (bv. Vakantie Baskenland)"
                  style={inputStyle}
                />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select value={draftKind} onChange={e => setDraftKind(e.target.value as ScenarioEventKind)} style={{ ...inputStyle, flex: 1 }}>
                    <option value="oneOff">Eenmalig</option>
                    <option value="recurring">Terugkerend (bereik)</option>
                  </select>
                  <input
                    type="number"
                    value={draftAmount}
                    onChange={e => setDraftAmount(parseFloat(e.target.value) || 0)}
                    placeholder="Bedrag"
                    style={{ ...inputStyle, flex: 1 }}
                    step={100}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', marginBottom: '0.2rem' }}>
                      {draftKind === 'recurring' ? 'Vanaf' : 'Maand'}
                    </label>
                    <input type="month" value={draftStart} onChange={e => setDraftStart(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
                  </div>
                  {draftKind === 'recurring' && (
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', marginBottom: '0.2rem' }}>Tot en met</label>
                      <input type="month" value={draftEnd} onChange={e => setDraftEnd(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button onClick={() => setFormOpen(false)}
                    style={{ padding: '0.35rem 0.8rem', fontSize: '0.75rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.375rem', color: '#94a3b8', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Annuleer
                  </button>
                  <button onClick={addEventToSelected} disabled={!draftLabel.trim()}
                    style={{
                      padding: '0.35rem 0.8rem', fontSize: '0.75rem', fontWeight: 600,
                      background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.5)',
                      borderRadius: '0.375rem', color: '#c4b5fd',
                      cursor: draftLabel.trim() ? 'pointer' : 'not-allowed',
                      opacity: draftLabel.trim() ? 1 : 0.5,
                      fontFamily: 'inherit',
                    }}>
                    Opslaan
                  </button>
                </div>
              </div>
            )}

            {/* Event list */}
            {selected.events.length === 0 && !formOpen && (
              <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>
                Nog geen events. Gebruik een preset of "+ Event".
              </p>
            )}
            {selected.events.map(ev => {
              const isExpense = ev.amount < 0;
              return (
                <div key={ev.id} style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0' }}>{ev.label}</span>
                      <span style={{
                        fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '0.375rem',
                        background: ev.kind === 'recurring' ? 'rgba(245,158,11,0.15)' : 'rgba(139,92,246,0.15)',
                        color: ev.kind === 'recurring' ? '#fbbf24' : '#c4b5fd',
                      }}>
                        {ev.kind === 'recurring' ? 'BEREIK' : 'EENMALIG'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.2rem' }}>
                      {ev.kind === 'recurring' ? `${ev.startMonth} → ${ev.endMonth ?? ev.startMonth}` : ev.startMonth}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: isExpense ? '#f87171' : '#10b981' }}>
                    {isExpense ? '-' : '+'}{formatCurrency(Math.abs(ev.amount))}
                    {ev.kind === 'recurring' && <span style={{ fontSize: '0.65rem', color: '#64748b', marginLeft: '0.25rem' }}>/mnd</span>}
                  </div>
                  <button onClick={() => deleteEvent(selected.id, ev.id)}
                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}
                    title="Verwijder event"
                  >×</button>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
