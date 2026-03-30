import { useState } from 'react';
import { storage } from '../lib/storage';
import { getDefaultRulesWithIds } from '../lib/categorizer';
import { formatCurrency } from '../lib/utils';
import { CATEGORIES } from '../types';
import type { Asset, Rule } from '../types';

const KNOWN_COINS: { type: string; symbol: string; name: string }[] = [
  { type: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
  { type: 'bitcoin-cash', symbol: 'BCH', name: 'Bitcoin Cash' },
  { type: 'bitcoin-cash-sv', symbol: 'BCHSV', name: 'Bitcoin SV' },
  { type: 'ecash', symbol: 'XEC', name: 'eCash' },
  { type: 'apenft', symbol: 'NFT', name: 'APENFT' },
  { type: 'tether', symbol: 'USDT', name: 'Tether' },
];

interface CryptoEdit {
  type: string;
  symbol: string;
  name: string;
  amount: string;
  purchasePrice: string;
}

function assetToEdit(a: Asset): CryptoEdit {
  return {
    type: a.type,
    symbol: a.symbol || (a.type === 'bitcoin' ? 'BTC' : a.type.toUpperCase().replace(/-/g, '')),
    name: a.name || (a.type === 'bitcoin' ? 'Bitcoin' : a.type),
    amount: String(a.amount || ''),
    purchasePrice: a.purchasePrice != null ? String(a.purchasePrice) : '',
  };
}

export default function Settings() {
  const [rules, setRules] = useState<Rule[]>(() => {
    const stored = storage.getRules();
    return stored.length > 0 ? stored : getDefaultRulesWithIds();
  });
  const [newPattern, setNewPattern] = useState('');
  const [newCategory, setNewCategory] = useState<string>(CATEGORIES[0]);

  const [cryptoHoldings, setCryptoHoldings] = useState<CryptoEdit[]>(() =>
    storage.getAssets().map(assetToEdit),
  );
  const [newCoinType, setNewCoinType] = useState(KNOWN_COINS[0].type);

  const [saved, setSaved] = useState('');

  function showSaved(msg: string) {
    setSaved(msg);
    setTimeout(() => setSaved(''), 2000);
  }

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

  function updateHolding(idx: number, field: keyof CryptoEdit, value: string) {
    setCryptoHoldings(prev => prev.map((h, i) => i === idx ? { ...h, [field]: value } : h));
  }

  function removeHolding(idx: number) {
    setCryptoHoldings(prev => prev.filter((_, i) => i !== idx));
  }

  function addCoin() {
    const coin = KNOWN_COINS.find(c => c.type === newCoinType);
    if (!coin) return;
    if (cryptoHoldings.some(h => h.type === newCoinType)) {
      showSaved('Coin bestaat al in de lijst');
      return;
    }
    setCryptoHoldings(prev => [...prev, { type: coin.type, symbol: coin.symbol, name: coin.name, amount: '', purchasePrice: '' }]);
  }

  function saveCrypto() {
    const now = new Date().toISOString();
    const existing = storage.getAssets();
    const assets: Asset[] = cryptoHoldings
      .filter(h => h.amount !== '' && !isNaN(parseFloat(h.amount)))
      .map(h => {
        const prev = existing.find(a => a.type === h.type);
        const purchasePrice = h.purchasePrice !== '' ? parseFloat(h.purchasePrice) : undefined;
        const currentPrice = prev?.currentPrice ?? prev?.lastPrice ?? 0;
        return {
          type: h.type,
          symbol: h.symbol,
          name: h.name,
          amount: parseFloat(h.amount),
          purchasePrice,
          currentPrice,
          lastPrice: currentPrice,
          lastUpdated: prev?.lastUpdated ?? now,
        };
      });
    storage.setAssets(assets);
    showSaved('Crypto portfolio opgeslagen');
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
        showSaved('Backup geïmporteerd');
        if (data.assets) {
          setCryptoHoldings(data.assets.map(assetToEdit));
        }
      } catch {
        showSaved('Ongeldige backup');
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

      {/* Crypto Portfolio */}
      <div className="glass-card">
        <p style={sectionTitle}>Crypto portfolio</p>

        {/* Holdings list */}
        {cryptoHoldings.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
            <div className="crypto-holding-header" style={{ display: 'grid', gridTemplateColumns: '3.5rem 1fr 1fr 1fr 2rem', gap: '0.5rem', alignItems: 'center', padding: '0 0.25rem', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Coin</span>
              <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Naam</span>
              <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Aantal</span>
              <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Aankoopprijs (€)</span>
              <span />
            </div>
            {cryptoHoldings.map((h, idx) => (
              <div key={h.type} className="crypto-holding-row" style={{ display: 'grid', gridTemplateColumns: '3.5rem 1fr 1fr 1fr 2rem', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: '#c4b5fd',
                  background: 'rgba(139,92,246,0.15)',
                  padding: '0.2rem 0.35rem',
                  borderRadius: '0.25rem',
                  textAlign: 'center',
                  alignSelf: 'center',
                }}>
                  {h.symbol}
                </span>
                <div>
                  <span className="crypto-name-label" style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>{h.name}</span>
                  {/* Mobile: inputs stacked under name */}
                  <div className="crypto-inputs-mobile" style={{ display: 'none', gap: '0.5rem', marginTop: '0.4rem' }}>
                    <input
                      type="number"
                      step="any"
                      className="glass-input"
                      style={{ ...inputStyle, padding: '0.375rem 0.5rem', fontSize: '0.875rem', flex: 1 }}
                      placeholder="Aantal"
                      value={h.amount}
                      onChange={e => updateHolding(idx, 'amount', e.target.value)}
                    />
                    <input
                      type="number"
                      step="any"
                      className="glass-input"
                      style={{ ...inputStyle, padding: '0.375rem 0.5rem', fontSize: '0.875rem', flex: 1 }}
                      placeholder="Aankoopprijs €"
                      value={h.purchasePrice}
                      onChange={e => updateHolding(idx, 'purchasePrice', e.target.value)}
                    />
                  </div>
                </div>
                {/* Desktop: separate input columns */}
                <input
                  type="number"
                  step="any"
                  className="glass-input crypto-input-desktop"
                  style={{ ...inputStyle, padding: '0.375rem 0.5rem', fontSize: '0.8rem' }}
                  placeholder="0"
                  value={h.amount}
                  onChange={e => updateHolding(idx, 'amount', e.target.value)}
                />
                <input
                  type="number"
                  step="any"
                  className="glass-input crypto-input-desktop"
                  style={{ ...inputStyle, padding: '0.375rem 0.5rem', fontSize: '0.8rem' }}
                  placeholder="optioneel"
                  value={h.purchasePrice}
                  onChange={e => updateHolding(idx, 'purchasePrice', e.target.value)}
                />
                <button
                  onClick={() => removeHolding(idx)}
                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.25rem', padding: '0.25rem', lineHeight: 1, minHeight: 44, minWidth: 44, transition: 'color 0.15s' }}
                  title="Verwijder"
                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}
                >
                  ×
                </button>
              </div>
            ))}
            {/* Preview total */}
            {cryptoHoldings.some(h => h.amount && h.purchasePrice) && (
              <div style={{ marginTop: '0.25rem', padding: '0 0.25rem' }}>
                {cryptoHoldings.filter(h => h.amount && h.purchasePrice).map(h => (
                  <p key={h.type} style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '0.15rem 0' }}>
                    {h.symbol}: {h.amount} × {formatCurrency(parseFloat(h.purchasePrice) || 0)} kostprijs =
                    <span style={{ color: '#f59e0b', fontWeight: 600 }}> {formatCurrency((parseFloat(h.amount) || 0) * (parseFloat(h.purchasePrice) || 0))}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Add coin */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
          <select
            className="glass-input"
            style={{ ...inputStyle, flex: 1 }}
            value={newCoinType}
            onChange={e => setNewCoinType(e.target.value)}
          >
            {KNOWN_COINS.filter(c => !cryptoHoldings.some(h => h.type === c.type)).map(c => (
              <option key={c.type} value={c.type}>{c.symbol} – {c.name}</option>
            ))}
          </select>
          <button
            className="glass-button"
            style={{ fontFamily: 'inherit', padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 600, whiteSpace: 'nowrap', background: 'rgba(6,182,212,0.15)', borderColor: 'rgba(6,182,212,0.3)', color: 'white' }}
            onClick={addCoin}
          >
            + Coin toevoegen
          </button>
        </div>

        <button
          className="glass-button"
          style={{ fontFamily: 'inherit', padding: '0.5rem 1.25rem', fontSize: '0.875rem', fontWeight: 600, background: 'rgba(139,92,246,0.2)', borderColor: 'rgba(139,92,246,0.4)', color: 'white' }}
          onClick={saveCrypto}
        >
          Opslaan
        </button>
      </div>

      {/* Category rules */}
      <div className="glass-card">
        <p style={sectionTitle}>Categorieregels</p>

        {/* Add rule */}
        <div className="add-rule-form" style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
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
            style={{ ...inputStyle, minWidth: 140 }}
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            className="glass-button"
            style={{ fontFamily: 'inherit', padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 600, whiteSpace: 'nowrap', background: 'rgba(139,92,246,0.2)', borderColor: 'rgba(139,92,246,0.4)', color: 'white', minHeight: 44 }}
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
