import { useState, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { storage } from '../lib/storage';
import { formatCurrency, formatDate } from '../lib/utils';
import { CATEGORIES } from '../types';
import type { Transaction } from '../types';

const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  fontSize: '0.875rem',
  width: '100%',
};

type SortKey = 'date' | 'name' | 'description' | 'account' | 'amount' | 'category';
type SortDir = 'asc' | 'desc';

function sortAccessor(tx: Transaction, key: SortKey): string | number {
  switch (key) {
    case 'date': return tx.date;
    case 'name': return (tx.name || tx.counterparty).toLowerCase();
    case 'description': return tx.description.toLowerCase();
    case 'account': return tx.account;
    case 'amount': return tx.amount;
    case 'category': return tx.category.toLowerCase();
  }
}

/* ── Detail slide-over panel ─────────────────────────── */

function TransactionDetail({
  tx,
  accountName,
  allCategories,
  allLabels,
  onUpdate,
  onClose,
}: {
  tx: Transaction;
  accountName: string;
  allCategories: string[];
  allLabels: string[];
  onUpdate: (id: string, updates: Partial<Transaction>) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState(tx.note ?? '');
  const [category, setCategory] = useState(tx.category);
  const [labels, setLabels] = useState<string[]>(tx.labels ?? []);
  const [labelInput, setLabelInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);

  // Reset when tx changes
  useEffect(() => {
    setNote(tx.note ?? '');
    setCategory(tx.category);
    setLabels(tx.labels ?? []);
    setLabelInput('');
  }, [tx.id]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function save(updates: Partial<Transaction>) {
    onUpdate(tx.id, updates);
  }

  function addLabel(label: string) {
    const trimmed = label.trim();
    if (!trimmed || labels.includes(trimmed)) return;
    const next = [...labels, trimmed];
    setLabels(next);
    save({ labels: next });
    setLabelInput('');
    setShowSuggestions(false);
  }

  function removeLabel(label: string) {
    const next = labels.filter(l => l !== label);
    setLabels(next);
    save({ labels: next });
  }

  const suggestions = allLabels.filter(
    l => !labels.includes(l) && l.toLowerCase().includes(labelInput.toLowerCase()),
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className="detail-backdrop"
        onClick={onClose}
      />
      {/* Panel */}
      <div ref={panelRef} className="detail-panel">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, lineHeight: 1.3 }}>
              {tx.name || tx.counterparty}
            </h2>
            {tx.counterparty && tx.counterparty !== tx.name && (
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>{tx.counterparty}</p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.25rem', padding: '0.25rem', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {/* Amount + date */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.5rem' }}>
          <span style={{ fontSize: '1.75rem', fontWeight: 800, color: tx.amount >= 0 ? '#10b981' : '#ef4444' }}>
            {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
          </span>
          <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{formatDate(tx.date)}</span>
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Rekening */}
          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem', fontWeight: 600 }}>Rekening</label>
            <span style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>{accountName}</span>
          </div>

          {/* Categorie */}
          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem', fontWeight: 600 }}>Categorie</label>
            <select
              className="glass-input"
              style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
              value={category}
              onChange={e => {
                setCategory(e.target.value);
                save({ category: e.target.value });
              }}
            >
              {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Interne overboeking toggle */}
          <div>
            <label
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}
              title="Interne overboekingen tellen niet mee als inkomsten of uitgaven"
            >
              <input
                type="checkbox"
                checked={tx.isInternal ?? false}
                onChange={e => save({ isInternal: e.target.checked || undefined })}
                style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#06b6d4' }}
              />
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Interne overboeking</span>
              <span style={{ fontSize: '0.7rem', color: '#475569' }}>(telt niet mee in rapportages)</span>
            </label>
          </div>

          {/* Labels */}
          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem', fontWeight: 600 }}>Labels</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: labels.length > 0 ? '0.5rem' : 0 }}>
              {labels.map(label => (
                <span
                  key={label}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                    background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)',
                    borderRadius: '1rem', padding: '0.2rem 0.6rem', fontSize: '0.75rem', color: '#fbbf24',
                  }}
                >
                  {label}
                  <button
                    onClick={() => removeLabel(label)}
                    style={{ background: 'none', border: 'none', color: '#fbbf24', cursor: 'pointer', fontSize: '0.85rem', padding: 0, lineHeight: 1 }}
                  >×</button>
                </span>
              ))}
            </div>
            <div style={{ position: 'relative' }}>
              <input
                ref={labelInputRef}
                className="glass-input"
                style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
                placeholder="Label toevoegen..."
                value={labelInput}
                onChange={e => { setLabelInput(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); addLabel(labelInput); }
                  if (e.key === 'Escape') { setLabelInput(''); setShowSuggestions(false); }
                }}
              />
              {showSuggestions && labelInput && suggestions.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                  background: 'rgba(15,15,30,0.95)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '0.5rem', marginTop: '0.25rem', maxHeight: 150, overflowY: 'auto',
                }}>
                  {suggestions.slice(0, 8).map(s => (
                    <button
                      key={s}
                      onMouseDown={e => { e.preventDefault(); addLabel(s); }}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', padding: '0.4rem 0.6rem',
                        background: 'none', border: 'none', color: '#cbd5e1', fontSize: '0.8rem',
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >{s}</button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Notitie */}
          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem', fontWeight: 600 }}>Notitie</label>
            <textarea
              className="glass-input"
              style={{ padding: '0.5rem 0.6rem', fontSize: '0.8rem', minHeight: '4rem', resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="Voeg een notitie toe..."
              value={note}
              onChange={e => setNote(e.target.value)}
              onBlur={() => { if (note !== (tx.note ?? '')) save({ note: note || undefined }); }}
            />
          </div>

          {/* Omschrijving */}
          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem', fontWeight: 600 }}>Omschrijving</label>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.5 }}>{tx.description || '—'}</p>
          </div>

          {/* Originele omschrijving */}
          {tx.originalDescription && tx.originalDescription !== tx.description && (
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem', fontWeight: 600 }}>Origineel</label>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#475569', lineHeight: 1.5, wordBreak: 'break-all', fontFamily: 'monospace' }}>{tx.originalDescription}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ── Main page ───────────────────────────────────────── */

export default function Transactions() {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [filterAccount, setFilterAccount] = useState('');
  const [filterCategory, setFilterCategory] = useState(searchParams.get('category') ?? '');
  const [filterLabel, setFilterLabel] = useState(searchParams.get('label') ?? '');
  const [filterStart, setFilterStart] = useState(searchParams.get('start') ?? '');
  const [filterEnd, setFilterEnd] = useState(searchParams.get('end') ?? '');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [, forceUpdate] = useState(0);

  const [toast, setToast] = useState('');
  const [visibleCount, setVisibleCount] = useState(100);

  // Bulk selection
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkLabel, setBulkLabel] = useState('');
  const [bulkNote, setBulkNote] = useState('');

  const transactions = storage.getTransactions();
  const accounts = storage.getAccounts();

  const allCategories = useMemo(() => {
    const fromRules = storage.getRules().map(r => r.category);
    const fromTransactions = transactions.map(tx => tx.category);
    return [...new Set([...CATEGORIES, ...fromTransactions, ...fromRules])]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'nl'));
  }, [transactions.length]);

  const allLabels = useMemo(() => {
    const set = new Set<string>();
    for (const tx of transactions) {
      if (tx.labels) for (const l of tx.labels) set.add(l);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'nl'));
  }, [transactions]);

  const uniqueAccounts = useMemo(
    () => [...new Set(transactions.map(tx => tx.account))],
    [transactions.length],
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'amount' ? 'desc' : 'asc');
    }
  }

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  const filtered = useMemo(() => {
    return transactions
      .filter(tx => {
        if (filterAccount && tx.account !== filterAccount) return false;
        if (filterCategory && tx.category !== filterCategory) return false;
        if (filterLabel && !(tx.labels ?? []).includes(filterLabel)) return false;
        if (filterStart && tx.date < filterStart) return false;
        if (filterEnd && tx.date > filterEnd) return false;
        if (search) {
          const q = search.toLowerCase();
          if (
            !tx.name.toLowerCase().includes(q) &&
            !tx.description.toLowerCase().includes(q) &&
            !tx.counterparty.toLowerCase().includes(q) &&
            !tx.category.toLowerCase().includes(q) &&
            !(tx.note ?? '').toLowerCase().includes(q) &&
            !(tx.labels ?? []).some(l => l.toLowerCase().includes(q))
          )
            return false;
        }
        return true;
      })
      .sort((a, b) => {
        const av = sortAccessor(a, sortKey);
        const bv = sortAccessor(b, sortKey);
        let cmp = 0;
        if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
        else cmp = String(av).localeCompare(String(bv), 'nl');
        return sortDir === 'asc' ? cmp : -cmp;
      });
  }, [transactions, search, filterAccount, filterCategory, filterLabel, filterStart, filterEnd, sortKey, sortDir]);

  const hasActiveFilters = filterAccount || filterCategory || filterLabel || filterStart || filterEnd || search;

  const selectedTx = selectedTxId ? transactions.find(t => t.id === selectedTxId) ?? null : null;

  function handleCategoryChange(tx: Transaction, newCategory: string) {
    storage.updateTransaction(tx.id, { category: newCategory });

    if (tx.name) {
      const existing = storage.getRules();
      const pattern = tx.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const alreadyExists = existing.some(r => r.pattern === pattern && r.category === newCategory);
      if (!alreadyExists) {
        storage.setRules([
          ...existing,
          { id: `custom-${Date.now()}`, pattern, category: newCategory, isCustom: true },
        ]);
      }
    }

    setEditingId(null);
    forceUpdate(n => n + 1);
  }

  function handleDetailUpdate(id: string, updates: Partial<Transaction>) {
    storage.updateTransaction(id, updates);
    forceUpdate(n => n + 1);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  // Reset pagination when filters change
  useMemo(() => { setVisibleCount(100); }, [search, filterAccount, filterCategory, filterLabel, filterStart, filterEnd, sortKey, sortDir]);

  // Bulk actions
  const bulkCount = selectedIds.size;
  const allFilteredSelected = filtered.length > 0 && filtered.every(tx => selectedIds.has(tx.id));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(tx => tx.id)));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function bulkSetCategory(category: string) {
    if (!category) return;
    const count = selectedIds.size;
    const allTxs = storage.getTransactions().map(t =>
      selectedIds.has(t.id) ? { ...t, category } : t,
    );
    storage.setTransactions(allTxs);
    setSelectedIds(new Set());
    setBulkCategory('');
    forceUpdate(n => n + 1);
    showToast(`${count} transacties → ${category}`);
  }

  function bulkAddLabel(label: string) {
    if (!label.trim()) return;
    const trimmed = label.trim();
    const count = selectedIds.size;
    const allTxs = storage.getTransactions().map(t =>
      selectedIds.has(t.id) ? { ...t, labels: [...new Set([...(t.labels ?? []), trimmed])] } : t,
    );
    storage.setTransactions(allTxs);
    setSelectedIds(new Set());
    setBulkLabel('');
    forceUpdate(n => n + 1);
    showToast(`Label "${trimmed}" toegevoegd aan ${count} transacties`);
  }

  function bulkSetInternal(isInternal: boolean) {
    const count = selectedIds.size;
    const allTxs = storage.getTransactions().map(t =>
      selectedIds.has(t.id) ? { ...t, isInternal: isInternal || undefined } : t,
    );
    storage.setTransactions(allTxs);
    setSelectedIds(new Set());
    forceUpdate(n => n + 1);
    showToast(`${count} transacties als intern gemarkeerd`);
  }

  function bulkSetNote(note: string) {
    const count = selectedIds.size;
    const allTxs = storage.getTransactions().map(t =>
      selectedIds.has(t.id) ? { ...t, note: note || undefined } : t,
    );
    storage.setTransactions(allTxs);
    setSelectedIds(new Set());
    setBulkNote('');
    forceUpdate(n => n + 1);
    showToast(`Notitie toegevoegd aan ${count} transacties`);
  }

  const accountName = (iban: string) => accounts.find(a => a.iban === iban)?.name ?? iban;

  const categoryBadge = (tx: Transaction) =>
    editingId === tx.id ? (
      <select
        className="glass-input"
        style={{ padding: '0.375rem 0.5rem', fontSize: '0.8rem', width: '100%' }}
        defaultValue={tx.category}
        autoFocus
        onBlur={() => setEditingId(null)}
        onChange={e => handleCategoryChange(tx, e.target.value)}
      >
        {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    ) : (
      <button
        onClick={e => { e.stopPropagation(); setEditingId(tx.id); }}
        style={{
          background: 'rgba(139,92,246,0.12)',
          border: '1px solid rgba(139,92,246,0.25)',
          borderRadius: '1rem',
          color: '#c4b5fd',
          padding: '0.25rem 0.625rem',
          fontSize: '0.75rem',
          cursor: 'pointer',
          fontFamily: 'inherit',
          minHeight: 32,
          transition: 'background 0.15s',
        }}
        title="Klik om categorie aan te passen"
      >
        {tx.category}
      </button>
    );

  const thStyle = (key: SortKey, align: 'left' | 'right' = 'left'): React.CSSProperties => ({
    padding: '0.75rem 1rem',
    textAlign: align,
    color: sortKey === key ? '#c4b5fd' : '#64748b',
    fontWeight: 600,
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'color 0.15s',
  });

  const columns: { key: SortKey; label: string; align?: 'right' }[] = [
    { key: 'date', label: 'Datum' },
    { key: 'name', label: 'Naam' },
    { key: 'description', label: 'Omschrijving' },
    { key: 'account', label: 'Rekening' },
    { key: 'amount', label: 'Bedrag', align: 'right' },
    { key: 'category', label: 'Categorie' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {toast && <div className="toast-success">✓ {toast}</div>}

      {/* Filters */}
      <div className="glass-card" style={{ padding: '1rem' }}>
        {/* Header row: count + mobile toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ color: '#64748b', fontSize: '0.8rem' }}>
              {filtered.length} van {transactions.length} transacties
              {hasActiveFilters && <span style={{ color: '#8b5cf6', marginLeft: '0.4rem' }}>• gefilterd</span>}
            </span>
            <button
              onClick={() => { setBulkMode(m => !m); setSelectedIds(new Set()); }}
              style={{
                background: bulkMode ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${bulkMode ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: '0.375rem',
                color: bulkMode ? '#c4b5fd' : '#64748b',
                padding: '0.25rem 0.6rem',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              Bulk bewerken
            </button>
          </div>
          {/* Shown only on mobile via CSS */}
          <button
            onClick={() => setFiltersOpen(v => !v)}
            className="filter-toggle-btn"
            style={{
              background: hasActiveFilters ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${hasActiveFilters ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: '0.5rem',
              color: hasActiveFilters ? '#c4b5fd' : '#94a3b8',
              padding: '0.375rem 0.75rem',
              fontSize: '0.8rem',
              cursor: 'pointer',
              fontFamily: 'inherit',
              minHeight: 44,
            }}
          >
            {filtersOpen ? '✕ Sluiten' : `⚙ Filters${hasActiveFilters ? ' ●' : ''}`}
          </button>
        </div>

        {/* Filter grid — always visible on desktop, collapsible on mobile */}
        <div className={`filter-grid-wrapper${filtersOpen ? ' filter-open' : ''}`} style={{ marginTop: '0.75rem' }}>
          <div className="filter-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 160px 160px 140px 140px 140px', gap: '0.75rem', alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Zoeken</label>
              <input
                className="glass-input"
                style={inputStyle}
                placeholder="Naam, omschrijving, label..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Rekening</label>
              <select
                className="glass-input"
                style={inputStyle}
                value={filterAccount}
                onChange={e => setFilterAccount(e.target.value)}
              >
                <option value="">Alle rekeningen</option>
                {uniqueAccounts.map(iban => (
                  <option key={iban} value={iban}>{accountName(iban)}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Categorie</label>
              <select
                className="glass-input"
                style={inputStyle}
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
              >
                <option value="">Alle categorieën</option>
                {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Label</label>
              <select
                className="glass-input"
                style={inputStyle}
                value={filterLabel}
                onChange={e => setFilterLabel(e.target.value)}
              >
                <option value="">Alle labels</option>
                {allLabels.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Van</label>
              <input
                type="date"
                className="glass-input"
                style={inputStyle}
                value={filterStart}
                onChange={e => setFilterStart(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Tot</label>
              <input
                type="date"
                className="glass-input"
                style={inputStyle}
                value={filterEnd}
                onChange={e => setFilterEnd(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bulk action toolbar */}
      {bulkMode && bulkCount > 0 && (
        <div className="glass-card" style={{ padding: '0.75rem 1.25rem', position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#c4b5fd', whiteSpace: 'nowrap' }}>
            {bulkCount} geselecteerd
          </span>
          <button
            onClick={() => setSelectedIds(new Set())}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit', padding: '0.25rem 0.5rem' }}
          >
            Deselecteer
          </button>

          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />

          {/* Categorie */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <select
              className="glass-input"
              style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', minWidth: 120 }}
              value={bulkCategory}
              onChange={e => setBulkCategory(e.target.value)}
            >
              <option value="">Categorie...</option>
              {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {bulkCategory && (
              <button
                className="glass-button"
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', fontFamily: 'inherit', fontWeight: 600, background: 'rgba(139,92,246,0.2)', borderColor: 'rgba(139,92,246,0.4)', color: 'white' }}
                onClick={() => bulkSetCategory(bulkCategory)}
              >
                Toepassen
              </button>
            )}
          </div>

          {/* Label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <input
              className="glass-input"
              style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', width: 120 }}
              placeholder="Label..."
              value={bulkLabel}
              onChange={e => setBulkLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') bulkAddLabel(bulkLabel); }}
              list="bulk-label-suggestions"
            />
            <datalist id="bulk-label-suggestions">
              {allLabels.map(l => <option key={l} value={l} />)}
            </datalist>
            {bulkLabel && (
              <button
                className="glass-button"
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', fontFamily: 'inherit', fontWeight: 600, background: 'rgba(245,158,11,0.2)', borderColor: 'rgba(245,158,11,0.4)', color: '#fbbf24' }}
                onClick={() => bulkAddLabel(bulkLabel)}
              >
                + Label
              </button>
            )}
          </div>

          {/* Intern */}
          <button
            className="glass-button"
            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', fontFamily: 'inherit', fontWeight: 600, background: 'rgba(6,182,212,0.15)', borderColor: 'rgba(6,182,212,0.3)', color: '#06b6d4', whiteSpace: 'nowrap' }}
            onClick={() => bulkSetInternal(true)}
          >
            Intern
          </button>

          {/* Notitie */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <input
              className="glass-input"
              style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', width: 140 }}
              placeholder="Notitie..."
              value={bulkNote}
              onChange={e => setBulkNote(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') bulkSetNote(bulkNote); }}
            />
            {bulkNote && (
              <button
                className="glass-button"
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', fontFamily: 'inherit', fontWeight: 600 }}
                onClick={() => bulkSetNote(bulkNote)}
              >
                Toepassen
              </button>
            )}
          </div>
        </div>
      )}

      {/* Desktop table */}
      <div className="glass-card tx-table-view" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {bulkMode && (
                  <th style={{ padding: '0.75rem 0.5rem 0.75rem 1rem', width: 32 }}>
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      onClick={e => e.stopPropagation()}
                      style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#8b5cf6' }}
                      title="Selecteer alle gefilterde transacties"
                    />
                  </th>
                )}
                {columns.map(col => (
                  <th
                    key={col.key}
                    style={thStyle(col.key, col.align ?? 'left')}
                    onClick={() => toggleSort(col.key)}
                  >
                    {col.label}{sortIndicator(col.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={bulkMode ? 7 : 6} style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    Geen transacties gevonden
                  </td>
                </tr>
              ) : (
                filtered.slice(0, visibleCount).map((tx, idx) => (
                  <tr
                    key={tx.id}
                    onClick={() => setSelectedTxId(tx.id)}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: selectedTxId === tx.id
                        ? 'rgba(139,92,246,0.08)'
                        : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { if (selectedTxId !== tx.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                    onMouseLeave={e => { if (selectedTxId !== tx.id) e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)'; }}
                  >
                    {bulkMode && (
                      <td style={{ padding: '0.625rem 0.5rem 0.625rem 1rem', width: 32 }} onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(tx.id)}
                          onChange={() => toggleSelect(tx.id)}
                          style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#8b5cf6' }}
                        />
                      </td>
                    )}
                    <td style={{ padding: '0.625rem 1rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {formatDate(tx.date)}
                    </td>
                    <td style={{ padding: '0.625rem 1rem', fontWeight: 500, maxWidth: 200 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {tx.name || tx.counterparty}
                        </span>
                        {tx.isInternal && <span title="Interne overboeking" style={{ fontSize: '0.6rem', color: '#06b6d4', background: 'rgba(6,182,212,0.1)', padding: '0.05rem 0.3rem', borderRadius: '0.5rem', fontWeight: 600 }}>intern</span>}
                        {tx.note && <span title={tx.note} style={{ fontSize: '0.7rem', opacity: 0.5 }}>📝</span>}
                        {(tx.labels ?? []).length > 0 && <span style={{ fontSize: '0.65rem', opacity: 0.5 }}>🏷</span>}
                      </div>
                    </td>
                    <td style={{ padding: '0.625rem 1rem', color: '#94a3b8', maxWidth: 240 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tx.description}
                      </div>
                    </td>
                    <td style={{ padding: '0.625rem 1rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {accountName(tx.account)}
                    </td>
                    <td
                      style={{
                        padding: '0.625rem 1rem',
                        textAlign: 'right',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        color: tx.amount >= 0 ? '#10b981' : '#ef4444',
                      }}
                    >
                      {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                    </td>
                    <td style={{ padding: '0.625rem 1rem' }} onClick={e => e.stopPropagation()}>
                      {categoryBadge(tx)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > visibleCount && (
          <div style={{ padding: '0.75rem', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              className="glass-button"
              style={{ padding: '0.5rem 2rem', fontSize: '0.8rem', fontFamily: 'inherit', color: '#94a3b8' }}
              onClick={() => setVisibleCount(c => c + 100)}
            >
              Meer laden ({filtered.length - visibleCount} resterend)
            </button>
          </div>
        )}
      </div>

      {/* Mobile card list */}
      <div className="tx-card-view">
        {filtered.length === 0 ? (
          <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
            Geen transacties gevonden
          </div>
        ) : (
          filtered.slice(0, visibleCount).map(tx => (
            <div
              key={tx.id}
              className="glass-card"
              style={{ padding: '0.875rem 1rem', cursor: 'pointer' }}
              onClick={() => setSelectedTxId(tx.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div style={{ flex: 1, minWidth: 0, marginRight: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.name || tx.counterparty}
                    </span>
                    {tx.note && <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>📝</span>}
                  </div>
                  {tx.description && tx.description !== (tx.name || tx.counterparty) && (
                    <div style={{ fontSize: '0.78rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '0.15rem' }}>
                      {tx.description}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: '1rem',
                    color: tx.amount >= 0 ? '#10b981' : '#ef4444',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.75rem', color: '#64748b' }}>
                  <span>{formatDate(tx.date)}</span>
                  <span>·</span>
                  <span>{accountName(tx.account)}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                  {(tx.labels ?? []).slice(0, 2).map(l => (
                    <span key={l} style={{ fontSize: '0.65rem', color: '#fbbf24', background: 'rgba(245,158,11,0.12)', padding: '0.1rem 0.35rem', borderRadius: '0.5rem' }}>{l}</span>
                  ))}
                  <div onClick={e => e.stopPropagation()}>{categoryBadge(tx)}</div>
                </div>
              </div>
            </div>
          ))
        )}
        {filtered.length > visibleCount && (
          <button
            className="glass-card"
            style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.8rem', color: '#94a3b8', cursor: 'pointer', fontFamily: 'inherit', border: '1px solid rgba(255,255,255,0.1)' }}
            onClick={() => setVisibleCount(c => c + 100)}
          >
            Meer laden ({filtered.length - visibleCount} resterend)
          </button>
        )}
      </div>

      {/* Detail slide-over */}
      {selectedTx && (
        <TransactionDetail
          tx={selectedTx}
          accountName={accountName(selectedTx.account)}
          allCategories={allCategories}
          allLabels={allLabels}
          onUpdate={handleDetailUpdate}
          onClose={() => setSelectedTxId(null)}
        />
      )}
    </div>
  );
}
