import { useState, useEffect } from 'react';
import { onSaveError } from '../lib/storage';

export default function SaveErrorToast() {
  const [error, setError] = useState('');

  useEffect(() => {
    return onSaveError(msg => {
      setError(msg);
      setTimeout(() => setError(''), 5000);
    });
  }, []);

  if (!error) return null;

  return (
    <div style={{
      position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
      borderRadius: '0.75rem', padding: '0.75rem 1.5rem', color: '#fca5a5',
      fontSize: '0.875rem', fontWeight: 500, zIndex: 1000,
      backdropFilter: 'blur(12px)', boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
      animation: 'toast-in 0.3s ease-out', maxWidth: '90vw',
    }}>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(-50%) translateY(1rem); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
      ⚠ {error}
    </div>
  );
}
