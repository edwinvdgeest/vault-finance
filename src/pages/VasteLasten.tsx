import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { storage } from '../lib/storage';
import { getFixedVsVariableSplit, intervalLabel, type RecurringItem } from '../lib/recurring';
import { formatCurrency, formatDate } from '../lib/utils';
import type { RecurringOverride } from '../types';

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

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      style={{
        fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '1rem', whiteSpace: 'nowrap',
        background: active ? 'rgba(16,185,129,0.12)' : 'rgba(148,163,184,0.15)',
        color: active ? '#10b981' : '#94a3b8',
      }}
    >
      {active ? 'actief' : 'gestopt'}
    </span>
  );
}

function CadenceBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        fontSize: '0.65rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '1rem',
        background: 'rgba(148,163,184,0.1)', color: '#94a3b8', whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

function PriceChangeBadge({ item }: { item: RecurringItem }) {
  if (!item.priceChange || item.priceChange.direction === 'none' || item.count < 3) return null;
  const up = item.priceChange.direction === 'up';
  return (
    <span
      title={`${formatCurrency(item.priceChange.priorMedian)} → ${formatCurrency(item.priceChange.latestAmount)}`}
      style={{ fontSize: '0.72rem', fontWeight: 700, color: up ? '#ef4444' : '#10b981', whiteSpace: 'nowrap' }}
    >
      {up ? '↑' : '↓'} {item.priceChange.pctChange > 0 ? '+' : ''}{item.priceChange.pctChange}%
    </span>
  );
}

const actionBtnStyle: React.CSSProperties = {
  fontSize: '0.68rem', fontWeight: 600, color: '#8b5cf6', background: 'none', border: 'none',
  cursor: 'pointer', padding: '0.15rem 0.4rem', borderRadius: '0.3rem', whiteSpace: 'nowrap', fontFamily: 'inherit',
};

function ItemRow({
  item, onClick, onDismiss, onToggleStopped, onRestore,
}: {
  item: RecurringItem;
  onClick: () => void;
  onDismiss?: () => void;
  onToggleStopped?: () => void;
  onRestore?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem',
        padding: '0.5rem 0.75rem', cursor: 'pointer', transition: 'background 0.15s',
        background: 'rgba(255,255,255,0.03)', borderRadius: '0.5rem',
        border: '1px solid rgba(255,255,255,0.05)',
        opacity: item.active ? 1 : 0.6,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.displayName}
        </div>
        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{item.category}</div>
      </div>
      <CadenceBadge label={intervalLabel(item.interval)} />
      <div style={{ fontSize: '0.72rem', color: '#64748b', whiteSpace: 'nowrap', minWidth: '7rem', textAlign: 'right' }}>
        {item.active ? `volgende: ${formatDate(item.nextExpectedDate)}` : `gestopt sinds ${formatDate(item.lastDate)}`}
      </div>
      <StatusBadge active={item.active} />
      <PriceChangeBadge item={item} />
      <div style={{ textAlign: 'right', whiteSpace: 'nowrap', minWidth: '4.5rem' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ef4444' }}>{formatCurrency(item.monthly)}</div>
        <div style={{ fontSize: '0.65rem', color: '#64748b' }}>{item.count}×</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.1rem' }}>
        {onRestore && (
          <button onClick={e => { e.stopPropagation(); onRestore(); }} style={actionBtnStyle}>
            Herstel
          </button>
        )}
        {onToggleStopped && (
          <button
            onClick={e => { e.stopPropagation(); onToggleStopped(); }}
            style={actionBtnStyle}
            title={item.active ? 'Forceer status "gestopt", ongeacht de detectie' : 'Verwijder de handmatige "gestopt"-markering'}
          >
            {item.active ? 'Markeer gestopt' : 'Markeer actief'}
          </button>
        )}
        {onDismiss && (
          <button onClick={e => { e.stopPropagation(); onDismiss(); }} style={actionBtnStyle} title="Geen echte vaste last — overal verbergen">
            Geen vaste last
          </button>
        )}
      </div>
    </div>
  );
}

export default function VasteLasten() {
  const navigate = useNavigate();
  const [showStopped, setShowStopped] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [, forceUpdate] = useState(0);

  const transactions = storage.getTransactions();
  const overrides = storage.getRecurringOverrides();
  const split = getFixedVsVariableSplit(transactions, overrides);

  const active = split.items.filter(r => r.active).sort((a, b) => b.monthly - a.monthly);
  const stopped = split.items.filter(r => !r.active).sort((a, b) => b.monthly - a.monthly);
  const dismissed = split.dismissedItems.sort((a, b) => b.monthly - a.monthly);
  const priceChanges = active.filter(r => r.priceChange && r.priceChange.direction !== 'none' && r.count >= 3);

  function setOverride(key: string, patch: Partial<RecurringOverride>) {
    const existing = storage.getRecurringOverrides();
    const idx = existing.findIndex(o => o.key === key);
    const merged: RecurringOverride = { ...(idx >= 0 ? existing[idx] : { key }), ...patch };
    const isDefault = !merged.dismissed && !merged.markedStopped;
    const next = isDefault
      ? existing.filter(o => o.key !== key)
      : idx >= 0
        ? existing.map(o => (o.key === key ? merged : o))
        : [...existing, merged];
    storage.setRecurringOverrides(next);
    forceUpdate(n => n + 1);
  }

  const goToMerchant = (item: RecurringItem) => {
    navigate(`/transactions?${new URLSearchParams({ search: item.displayName }).toString()}`);
  };

  const totalSplit = split.fixedMonthly + split.variableMonthly;
  const fixedBarPct = totalSplit > 0 ? (split.fixedMonthly / totalSplit) * 100 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <GlassCard>
        <SectionTitle>Vaste vs. variabele lasten</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444' }}>
              {formatCurrency(split.fixedMonthly)}
              <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#64748b' }}>/mnd</span>
            </div>
            <span
              style={{
                fontSize: '0.8rem', fontWeight: 600, color: '#ef4444',
                background: 'rgba(239,68,68,0.1)', padding: '0.15rem 0.5rem', borderRadius: '1rem',
              }}
            >
              Vast · {split.fixedPct}%
            </span>
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b' }}>
              {formatCurrency(split.variableMonthly)}
              <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#64748b' }}>/mnd</span>
            </div>
            <span
              style={{
                fontSize: '0.8rem', fontWeight: 600, color: '#f59e0b',
                background: 'rgba(245,158,11,0.1)', padding: '0.15rem 0.5rem', borderRadius: '1rem',
              }}
            >
              Variabel · {split.variablePct}%
            </span>
          </div>
        </div>
        <div style={{ height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex', marginTop: '1rem' }}>
          <div style={{ width: `${fixedBarPct}%`, background: '#ef4444' }} />
          <div style={{ width: `${100 - fixedBarPct}%`, background: '#f59e0b' }} />
        </div>
      </GlassCard>

      <GlassCard>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <SectionTitle>Actieve vaste lasten</SectionTitle>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ef4444' }}>{formatCurrency(split.fixedMonthly)}/mnd</span>
        </div>
        {active.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {active.map(item => (
              <ItemRow
                key={item.key}
                item={item}
                onClick={() => goToMerchant(item)}
                onDismiss={() => setOverride(item.key, { dismissed: true })}
                onToggleStopped={() => setOverride(item.key, { markedStopped: true })}
              />
            ))}
          </div>
        ) : (
          <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Nog geen vaste lasten gevonden</p>
        )}
      </GlassCard>

      {priceChanges.length > 0 && (
        <GlassCard>
          <SectionTitle>Prijswijzigingen</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {priceChanges.map(item => (
              <ItemRow
                key={item.key}
                item={item}
                onClick={() => goToMerchant(item)}
                onDismiss={() => setOverride(item.key, { dismissed: true })}
                onToggleStopped={() => setOverride(item.key, { markedStopped: true })}
              />
            ))}
          </div>
        </GlassCard>
      )}

      {stopped.length > 0 && (
        <GlassCard>
          <button
            onClick={() => setShowStopped(s => !s)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
              padding: '0.5rem 0.875rem', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
              borderRadius: '0.5rem', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                style={{
                  fontSize: '0.7rem', color: '#c4b5fd', display: 'inline-block',
                  transform: showStopped ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s',
                }}
              >
                ▶
              </span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0' }}>
                Gestopte abonnementen ({stopped.length})
              </span>
            </div>
          </button>
          {showStopped && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.625rem' }}>
              {stopped.map(item => (
                <ItemRow
                  key={item.key}
                  item={item}
                  onClick={() => goToMerchant(item)}
                  onDismiss={() => setOverride(item.key, { dismissed: true })}
                  onToggleStopped={() => setOverride(item.key, { markedStopped: false })}
                />
              ))}
            </div>
          )}
        </GlassCard>
      )}

      {dismissed.length > 0 && (
        <GlassCard>
          <button
            onClick={() => setShowDismissed(s => !s)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
              padding: '0.5rem 0.875rem', background: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.2)',
              borderRadius: '0.5rem', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                style={{
                  fontSize: '0.7rem', color: '#94a3b8', display: 'inline-block',
                  transform: showDismissed ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s',
                }}
              >
                ▶
              </span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0' }}>
                Genegeerd — geen vaste last ({dismissed.length})
              </span>
            </div>
          </button>
          {showDismissed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.625rem' }}>
              {dismissed.map(item => (
                <ItemRow
                  key={item.key}
                  item={item}
                  onClick={() => goToMerchant(item)}
                  onRestore={() => setOverride(item.key, { dismissed: false })}
                />
              ))}
            </div>
          )}
        </GlassCard>
      )}
    </div>
  );
}
