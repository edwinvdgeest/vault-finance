import { useState, useMemo } from 'react';
import { storage } from '../lib/storage';
import { getDefaultRulesWithIds, categorize, getRuleConflicts } from '../lib/categorizer';
import { formatCurrency } from '../lib/utils';
import { CATEGORIES } from '../types';
import type { Asset, Rule, Account, Budget } from '../types';

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

interface AccountEdit {
  name: string;
  startingBalance: string;
}

const BANK_LABELS: Record<string, string> = {
  bunq: 'bunq',
  triodos: 'Triodos',
  abn: 'ABN AMRO',
};

export default function Settings() {
  const [accounts, setAccounts] = useState<Account[]>(() => storage.getAccounts());
  const [accountEdits, setAccountEdits] = useState<Record<string, AccountEdit>>({});
  const [editingField, setEditingField] = useState<{ id: string; field: 'name' | 'balance' } | null>(null);

  const [rules, setRules] = useState<Rule[]>(() => {
    const stored = storage.getRules();
    return stored.length > 0 ? stored : getDefaultRulesWithIds();
  });
  const [newPattern, setNewPattern] = useState('');
  const [newCategory, setNewCategory] = useState<string>(CATEGORIES[0]);
  const [editingRule, setEditingRule] = useState<{ id: string; pattern: string; category: string } | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Conflict detection — rules in different categories sharing a term
  const conflicts = useMemo(() => getRuleConflicts(rules), [rules]);
  const conflictCount = conflicts.size;
  const categoriesWithConflicts = useMemo(() => {
    const set = new Set<string>();
    for (const [ruleId] of conflicts) {
      const rule = rules.find(r => r.id === ruleId);
      if (rule) set.add(rule.category);
    }
    return set;
  }, [conflicts, rules]);

  const [cryptoHoldings, setCryptoHoldings] = useState<CryptoEdit[]>(() =>
    storage.getAssets().map(assetToEdit),
  );
  const [newCoinType, setNewCoinType] = useState(KNOWN_COINS[0].type);

  const [budgets, setBudgets] = useState<Budget[]>(() => storage.getBudgets());
  const [newBudgetCategory, setNewBudgetCategory] = useState('');

  const [saved, setSaved] = useState('');
  const [onlyOverig, setOnlyOverig] = useState(true);

  function showSaved(msg: string) {
    setSaved(msg);
    setTimeout(() => setSaved(''), 2000);
  }

  function startEdit(id: string, field: 'name' | 'balance') {
    const acc = accounts.find(a => a.id === id);
    if (!acc) return;
    setAccountEdits(prev => {
      if (prev[id]) return prev;
      return { ...prev, [id]: { name: acc.name, startingBalance: String(acc.startingBalance) } };
    });
    setEditingField({ id, field });
  }

  function commitAccountEdit(id: string) {
    const acc = accounts.find(a => a.id === id);
    if (!acc) return;
    const edit = accountEdits[id];
    if (!edit) { setEditingField(null); return; }
    const newName = edit.name.trim() || acc.name;
    const newBalance = parseFloat(edit.startingBalance);
    const updated: Account = {
      ...acc,
      name: newName,
      startingBalance: isNaN(newBalance) ? acc.startingBalance : newBalance,
    };
    storage.upsertAccount(updated);
    setAccounts(storage.getAccounts());
    setEditingField(null);
    showSaved('Rekening opgeslagen');
  }

  function saveRules(updated: Rule[]) {
    setRules(updated);
    storage.setRules(updated);
  }

  function deleteRule(id: string) {
    saveRules(rules.filter(r => r.id !== id));
  }

  function startEditRule(rule: Rule) {
    setEditingRule({ id: rule.id, pattern: rule.pattern, category: rule.category });
  }

  function commitEditRule() {
    if (!editingRule) return;
    const trimmed = editingRule.pattern.trim();
    if (!trimmed) { setEditingRule(null); return; }
    saveRules(rules.map(r => r.id === editingRule.id ? { ...r, pattern: trimmed, category: editingRule.category } : r));
    setEditingRule(null);
    showSaved('Regel opgeslagen');
  }

  function recategorize() {
    const transactions = storage.getTransactions();
    const currentRules = storage.getRules().length > 0 ? storage.getRules() : getDefaultRulesWithIds();
    const updated = transactions.map(tx => {
      if (onlyOverig && tx.category !== 'Overig') return tx;
      return { ...tx, category: categorize(tx.name, tx.description, currentRules) };
    });
    storage.setTransactions(updated);
    const count = onlyOverig
      ? transactions.filter(tx => tx.category === 'Overig').length
      : updated.length;
    showSaved(`${count} transacties opnieuw gecategoriseerd`);
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

      {/* Rekeningen */}
      {accounts.length > 0 && (
        <div className="glass-card">
          <p style={sectionTitle}>Rekeningen</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {accounts.map(acc => {
              const edit = accountEdits[acc.id] ?? { name: acc.name, startingBalance: String(acc.startingBalance) };
              const isEditingName = editingField?.id === acc.id && editingField.field === 'name';
              const isEditingBalance = editingField?.id === acc.id && editingField.field === 'balance';
              return (
                <div
                  key={acc.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto auto',
                    gap: '0.75rem',
                    alignItems: 'center',
                    padding: '0.625rem 0.875rem',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: '0.5rem',
                  }}
                >
                  {/* Left: name + IBAN */}
                  <div style={{ minWidth: 0 }}>
                    {isEditingName ? (
                      <input
                        autoFocus
                        className="glass-input"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem', width: '100%' }}
                        value={edit.name}
                        onChange={e => setAccountEdits(prev => ({ ...prev, [acc.id]: { ...edit, name: e.target.value } }))}
                        onBlur={() => commitAccountEdit(acc.id)}
                        onKeyDown={e => { if (e.key === 'Enter') commitAccountEdit(acc.id); if (e.key === 'Escape') setEditingField(null); }}
                      />
                    ) : (
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}
                        onClick={() => startEdit(acc.id, 'name')}
                        title="Klik om naam te wijzigen"
                      >
                        <span style={{ fontSize: '0.875rem', color: '#e2e8f0', fontWeight: 500 }}>{acc.name}</span>
                        <span style={{ fontSize: '0.75rem', color: '#475569' }}>✎</span>
                      </div>
                    )}
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {acc.iban}
                    </div>
                  </div>

                  {/* Bank badge */}
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    color: '#7dd3fc',
                    background: 'rgba(14,165,233,0.12)',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '0.25rem',
                    whiteSpace: 'nowrap',
                  }}>
                    {BANK_LABELS[acc.bank] ?? acc.bank}
                  </span>

                  {/* Starting balance (editable) */}
                  {isEditingBalance ? (
                    <input
                      autoFocus
                      type="number"
                      step="0.01"
                      className="glass-input"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem', width: '8rem', textAlign: 'right' }}
                      value={edit.startingBalance}
                      onChange={e => setAccountEdits(prev => ({ ...prev, [acc.id]: { ...edit, startingBalance: e.target.value } }))}
                      onBlur={() => commitAccountEdit(acc.id)}
                      onKeyDown={e => { if (e.key === 'Enter') commitAccountEdit(acc.id); if (e.key === 'Escape') setEditingField(null); }}
                    />
                  ) : (
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', justifyContent: 'flex-end' }}
                      onClick={() => startEdit(acc.id, 'balance')}
                      title="Klik om startsaldo te wijzigen"
                    >
                      <span style={{ fontSize: '0.875rem', color: acc.startingBalance < 0 ? '#f87171' : '#6ee7b7', fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {formatCurrency(acc.startingBalance)}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#475569' }}>✎</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: '0.75rem', color: '#475569', marginTop: '0.75rem', marginBottom: 0 }}>
            Klik op een naam of saldo om te bewerken. Druk Enter of klik buiten het veld om op te slaan.
          </p>
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

      {/* Budgets */}
      <div className="glass-card">
        <p style={sectionTitle}>Budgetten per categorie</p>

        {budgets.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
            {budgets.map((b, idx) => (
              <div
                key={b.category}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.625rem 0.875rem',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '0.5rem',
                }}
              >
                <span style={{ fontSize: '0.85rem', color: '#cbd5e1', flex: 1 }}>{b.category}</span>
                <span style={{ fontSize: '0.8rem', color: '#64748b', flexShrink: 0 }}>€</span>
                <input
                  type="number"
                  step="10"
                  className="glass-input"
                  style={{ padding: '0.375rem 0.5rem', fontSize: '0.85rem', textAlign: 'right', width: '6rem' }}
                  value={b.monthlyLimit || ''}
                  placeholder="0"
                  onChange={e => {
                    const val = parseFloat(e.target.value) || 0;
                    const updated = budgets.map((bb, i) => i === idx ? { ...bb, monthlyLimit: val } : bb);
                    setBudgets(updated);
                    storage.setBudgets(updated);
                  }}
                />
                <span style={{ fontSize: '0.72rem', color: '#475569', flexShrink: 0 }}>/mnd</span>
                <button
                  onClick={() => {
                    const updated = budgets.filter((_, i) => i !== idx);
                    setBudgets(updated);
                    storage.setBudgets(updated);
                  }}
                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.1rem', padding: '0.25rem', lineHeight: 1, transition: 'color 0.15s', flexShrink: 0 }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}
                >×</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <select
            className="glass-input"
            style={{ ...inputStyle, flex: 1 }}
            value={newBudgetCategory}
            onChange={e => setNewBudgetCategory(e.target.value)}
          >
            <option value="">Categorie kiezen...</option>
            {CATEGORIES.filter(c => !budgets.some(b => b.category === c) && c !== 'Overboekingen' && c !== 'Inkomen').map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button
            className="glass-button"
            style={{ fontFamily: 'inherit', padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 600, whiteSpace: 'nowrap', background: 'rgba(139,92,246,0.2)', borderColor: 'rgba(139,92,246,0.4)', color: 'white' }}
            onClick={() => {
              if (!newBudgetCategory) return;
              const updated = [...budgets, { category: newBudgetCategory, monthlyLimit: 0 }];
              setBudgets(updated);
              storage.setBudgets(updated);
              setNewBudgetCategory('');
            }}
          >
            + Toevoegen
          </button>
        </div>
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

        {/* Recategorize */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <button
            className="glass-button"
            style={{ fontFamily: 'inherit', padding: '0.5rem 1.25rem', fontSize: '0.875rem', fontWeight: 600, background: 'rgba(6,182,212,0.15)', borderColor: 'rgba(6,182,212,0.3)', color: 'white', whiteSpace: 'nowrap' }}
            onClick={recategorize}
          >
            Herindelen
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem', color: '#94a3b8', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={onlyOverig}
              onChange={e => setOnlyOverig(e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#06b6d4' }}
            />
            Alleen 'Overig' herindelen
          </label>
        </div>

        {/* Conflict banner */}
        {conflictCount > 0 && (
          <div style={{
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: '0.5rem', padding: '0.625rem 0.875rem', marginBottom: '0.75rem',
            fontSize: '0.8rem', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <span>⚠</span>
            <span><strong>{conflictCount} conflicterende regels</strong> — regels in verschillende categorieën delen termen. Open groepen met ⚠ om te zien welke.</span>
          </div>
        )}

        {/* Rules grouped by category */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          {(() => {
            // Group rules by category
            const grouped = new Map<string, typeof rules>();
            for (const rule of rules) {
              if (!grouped.has(rule.category)) grouped.set(rule.category, []);
              grouped.get(rule.category)!.push(rule);
            }
            // Auto-expand category containing the rule being edited
            const editingCategory = editingRule
              ? rules.find(r => r.id === editingRule.id)?.category
              : null;
            const sortedCategories = [...grouped.keys()].sort((a, b) => a.localeCompare(b, 'nl'));

            return sortedCategories.map(category => {
              const groupRules = grouped.get(category)!;
              const isExpanded = expandedCategories.has(category) || editingCategory === category;
              return (
                <div key={category} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {/* Category header */}
                  <button
                    onClick={() => {
                      setExpandedCategories(prev => {
                        const next = new Set(prev);
                        if (next.has(category)) next.delete(category); else next.add(category);
                        return next;
                      });
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.5rem 0.875rem',
                      background: 'rgba(139,92,246,0.08)',
                      border: '1px solid rgba(139,92,246,0.2)',
                      borderRadius: '0.5rem',
                      cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139,92,246,0.12)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(139,92,246,0.08)')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.7rem', color: '#c4b5fd', transition: 'transform 0.15s', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0' }}>{category}</span>
                      {categoriesWithConflicts.has(category) && (
                        <span title="Bevat conflicterende regels" style={{ fontSize: '0.72rem', color: '#fbbf24' }}>⚠</span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', background: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.5rem', borderRadius: '0.75rem' }}>
                      {groupRules.length}
                    </span>
                  </button>
                  {/* Rules within this category */}
                  {isExpanded && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', paddingLeft: '1.25rem' }}>
                      {groupRules.map(rule => {
                        const isEditing = editingRule?.id === rule.id;
                        return (
                          <div
                            key={rule.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '0.4rem 0.75rem',
                              background: isEditing ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.03)',
                              border: isEditing ? '1px solid rgba(139,92,246,0.3)' : '1px solid rgba(255,255,255,0.05)',
                              borderRadius: '0.375rem',
                              transition: 'background 0.15s, border-color 0.15s',
                            }}
                          >
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flex: 1, minWidth: 0 }}>
                                <input
                                  autoFocus
                                  className="glass-input"
                                  style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', flex: 1, fontFamily: 'monospace' }}
                                  value={editingRule.pattern}
                                  onChange={e => setEditingRule({ ...editingRule, pattern: e.target.value })}
                                  onKeyDown={e => { if (e.key === 'Enter') commitEditRule(); if (e.key === 'Escape') setEditingRule(null); }}
                                />
                                <select
                                  className="glass-input"
                                  style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', minWidth: 130 }}
                                  value={editingRule.category}
                                  onChange={e => setEditingRule({ ...editingRule, category: e.target.value })}
                                >
                                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <button
                                  onClick={commitEditRule}
                                  style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', fontSize: '1rem', padding: '0.25rem', lineHeight: 1, fontWeight: 700 }}
                                  title="Opslaan"
                                >
                                  ✓
                                </button>
                                <button
                                  onClick={() => setEditingRule(null)}
                                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1rem', padding: '0.25rem', lineHeight: 1 }}
                                  title="Annuleren"
                                >
                                  ×
                                </button>
                              </div>
                            ) : (
                              <>
                                <div
                                  style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: 1, minWidth: 0, cursor: 'pointer' }}
                                  onClick={() => startEditRule(rule)}
                                  title="Klik om te bewerken"
                                >
                                  <code style={{ fontSize: '0.78rem', color: '#c4b5fd', background: 'rgba(139,92,246,0.1)', padding: '0.125rem 0.375rem', borderRadius: '0.25rem', maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {rule.pattern}
                                  </code>
                                  {rule.isCustom && (
                                    <span style={{ fontSize: '0.7rem', color: '#06b6d4', background: 'rgba(6,182,212,0.1)', padding: '0.1rem 0.4rem', borderRadius: '0.75rem', border: '1px solid rgba(6,182,212,0.2)' }}>
                                      eigen
                                    </span>
                                  )}
                                  {conflicts.has(rule.id) && (() => {
                                    const conflictList = conflicts.get(rule.id)!;
                                    const summary = conflictList
                                      .map(c => `"${c.sharedTerm}" ook in ${c.otherCategory}`)
                                      .join('\n');
                                    return (
                                      <span
                                        title={summary}
                                        style={{ fontSize: '0.7rem', color: '#fbbf24', background: 'rgba(245,158,11,0.12)', padding: '0.1rem 0.4rem', borderRadius: '0.75rem', border: '1px solid rgba(245,158,11,0.3)' }}
                                      >
                                        ⚠ conflict: {conflictList[0].sharedTerm} ↔ {conflictList[0].otherCategory}{conflictList.length > 1 ? ` +${conflictList.length - 1}` : ''}
                                      </span>
                                    );
                                  })()}
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
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            });
          })()}
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
          <button
            className="glass-button"
            style={{ fontFamily: 'inherit', padding: '0.5rem 1.25rem', fontSize: '0.875rem', background: 'rgba(6,182,212,0.15)', borderColor: 'rgba(6,182,212,0.3)', color: 'white' }}
            onClick={() => { storage.refreshInternalFlags(); showSaved('Interne overboekingen gedetecteerd'); }}
          >
            Herdetecteer interne overboekingen
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
