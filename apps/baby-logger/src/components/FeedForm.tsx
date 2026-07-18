import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

interface Props {
  babyId: string;
  userId: string;
  onDone: () => void;
}

const feedTypes = [
  { value: 'breast_left', label: 'Left breast' },
  { value: 'breast_right', label: 'Right breast' },
  { value: 'bottle', label: 'Bottle' },
  { value: 'solid', label: 'Solid food' },
] as const;

export default function FeedForm({ babyId, userId, onDone }: Props) {
  const [feedType, setFeedType] = useState<string>('bottle');
  const [duration, setDuration] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setSaving(true);
    setError('');
    const { error: err } = await supabase().from('feed_events').insert({
      baby_id: babyId,
      logged_by: userId,
      feed_type: feedType,
      duration_minutes: duration ? parseInt(duration) : null,
      amount_ml: amount ? parseInt(amount) : null,
    });
    setSaving(false);
    if (err) {
      setError("Couldn't save — check your connection and try again.");
      return;
    }
    onDone();
  }

  const isBreast = feedType === 'breast_left' || feedType === 'breast_right';

  return (
    <div style={styles.overlay} onClick={onDone}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <h3 style={styles.title}>Log Feed</h3>

        <div style={styles.typeGrid}>
          {feedTypes.map((t) => (
            <button
              key={t.value}
              onClick={() => setFeedType(t.value)}
              style={{
                ...styles.typeBtn,
                ...(feedType === t.value ? styles.typeBtnActive : {}),
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {isBreast && (
          <input
            type="number"
            placeholder="Duration (minutes)"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            style={styles.input}
            inputMode="numeric"
          />
        )}

        {feedType === 'bottle' && (
          <input
            type="number"
            placeholder="Amount (ml)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={styles.input}
            inputMode="numeric"
          />
        )}

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.actions}>
          <button onClick={onDone} style={styles.cancelBtn}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={styles.saveBtn}>
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
  error: {
    color: '#e07a7a',
    fontSize: '0.82rem',
    marginBottom: 8,
    fontFamily: 'var(--font-body)',
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
    color: 'var(--accent-secondary)',
    fontSize: '1.1rem',
    margin: '0 0 16px',
    fontWeight: 700,
  },
  typeGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
    marginBottom: 12,
  },
  typeBtn: {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '10px',
    color: 'var(--text)',
    fontSize: '0.85rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
  typeBtnActive: {
    borderColor: 'var(--accent-secondary)',
    color: 'var(--accent-secondary)',
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
    marginBottom: 12,
  },
  actions: {
    display: 'flex',
    gap: 8,
    marginTop: 4,
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
    background: 'var(--accent-secondary)',
    color: '#121018',
    border: 'none',
    borderRadius: 'var(--radius)',
    padding: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-display)',
  },
};
