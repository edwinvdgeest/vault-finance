import { useRef, useState } from 'react';
import { parseBunqCsv } from '../lib/parsers/bunq';
import { parseTriodosCsv } from '../lib/parsers/triodos';
import { storage } from '../lib/storage';
import { deduplicate, formatCurrency, formatDate } from '../lib/utils';
import { getDefaultRulesWithIds } from '../lib/categorizer';
import type { Transaction, BankType } from '../types';

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
  const fileRef = useRef<HTMLInputElement>(null);

  function parseFile(text: string) {
    const rules = storage.getRules().length > 0 ? storage.getRules() : getDefaultRulesWithIds();
    try {
      const txs = bank === 'bunq' ? parseBunqCsv(text, rules) : parseTriodosCsv(text, rules);
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
    reader.readAsText(file, 'utf-8');
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
    void rules;
    void text;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 800 }}>
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
        onClick={() => fileRef.current?.click()}
        style={{
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
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
        />
        <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📂</p>
        <p style={{ fontWeight: 500, marginBottom: '0.25rem' }}>
          {fileName || 'Sleep CSV hier of klik om te selecteren'}
        </p>
        <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
          {bank === 'bunq' ? 'bunq CSV (puntkomma-gescheiden, met header)' : 'Triodos CSV (komma-gescheiden, geen header)'}
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
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600 }}>Voorbeeld ({allParsed.length > 50 ? `${preview.length} van ${allParsed.length}` : preview.length} transacties)</span>
            <button
              className="glass-button"
              style={{ padding: '0.5rem 1.25rem', fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 600, background: 'rgba(139,92,246,0.2)', borderColor: 'rgba(139,92,246,0.4)', color: 'white' }}
              onClick={handleImport}
            >
              Importeer
            </button>
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
    </div>
  );
}
