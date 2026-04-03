import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { storage } from '../lib/storage';
import { formatCurrency } from '../lib/utils';
import type { Transaction } from '../types';

const DAYS_NL = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
const MONTHS_NL = [
  'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
  'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December',
];

function isTransfer(tx: Transaction): boolean {
  return !!tx.isInternal;
}

interface DaySummary {
  date: string;
  income: number;
  expenses: number;
  transactions: Transaction[];
}

export default function Calendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const navigate = useNavigate();

  const transactions = storage.getTransactions();
  const accounts = storage.getAccounts();
  const accountName = (iban: string) => accounts.find(a => a.iban === iban)?.name ?? iban;

  // Group transactions by date for this month
  const dayMap = useMemo(() => {
    const map = new Map<string, DaySummary>();
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;

    for (const tx of transactions) {
      if (!tx.date.startsWith(prefix)) continue;
      if (!map.has(tx.date)) map.set(tx.date, { date: tx.date, income: 0, expenses: 0, transactions: [] });
      const day = map.get(tx.date)!;
      day.transactions.push(tx);
      if (!isTransfer(tx)) {
        if (tx.amount > 0) day.income += tx.amount;
        else day.expenses += Math.abs(tx.amount);
      }
    }
    return map;
  }, [transactions, year, month]);

  // Month totals
  const monthTotals = useMemo(() => {
    let income = 0, expenses = 0;
    for (const day of dayMap.values()) {
      income += day.income;
      expenses += day.expenses;
    }
    return { income, expenses, net: income - expenses };
  }, [dayMap]);

  // Build calendar grid
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  // Monday = 0, Sunday = 6
  const startWeekday = (firstDay.getDay() + 6) % 7;

  const weeks: (number | null)[][] = [];
  let currentWeek: (number | null)[] = Array(startWeekday).fill(null);

  for (let d = 1; d <= daysInMonth; d++) {
    currentWeek.push(d);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDate(null);
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDate(null);
  }

  function dateStr(day: number): string {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const selectedDay = selectedDate ? dayMap.get(selectedDate) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Month navigation + totals */}
      <div className="glass-card" style={{ padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={prevMonth}
            className="glass-button"
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem', fontFamily: 'inherit', cursor: 'pointer' }}
          >
            ‹
          </button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>
              {MONTHS_NL[month]} {year}
            </div>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '0.35rem', fontSize: '0.8rem' }}>
              <span style={{ color: '#10b981' }}>+{formatCurrency(monthTotals.income)}</span>
              <span style={{ color: '#ef4444' }}>-{formatCurrency(monthTotals.expenses)}</span>
              <span style={{ color: monthTotals.net >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                {monthTotals.net >= 0 ? '+' : ''}{formatCurrency(monthTotals.net)}
              </span>
            </div>
          </div>
          <button
            onClick={nextMonth}
            className="glass-button"
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem', fontFamily: 'inherit', cursor: 'pointer' }}
          >
            ›
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="glass-card" style={{ padding: '0.75rem' }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
          {DAYS_NL.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: 600, color: '#64748b', padding: '0.3rem 0' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {week.map((day, di) => {
              if (day === null) return <div key={di} />;
              const ds = dateStr(day);
              const summary = dayMap.get(ds);
              const isToday = ds === todayStr;
              const isSelected = ds === selectedDate;
              const hasData = !!summary;

              return (
                <button
                  key={di}
                  onClick={() => setSelectedDate(isSelected ? null : ds)}
                  style={{
                    background: isSelected
                      ? 'rgba(139,92,246,0.2)'
                      : isToday
                      ? 'rgba(6,182,212,0.1)'
                      : hasData
                      ? 'rgba(255,255,255,0.03)'
                      : 'transparent',
                    border: isSelected
                      ? '1px solid rgba(139,92,246,0.5)'
                      : isToday
                      ? '1px solid rgba(6,182,212,0.3)'
                      : '1px solid rgba(255,255,255,0.04)',
                    borderRadius: '0.5rem',
                    padding: '0.4rem 0.25rem',
                    cursor: 'pointer',
                    minHeight: 64,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.15rem',
                    transition: 'background 0.1s, border-color 0.1s',
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: isToday ? 700 : 500,
                    color: isToday ? '#06b6d4' : '#cbd5e1',
                  }}>
                    {day}
                  </span>
                  {summary && summary.expenses > 0 && (
                    <span style={{ fontSize: '0.6rem', color: '#ef4444', fontWeight: 600, lineHeight: 1.2 }}>
                      -{formatCurrency(summary.expenses)}
                    </span>
                  )}
                  {summary && summary.income > 0 && (
                    <span style={{ fontSize: '0.6rem', color: '#10b981', fontWeight: 600, lineHeight: 1.2 }}>
                      +{formatCurrency(summary.income)}
                    </span>
                  )}
                  {summary && summary.transactions.length > 0 && (
                    <div style={{ display: 'flex', gap: 2, marginTop: 1 }}>
                      {summary.transactions.length <= 5
                        ? summary.transactions.map((_, i) => (
                            <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(139,92,246,0.5)' }} />
                          ))
                        : <>
                            {[0,1,2].map(i => (
                              <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(139,92,246,0.5)' }} />
                            ))}
                            <span style={{ fontSize: '0.5rem', color: '#64748b' }}>+{summary.transactions.length - 3}</span>
                          </>
                      }
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Selected day detail */}
      {selectedDay && (
        <div className="glass-card" style={{ padding: '1rem 1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
              {new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(selectedDate + 'T00:00:00'))}
            </span>
            <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem' }}>
              {selectedDay.income > 0 && <span style={{ color: '#10b981' }}>+{formatCurrency(selectedDay.income)}</span>}
              {selectedDay.expenses > 0 && <span style={{ color: '#ef4444' }}>-{formatCurrency(selectedDay.expenses)}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {selectedDay.transactions.map(tx => (
              <div
                key={tx.id}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.5rem 0.75rem',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '0.375rem',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.name || tx.counterparty}
                    </span>
                    {tx.isInternal && <span style={{ fontSize: '0.55rem', color: '#06b6d4', background: 'rgba(6,182,212,0.1)', padding: '0.05rem 0.25rem', borderRadius: '0.5rem', fontWeight: 600 }}>intern</span>}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.1rem' }}>
                    <span>{accountName(tx.account)}</span>
                    <span>·</span>
                    <span style={{
                      background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)',
                      borderRadius: '1rem', padding: '0 0.4rem', fontSize: '0.65rem', color: '#c4b5fd',
                    }}>
                      {tx.category}
                    </span>
                  </div>
                </div>
                <span style={{
                  fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
                  color: tx.amount >= 0 ? '#10b981' : '#ef4444',
                }}>
                  {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                </span>
              </div>
            ))}
          </div>
          <button
            className="glass-button"
            style={{ marginTop: '0.75rem', padding: '0.4rem 1rem', fontSize: '0.8rem', fontFamily: 'inherit', color: '#94a3b8', width: '100%' }}
            onClick={() => navigate(`/transactions?start=${selectedDate}&end=${selectedDate}`)}
          >
            Bekijk in transacties
          </button>
        </div>
      )}
    </div>
  );
}
