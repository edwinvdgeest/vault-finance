import { useState } from 'react';
import { storage } from '../lib/storage';
import { getDefaultRulesWithIds } from '../lib/categorizer';
import { formatCurrency } from '../lib/utils';
import { CATEGORIES } from '../types';
import type { Rule } from '../types';

export default function Settings() {
  const [rules, setRules] = useState<Rule[]>(() => {
    const stored = storage.getRules();
    return stored.length > 0 ? stored : getDefaultRulesWithIds();
  });
  const [newPattern, setNewPattern] = useState('');
  const [newCategory, setNewCategory] = useState<string>(CATEGORIES[0]);
  const [btcAmount, setBtcAmount] = useState(() => {
    const a = storage.getAssets().find(a => a.type === 'bitcoin');
    return a ? String(a.amount) : '';
  });
  const [btcPrice, setBtcPrice] = useState(() => {
    const a = storage.getAssets().find(a => a.type === 'bitcoin');
    return a ? String(a.lastPrice) : '';
  });
  const [saved, setSaved] = useState('');

  function saveRules(updated: Rule[]) {
    setRules(updated);
    storage.setRules(updated);
  }

  function deleteRule(id: string) {
    saveRules(rules.filter(r => r.id !== id));
  }

  function addRule() {
    if (!newPattern.trim()) return;
    const rule: Rule = {
      id: `custom-${Date.now()}`,
      pattern: newPattern.trim(),
      category: newCategory,
      isCustom: true,
    };
    saveRules([rule, ...rules]);
    setNewPattern('');
  }

  function saveBtc() {
    const amount = parseFloat(btcAmount) || 0;
    const price = parseFloat(btcPrice) || 0;
    const assets = storage.getAssets().filter(a => a.type !== 'bitcoin');
    storage.setAssets([...assets, { type: 'bitcoin', amount, lastPrice: price, lastUpdated: new Date().toISOString() }]);
    setSaved('BTC opgeslagen');
    setTimeout(() => setSaved(''), 2000);
  }

  function exportData() {
    const data = storage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vault-finance-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        storage.importAll(data);
        setSaved('Backup geïmporteerd');
        setTimeout(() => setSaved(''), 2000);
      } catch {
        setSaved('Ongeldige backup');
        setTimeout(() => setSaved(''), 3000);
      }
    };
    reader.readAsText(file);
  }

  const sectionTitle: React.CSSProperties = {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '1rem',
  };

  const inputStyle: React.CSSProperties = {
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 720 }}>
      {saved && (
        <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '0.5rem', padding: '0.625rem 1rem', color: '#6ee7b7', fontSize: '0.875rem' }}>
          ✓ {saved}
        </div>
      )}

      {/* Bitcoin */}
      <div className="glass-card">
        <p style={sectionTitle}>Bitcoin</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Aantal BTC</label>
            <input
              type="number"
              step="0.00000001"
              className="glass-input"
              style={inputStyle}
              placeholder="0.0"
              value={btcAmount}
              onChange={e => setBtcAmount(e.target.value)}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Huidige koers (€)</label>
            <input
              type="number"
              className="glass-input"
              style={inputStyle}
              placeholder="0"
              value={btcPrice}
              onChange={e => setBtcPrice(e.target.value)}
            />
          </div>
        </div>
        {btcAmount && btcPrice && (
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.75rem' }}>
            Waarde: <span style={{ color: '#f59e0b', fontWeight: 600 }}>
              {formatCurrency((parseFloat(btcAmount) || 0) * (parseFloat(btcPrice) || 0))}
            </span>
          </p>
        )}
        <button
          className="glass-button"
          style={{ fontFamily: 'inherit', padding: '0.5rem 1.25rem', fontSize: '0.875rem', fontWeight: 600, background: 'rgba(139,92,246,0.2)', borderColor: 'rgba(139,92,246,0.4)', color: 'white' }}
          onClick={saveBtc}
        >
          Opslaan
        </button>
      </div>

      {/* Category rules */}
      <div className="glass-card">
        <p style={sectionTitle}>Categorieregels</p>

        {/* Add rule */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <input
            className="glass-input"
            style={{ ...inputStyle, flex: 1 }}
            placeholder="Patroon (regex of tekst)"
            value={newPattern}
            onChange={e => setNewPattern(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addRule()}
          />
          <select
            className="glass-input"
            style={{ ...inputStyle, width: 160 }}
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            className="glass-button"
            style={{ fontFamily: 'inherit', padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 600, whiteSpace: 'nowrap', background: 'rgba(139,92,246,0.2)', borderColor: 'rgba(139,92,246,0.4)', color: 'white' }}
            onClick={addRule}
          >
            + Toevoegen
          </button>
        </div>

        {/* Rules list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          {rules.map(rule => (
            <div
              key={rule.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0.875rem',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flex: 1, minWidth: 0 }}>
                <code style={{ fontSize: '0.8rem', color: '#c4b5fd', background: 'rgba(139,92,246,0.1)', padding: '0.125rem 0.375rem', borderRadius: '0.25rem', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {rule.pattern}
                </code>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>→ {rule.category}</span>
                {rule.isCustom && (
                  <span style={{ fontSize: '0.7rem', color: '#06b6d4', background: 'rgba(6,182,212,0.1)', padding: '0.1rem 0.4rem', borderRadius: '0.75rem', border: '1px solid rgba(6,182,212,0.2)' }}>
                    eigen
                  </span>
                )}
              </div>
              <button
                onClick={() => deleteRule(rule.id)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1rem', padding: '0.25rem', lineHeight: 1, transition: 'color 0.15s' }}
                title="Verwijder regel"
                onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Export / Import */}
      <div className="glass-card">
        <p style={sectionTitle}>Data</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            className="glass-button"
            style={{ fontFamily: 'inherit', padding: '0.5rem 1.25rem', fontSize: '0.875rem' }}
            onClick={exportData}
          >
            Export backup (JSON)
          </button>
          <label
            style={{
              display: 'inline-block',
              padding: '0.5rem 1.25rem',
              fontSize: '0.875rem',
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            Import backup (JSON)
            <input type="file" accept=".json" style={{ display: 'none' }} onChange={importData} />
          </label>
        </div>
      </div>
    </div>
  );
}
