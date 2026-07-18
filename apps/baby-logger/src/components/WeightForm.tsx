import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { localIsoToday } from '../lib/dates';

interface Props {
  babyId: string;
  userId: string;
  onDone: () => void;
}

export default function WeightForm({ babyId, userId, onDone }: Props) {
  const [weight, setWeight] = useState('');
  const [date, setDate] = useState(localIsoToday());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!weight) return;
    setSaving(true);
    setError('');
    const { error: err } = await supabase().from('weight_events').insert({
      baby_id: babyId,
      logged_by: userId,
      weight_g: parseInt(weight),
      measured_at: date,
    });
    setSaving(false);
    if (err) {
      setError("Couldn't save — check your connection and try again.");
      return;
    }
    onDone();
  }

  return (
    <div style={styles.overlay} onClick={onDone}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <h3 style={styles.title}>Log Weight</h3>

        <input
          type="number"
          placeholder="Weight in grams"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          style={styles.input}
          inputMode="numeric"
          autoFocus
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={styles.input}
        />

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.actions}>
          <button onClick={onDone} style={styles.cancelBtn}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !weight} style={styles.saveBtn}>
            {saving ? '...' : 'Save'}
          </button>
        </div>
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
    paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
  },
  title: {
    fontFamily: 'var(--font-display)',
    color: 'var(--weight)',
    fontSize: '1.1rem',
    margin: '0 0 16px',
    fontWeight: 700,
  },
  input: {
    width: '100%',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '10px 14px',
    color: 'var(--text)',
    fontSize: '0.95rem',
    fontFamily: 'var(--font-body)',
    outline: 'none',
    marginBottom: 10,
  },
  actions: {
    display: 'flex',
    gap: 8,
    marginTop: 4,
  },
  error: {
    color: '#e07a7a',
    fontSize: '0.82rem',
    marginBottom: 8,
    fontFamily: 'var(--font-body)',
  },
  cancelBtn: {
    flex: 1,
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '12px',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
  saveBtn: {
    flex: 2,
    background: 'var(--weight)',
    color: '#121018',
    border: 'none',
    borderRadius: 'var(--radius)',
    padding: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-display)',
  },
};
