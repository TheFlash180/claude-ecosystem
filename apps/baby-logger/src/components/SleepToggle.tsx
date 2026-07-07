import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { SleepEvent } from '../types';

interface Props {
  babyId: string;
  userId: string;
  activeSleep: SleepEvent | null;
  onToggle: () => void;
}

export default function SleepToggle({ babyId, userId, activeSleep, onToggle }: Props) {
  const [elapsed, setElapsed] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activeSleep) { setElapsed(''); return; }
    function tick() {
      const start = new Date(activeSleep!.started_at).getTime();
      const diff = Date.now() - start;
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setElapsed(h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`);
    }
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [activeSleep]);

  async function handleToggle() {
    setSaving(true);
    const sb = supabase();

    if (activeSleep) {
      await sb.from('sleep_events')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', activeSleep.id);
    } else {
      await sb.from('sleep_events').insert({
        baby_id: babyId,
        logged_by: userId,
      });
    }
    setSaving(false);
    onToggle();
  }

  return (
    <div style={styles.overlay} onClick={onToggle}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <h3 style={styles.title}>
          {activeSleep ? 'Currently sleeping' : 'Start sleep'}
        </h3>

        {activeSleep && elapsed && (
          <div style={styles.elapsed}>{elapsed}</div>
        )}

        <button onClick={handleToggle} disabled={saving} style={{
          ...styles.btn,
          background: activeSleep ? 'var(--sleep)' : 'var(--surface)',
          color: activeSleep ? '#121018' : 'var(--sleep)',
          border: activeSleep ? 'none' : '1px solid var(--sleep)',
        }}>
          {saving ? '...' : activeSleep ? 'Stop sleep' : 'Start sleep'}
        </button>

        <button onClick={onToggle} style={styles.cancel}>Close</button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(18, 16, 24, 0.8)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 50,
  },
  sheet: {
    background: 'var(--surface)',
    borderRadius: '16px 16px 0 0',
    padding: '24px 20px',
    width: '100%',
    maxWidth: 480,
    textAlign: 'center',
    paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
  },
  title: {
    fontFamily: 'var(--font-display)',
    color: 'var(--sleep)',
    fontSize: '1.1rem',
    margin: '0 0 12px',
    fontWeight: 700,
  },
  elapsed: {
    fontFamily: 'var(--font-display)',
    fontSize: '2rem',
    fontWeight: 700,
    color: 'var(--sleep)',
    marginBottom: 16,
  },
  btn: {
    width: '100%',
    borderRadius: 'var(--radius)',
    padding: '14px',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-display)',
    marginBottom: 8,
  },
  cancel: {
    background: 'none',
    border: 'none',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontFamily: 'var(--font-body)',
    marginTop: 4,
  },
};
