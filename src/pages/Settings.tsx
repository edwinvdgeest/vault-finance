import { useState, useRef } from 'react';
import { storage } from '../lib/storage';
import { getDefaultRulesWithIds } from '../lib/categorizer';
import { formatCurrency } from '../lib/utils';
import { CATEGORIES } from '../types';
import type { Rule } from '../types';

export default function Settings() {
  const [, forceUpdate] = useState(0);
  const [newPattern, setNewPattern] = useState('');
  const [newCategory, setNewCategory] = useState<string>(CATEGORIES[0]);
  const [btcAmount, setBtcAmount] = useState('');
  const [btcPrice, setBtcPrice] = useState<number | null>(null);
  const [btcLoading, setBtcLoading] = useState(false);
  const [exportMsg, setExportMsg] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  const rules = storage.getRules();
  const assets = storage.getAssets();
  const btcAsset = assets.find(a => a.type === 'bitcoin');

  function refresh() {
    forceUpdate(n => n + 1);
  }

  // Rules
  function addRule() {
    if (!newPattern.trim()) return;
    const existing = storage.getRules();
    const id = `custom-${Date.now()}`;
    storage.setRules([...existing, { id, pattern: newPattern.trim(), category: newCategory, isCustom: true }]);
    setNewPattern('');
    refresh();
  }

  function deleteRule(id: string) {
    storage.setRules(storage.getRules().filter(r => r.id !== id));
    refresh();
  }

  function resetRules() {
    storage.setRules(getDefaultRulesWithIds());
    refresh();
  }

  // Bitcoin
  function fetchBtcPrice() {
    setBtcLoading(true);
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur')
      .then(r => r.json())
      .then((data: { bitcoin: { eur: number } }) => {
        setBtcPrice(data.bitcoin.eur);
        setBtcLoading(false);
      })
      .catch(() => setBtcLoading(false));
  }

  function saveBtc() {
    const amount = parseFloat(btcAmount);
    if (isNaN(amount)) return;
    const price = btcPrice ?? btcAsset?.lastPrice ?? 0;
    const updated = assets.filter(a => a.type !== 'bitcoin');
    storage.setAssets([
      ...updated,
      { type: 'bitcoin', amount, lastPrice: price, lastUpdated: new Date().toISOString() },
    ]);
    refresh();
  }

  // Backup
  function exportData() {
    const data = storage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vault-finance-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportMsg('Backup gedownload.');
    setTimeout(() => setExportMsg(''), 3000);
  }

  function importData(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        storage.importAll(data);
        refresh();
        setExportMsg('Data hersteld.');
        setTimeout(() => setExportMsg(''), 3000);
      } catch {
        setExportMsg('Fout bij importeren.');
      }
    };
    reader.readAsText(file);
  }

  function clearAll() {
    if (!confirm('Weet je zeker dat je alle data wilt verwijderen?')) return;
    storage.setTransactions([]);
    storage.setAccounts([]);
    storage.setRules([]);
    storage.setAssets([]);
    refresh();
  }

  const allRules: Rule[] = rules.length > 0 ? rules : getDefaultRulesWithIds();

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Instellingen</h1>

      {/* Category rules */}
      <section className="glass-card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Categorieregels</h2>
          <button
            onClick={resetRules}
            className="glass-button"
            style={{ padding: '0.375rem 0.75rem', fontSize: '0.78rem', fontFamily: 'inherit' }}
          >
            Reset naar standaard
          </button>
        </div>

        {/* Add rule */}
        <div style={{ display: 'flex', gap: '0.625rem', marginBottom: '1rem' }}>
          <input
            className="glass-input"
            style={{ flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
            placeholder="Zoekpatroon (regex)"
            value={newPattern}
            onChange={e => setNewPattern(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addRule()}
          />
          <select
            className="glass-input"
            style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            onClick={addRule}
            style={{
              padding: '0.5rem 1rem',
              background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
              border: 'none',
              borderRadius: '0.5rem',
              color: 'white',
              fontFamily: 'inherit',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            + Toevoegen
          </button>
        </div>

        {/* Rules list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', maxHeight: 340, overflowY: 'auto' }}>
          {allRules.map(rule => (
            <div
              key={rule.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0.75rem',
                background: rule.isCustom ? 'rgba(139,92,246,0.07)' : 'rgba(255,255,255,0.02)',
                borderRadius: '0.5rem',
                border: rule.isCustom ? '1px solid rgba(139,92,246,0.2)' : '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flex: 1, minWidth: 0 }}>
                <code style={{ fontSize: '0.78rem', color: '#a5f3fc', background: 'rgba(6,182,212,0.1)', padding: '0.15rem 0.4rem', borderRadius: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                  {rule.pattern}
                </code>
                <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>→</span>
                <span style={{ fontSize: '0.82rem', color: '#e2e8f0', flexShrink: 0 }}>{rule.category}</span>
                {rule.isCustom && <span style={{ fontSize: '0.7rem', color: '#8b5cf6', background: 'rgba(139,92,246,0.1)', padding: '0.1rem 0.4rem', borderRadius: '1rem' }}>aangepast</span>}
              </div>
              <button
                onClick={() => deleteRule(rule.id)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1rem', padding: '0.25rem 0.5rem', flexShrink: 0 }}
                title="Verwijderen"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Bitcoin */}
      <section className="glass-card" style={{ padding: '1.25rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 1rem' }}>Bitcoin</h2>
        <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="number"
            step="0.00000001"
            className="glass-input"
            style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: 160 }}
            placeholder={btcAsset ? String(btcAsset.amount) : '0.00000000'}
            value={btcAmount}
            onChange={e => setBtcAmount(e.target.value)}
          />
          <span style={{ color: '#64748b', fontSize: '0.85rem' }}>BTC</span>
          <button
            onClick={fetchBtcPrice}
            className="glass-button"
            style={{ padding: '0.5rem 0.875rem', fontSize: '0.82rem', fontFamily: 'inherit' }}
          >
            {btcLoading ? 'Laden...' : 'Prijs ophalen'}
          </button>
          {btcPrice && (
            <span style={{ color: '#f59e0b', fontSize: '0.85rem' }}>
              1 BTC = {formatCurrency(btcPrice)}
            </span>
          )}
          <button
            onClick={saveBtc}
            style={{
              padding: '0.5rem 1rem',
              background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
              border: 'none',
              borderRadius: '0.5rem',
              color: 'white',
              fontFamily: 'inherit',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Opslaan
          </button>
        </div>
        {btcAsset && (
          <div style={{ marginTop: '0.75rem', color: '#94a3b8', fontSize: '0.82rem' }}>
            Huidig: {btcAsset.amount} BTC ≈ {formatCurrency(btcAsset.amount * (btcPrice ?? btcAsset.lastPrice))}
            {btcAsset.lastUpdated && ` · Bijgewerkt: ${new Date(btcAsset.lastUpdated).toLocaleDateString('nl-NL')}`}
          </div>
        )}
      </section>

      {/* Backup / Restore */}
      <section className="glass-card" style={{ padding: '1.25rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 1rem' }}>Backup & Herstel</h2>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={exportData}
            style={{
              padding: '0.625rem 1.25rem',
              background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
              border: 'none',
              borderRadius: '0.5rem',
              color: 'white',
              fontFamily: 'inherit',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            📤 Exporteer backup
          </button>
          <button
            onClick={() => importRef.current?.click()}
            className="glass-button"
            style={{ padding: '0.625rem 1.25rem', fontSize: '0.875rem', fontFamily: 'inherit' }}
          >
            📥 Herstel backup
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={importData}
          />
          <button
            onClick={clearAll}
            style={{
              padding: '0.625rem 1.25rem',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '0.5rem',
              color: '#fca5a5',
              fontFamily: 'inherit',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            🗑 Alle data verwijderen
          </button>
        </div>
        {exportMsg && (
          <p style={{ marginTop: '0.75rem', color: '#10b981', fontSize: '0.85rem' }}>{exportMsg}</p>
        )}
      </section>

      {/* Accounts info */}
      <section className="glass-card" style={{ padding: '1.25rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.75rem' }}>Rekeningen</h2>
        {storage.getAccounts().length === 0 ? (
          <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Nog geen rekeningen. Importeer eerst bankafschriften.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {storage.getAccounts().map(acc => (
              <div
                key={acc.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '0.625rem 0.875rem',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: '0.5rem',
                  border: '1px solid rgba(255,255,255,0.06)',
                  fontSize: '0.85rem',
                }}
              >
                <div>
                  <span style={{ fontWeight: 500 }}>{acc.name}</span>
                  <span style={{ color: '#64748b', marginLeft: '0.5rem' }}>{acc.iban}</span>
                </div>
                <span style={{ color: '#94a3b8', textTransform: 'capitalize' }}>{acc.bank}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
