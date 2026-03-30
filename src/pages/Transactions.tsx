import { useState, useMemo } from 'react';
import { storage } from '../lib/storage';
import { formatCurrency, formatDate } from '../lib/utils';
import { CATEGORIES } from '../types';
import type { Transaction } from '../types';

const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  fontSize: '0.875rem',
  width: '100%',
};

export default function Transactions() {
  const [search, setSearch] = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [, forceUpdate] = useState(0);

  const transactions = storage.getTransactions();
  const accounts = storage.getAccounts();

  const allCategories = useMemo(() => {
    const fromRules = storage.getRules().map(r => r.category);
    const fromTransactions = transactions.map(tx => tx.category);
    return [...new Set([...CATEGORIES, ...fromTransactions, ...fromRules])]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'nl'));
  }, [transactions.length]);

  const uniqueAccounts = useMemo(
    () => [...new Set(transactions.map(tx => tx.account))],
    [transactions.length],
  );

  const filtered = useMemo(() => {
    return transactions
      .filter(tx => {
        if (filterAccount && tx.account !== filterAccount) return false;
        if (filterCategory && tx.category !== filterCategory) return false;
        if (filterStart && tx.date < filterStart) return false;
        if (filterEnd && tx.date > filterEnd) return false;
        if (search) {
          const q = search.toLowerCase();
          if (
            !tx.name.toLowerCase().includes(q) &&
            !tx.description.toLowerCase().includes(q) &&
            !tx.counterparty.toLowerCase().includes(q) &&
            !tx.category.toLowerCase().includes(q)
          )
            return false;
        }
        return true;
      })
      .sort((a, b) => (a.date > b.date ? -1 : 1));
  }, [transactions, search, filterAccount, filterCategory, filterStart, filterEnd]);

  const hasActiveFilters = filterAccount || filterCategory || filterStart || filterEnd || search;

  function handleCategoryChange(tx: Transaction, newCategory: string) {
    const allTxs = storage.getTransactions().map(t =>
      t.id === tx.id ? { ...t, category: newCategory } : t,
    );
    storage.setTransactions(allTxs);

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
        onClick={() => setEditingId(tx.id)}
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Filters */}
      <div className="glass-card" style={{ padding: '1rem' }}>
        {/* Header row: count + mobile toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ color: '#64748b', fontSize: '0.8rem' }}>
            {filtered.length} van {transactions.length} transacties
            {hasActiveFilters && <span style={{ color: '#8b5cf6', marginLeft: '0.4rem' }}>• gefilterd</span>}
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
          <div className="filter-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 180px 180px 160px 160px', gap: '0.75rem', alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Zoeken</label>
              <input
                className="glass-input"
                style={inputStyle}
                placeholder="Naam, omschrijving..."
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

      {/* Desktop table */}
      <div className="glass-card tx-table-view" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['Datum', 'Naam', 'Omschrijving', 'Rekening', 'Bedrag', 'Categorie'].map(h => (
                  <th
                    key={h}
                    style={{
                      padding: '0.75rem 1rem',
                      textAlign: h === 'Bedrag' ? 'right' : 'left',
                      color: '#64748b',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    Geen transacties gevonden
                  </td>
                </tr>
              ) : (
                filtered.map((tx, idx) => (
                  <tr
                    key={tx.id}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                    }}
                  >
                    <td style={{ padding: '0.625rem 1rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {formatDate(tx.date)}
                    </td>
                    <td style={{ padding: '0.625rem 1rem', fontWeight: 500, maxWidth: 200 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tx.name || tx.counterparty}
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
                    <td style={{ padding: '0.625rem 1rem' }}>
                      {categoryBadge(tx)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile card list */}
      <div className="tx-card-view">
        {filtered.length === 0 ? (
          <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
            Geen transacties gevonden
          </div>
        ) : (
          filtered.map(tx => (
            <div
              key={tx.id}
              className="glass-card"
              style={{ padding: '0.875rem 1rem' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div style={{ flex: 1, minWidth: 0, marginRight: '0.75rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tx.name || tx.counterparty}
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
                <div>{categoryBadge(tx)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
