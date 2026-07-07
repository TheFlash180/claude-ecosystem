import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

interface Props {
  babyId: string;
  userId: string;
  onDone: () => void;
}

const types = [
  { value: 'wet', label: 'Wet', emoji: '💧' },
  { value: 'dirty', label: 'Dirty', emoji: '💩' },
  { value: 'both', label: 'Both', emoji: '💧💩' },
] as const;

export default function NappyForm({ babyId, userId, onDone }: Props) {
  const [saving, setSaving] = useState(false);

  async function handleTap(nappyType: string) {
    setSaving(true);
    await supabase().from('nappy_events').insert({
      baby_id: babyId,
      logged_by: userId,
      nappy_type: nappyType,
    });
    setSaving(false);
    onDone();
  }

  return (
    <div style={styles.overlay} onClick={onDone}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <h3 style={styles.title}>Log Nappy</h3>
        <div style={styles.grid}>
          {types.map((t) => (
            <button
              key={t.value}
              onClick={() => handleTap(t.value)}
              disabled={saving}
              style={styles.btn}
            >
              <span style={{ fontSize: 28 }}>{t.emoji}</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{t.label}</span>
            </button>
          ))}
        </div>
        <button onClick={onDone} style={styles.cancel}>Cancel</button>
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
    color: 'var(--nappy)',
    fontSize: '1.1rem',
    margin: '0 0 16px',
    fontWeight: 700,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 10,
    marginBottom: 16,
  },
  btn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    background: 'var(--bg)',
    border: '1px solid var(--nappy)',
    borderRadius: 'var(--radius)',
    padding: '16px 8px',
    color: 'var(--nappy)',
    cursor: 'pointer',
    fontFamily: 'var(--font-display)',
    minHeight: 56,
  },
  cancel: {
    background: 'none',
    border: 'none',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontFamily: 'var(--font-body)',
  },
};
