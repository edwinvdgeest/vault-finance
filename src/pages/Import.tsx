import { useRef, useState, useMemo } from 'react';
import { parseBunqCsv } from '../lib/parsers/bunq';
import { parseTriodosCsv } from '../lib/parsers/triodos';
import { parseAbnTxt } from '../lib/parsers/abn';
import { storage } from '../lib/storage';
import { deduplicate, formatCurrency, formatDate } from '../lib/utils';
import { getDefaultRulesWithIds } from '../lib/categorizer';
import type { Transaction, BankType } from '../types';

const BANK_LABELS: Record<string, string> = {
  bunq: 'bunq',
  triodos: 'Triodos',
  abn: 'ABN AMRO',
};

function daysSince(dateStr: string): number {
  const then = new Date(dateStr + 'T00:00:00').getTime();
  const now = Date.now();
  return Math.floor((now - then) / (24 * 60 * 60 * 1000));
}

export default function Import() {
  const [bank, setBank] = useState<BankType>('bunq');
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<Transaction[]>([]);
  const [allParsed, setAllParsed] = useState<Transaction[]>([]);
  const [fileName, setFileName] = useState('');
  const [startingBalance, setStartingBalance] = useState('');
  const [accountName, setAccountName] = useState('');
  const [imported, setImported] = useState<{ count: number; dupes: number } | null>(null);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Per-account import status (derived from transactions)
  const accountStatus = useMemo(() => {
    const accounts = storage.getAccounts();
    const txs = storage.getTransactions();
    const txsByIban = new Map<string, Transaction[]>();
    for (const tx of txs) {
      if (!txsByIban.has(tx.account)) txsByIban.set(tx.account, []);
      txsByIban.get(tx.account)!.push(tx);
    }
    return accounts.map(acc => {
      const accTxs = txsByIban.get(acc.iban) ?? [];
      const dates = accTxs.map(t => t.date).sort();
      const lastDate = dates[dates.length - 1] ?? null;
      const firstDate = dates[0] ?? null;
      const daysOld = lastDate ? daysSince(lastDate) : null;
      return {
        ...acc,
        lastDate,
        firstDate,
        count: accTxs.length,
        daysOld,
      };
    });
  }, [refreshKey]);

  function parseFile(text: string) {
    const rules = storage.getRules().length > 0 ? storage.getRules() : getDefaultRulesWithIds();
    try {
      const txs = bank === 'bunq'
        ? parseBunqCsv(text, rules)
        : bank === 'triodos'
        ? parseTriodosCsv(text, rules)
        : parseAbnTxt(text, rules);
      setAllParsed(txs);
      setPreview(txs.slice(0, 50));
      setError('');
    } catch (e) {
      setError('Kon bestand niet verwerken. Controleer het formaat.');
      console.error(e);
    }
  }

  function handleFile(file: File) {
    setFileName(file.name);
    setImported(null);
    const reader = new FileReader();
    reader.onload = (e) => parseFile(e.target?.result as string);
    reader.readAsText(file, bank === 'abn' ? 'windows-1252' : 'utf-8');
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleImport() {
    const rules = storage.getRules().length > 0 ? storage.getRules() : getDefaultRulesWithIds();
    const text = (fileRef.current?.files?.[0]) ? undefined : null;
    if (!preview.length) return;

    // Import all parsed transactions, not just the preview slice
    const existing = storage.getTransactions();
    const source = allParsed.length > 0 ? allParsed : preview;
    const deduped = deduplicate(source, existing);

    storage.addTransactions(deduped);

    // Ensure account exists
    if (preview.length > 0) {
      const iban = preview[0].account;
      const accs = storage.getAccounts();
      const exists = accs.find(a => a.iban === iban);
      if (!exists) {
        storage.upsertAccount({
          id: iban,
          name: accountName || iban,
          iban,
          bank,
          startingBalance: parseFloat(startingBalance) || 0,
          startingDate: source[source.length - 1]?.date ?? new Date().toISOString().slice(0, 10),
        });
      }
    }

    // Ensure default rules are seeded
    if (storage.getRules().length === 0) {
      storage.setRules(getDefaultRulesWithIds());
    }

    setImported({ count: deduped.length, dupes: source.length - deduped.length });
    setAllParsed([]);
    setPreview([]);
    setFileName('');
    setRefreshKey(k => k + 1);
    void rules;
    void text;
  }

  function handleClearAll() {
    storage.clearTransactionsAndAccounts();
    setShowClearConfirm(false);
    setRefreshKey(k => k + 1);
    setImported(null);
    setError('');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 800 }}>
      {/* Per-account import status */}
      {accountStatus.length > 0 && (
        <div className="glass-card">
          <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.875rem' }}>
            Import status per rekening
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {accountStatus.map(acc => {
              const isStale = acc.daysOld !== null && acc.daysOld > 30;
              const isMissing = acc.lastDate === null;
              const statusColor = isMissing ? '#ef4444' : isStale ? '#f59e0b' : '#10b981';
              const statusBg = isMissing ? 'rgba(239,68,68,0.08)' : isStale ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.06)';
              return (
                <div
                  key={acc.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.625rem 0.875rem',
                    background: statusBg,
                    border: `1px solid ${statusColor}33`,
                    borderRadius: '0.5rem',
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#e2e8f0' }}>{acc.name}</span>
                      <span style={{ fontSize: '0.7rem', color: '#7dd3fc', background: 'rgba(14,165,233,0.12)', padding: '0.1rem 0.4rem', borderRadius: '0.25rem' }}>
                        {BANK_LABELS[acc.bank] ?? acc.bank}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.15rem' }}>
                      {isMissing ? (
                        <span>Nog geen transacties</span>
                      ) : (
                        <>
                          Laatste transactie: <span style={{ color: statusColor }}>{formatDate(acc.lastDate!)}</span>
                          {' · '}{acc.count} transacties
                          {' · '}{acc.daysOld === 0 ? 'vandaag' : acc.daysOld === 1 ? 'gisteren' : `${acc.daysOld} dagen geleden`}
                        </>
                      )}
                    </div>
                  </div>
                  {isStale && !isMissing && (
                    <span title="Import is gedateerd" style={{ fontSize: '0.68rem', fontWeight: 600, color: '#f59e0b', background: 'rgba(245,158,11,0.15)', padding: '0.2rem 0.5rem', borderRadius: '0.375rem', whiteSpace: 'nowrap' }}>
                      ⚠ update nodig
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="glass-card">
        <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1rem' }}>
          Bank & Instellingen
        </p>
        <div className="grid-halves" style={{ gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Bank</label>
            <select
              className="glass-input"
              style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}
              value={bank}
              onChange={e => setBank(e.target.value as BankType)}
            >
              <option value="bunq">bunq</option>
              <option value="triodos">Triodos</option>
              <option value="abn">ABN AMRO</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Rekeningnaam (nieuw)</label>
            <input
              className="glass-input"
              style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}
              placeholder="Bijv. Spaarrekening"
              value={accountName}
              onChange={e => setAccountName(e.target.value)}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Beginsaldo (€)</label>
            <input
              type="number"
              className="glass-input"
              style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}
              placeholder="0.00"
              value={startingBalance}
              onChange={e => setStartingBalance(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        className="glass-card"
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        style={{
          position: 'relative',
          border: dragging ? '2px dashed rgba(139,92,246,0.6)' : '2px dashed rgba(255,255,255,0.1)',
          cursor: 'pointer',
          textAlign: 'center',
          padding: '2.5rem 1.5rem',
          minHeight: '10rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'border-color 0.2s',
          background: dragging ? 'rgba(139,92,246,0.05)' : undefined,
        }}
      >
        {/* Native input overlays the entire drop zone — required for iOS Safari */}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,.tab"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'pointer',
            zIndex: 1,
          }}
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
        />
        <p style={{ fontSize: '2rem', marginBottom: '0.5rem', pointerEvents: 'none' }}>📂</p>
        <p style={{ fontWeight: 500, marginBottom: '0.25rem', pointerEvents: 'none' }}>
          {fileName || 'Sleep bestand hier of klik om te selecteren'}
        </p>
        <p style={{ fontSize: '0.8rem', color: '#64748b', pointerEvents: 'none' }}>
          {bank === 'bunq'
            ? 'bunq CSV (puntkomma-gescheiden, met header)'
            : bank === 'triodos'
            ? 'Triodos CSV (komma-gescheiden, geen header)'
            : 'ABN AMRO TXT (tab-gescheiden, geen header)'}
        </p>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#fca5a5', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {imported && (
        <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#6ee7b7', fontSize: '0.875rem' }}>
          ✓ {imported.count} transacties geïmporteerd{imported.dupes > 0 ? ` (${imported.dupes} duplicaten overgeslagen)` : ''}.
        </div>
      )}

      {preview.length > 0 && (
        <button
          className="glass-button"
          style={{
            width: '100%',
            padding: '0.875rem 1.5rem',
            fontFamily: 'inherit',
            fontSize: '1rem',
            fontWeight: 700,
            background: 'rgba(139,92,246,0.3)',
            borderColor: 'rgba(139,92,246,0.6)',
            color: 'white',
            borderRadius: '0.75rem',
            cursor: 'pointer',
            letterSpacing: '0.02em',
          }}
          onClick={handleImport}
        >
          Importeren ({allParsed.length} transacties)
        </button>
      )}

      {preview.length > 0 && (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600 }}>Voorbeeld ({allParsed.length > 50 ? `${preview.length} van ${allParsed.length}` : preview.length} transacties)</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {['Datum', 'Naam', 'Bedrag', 'Categorie'].map(h => (
                    <th key={h} style={{ padding: '0.625rem 1rem', textAlign: h === 'Bedrag' ? 'right' : 'left', color: '#64748b', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((tx, i) => (
                  <tr key={tx.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    <td style={{ padding: '0.5rem 1rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>{formatDate(tx.date)}</td>
                    <td style={{ padding: '0.5rem 1rem', maxWidth: 220 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.name || tx.counterparty}</div>
                    </td>
                    <td style={{ padding: '0.5rem 1rem', textAlign: 'right', fontWeight: 600, color: tx.amount >= 0 ? '#10b981' : '#ef4444', whiteSpace: 'nowrap' }}>
                      {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                    </td>
                    <td style={{ padding: '0.5rem 1rem' }}>
                      <span style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: '1rem', color: '#c4b5fd', padding: '0.15rem 0.5rem', fontSize: '0.72rem' }}>
                        {tx.category}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Clear data — danger zone */}
      <div className="glass-card" style={{ borderColor: 'rgba(239,68,68,0.2)' }}>
        <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
          Leeg starten
        </p>
        <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 0, marginBottom: '0.875rem' }}>
          Verwijder alle transacties en rekeningen om opnieuw te beginnen. Categorieregels blijven bewaard.
        </p>
        {!showClearConfirm ? (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="glass-button"
            style={{
              fontFamily: 'inherit', padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 600,
              background: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.35)', color: '#fca5a5',
            }}
          >
            Alle transacties en rekeningen wissen
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: '#fca5a5', fontWeight: 600 }}>Weet je het zeker?</span>
            <button
              onClick={handleClearAll}
              className="glass-button"
              style={{
                fontFamily: 'inherit', padding: '0.4rem 0.875rem', fontSize: '0.8rem', fontWeight: 600,
                background: 'rgba(239,68,68,0.25)', borderColor: 'rgba(239,68,68,0.5)', color: '#fff',
              }}
            >
              Ja, wis alles
            </button>
            <button
              onClick={() => setShowClearConfirm(false)}
              className="glass-button"
              style={{ fontFamily: 'inherit', padding: '0.4rem 0.875rem', fontSize: '0.8rem', color: '#94a3b8' }}
            >
              Annuleren
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
