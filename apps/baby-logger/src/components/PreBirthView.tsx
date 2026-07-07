import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Baby } from '../types';
import Settings from './Settings';

interface Props {
  baby: Baby;
  displayName: string;
  onBabyUpdate: (baby: Baby) => void;
  onSignOut: () => void;
}

function getCountdown(dueDate: string) {
  const due = new Date(dueDate + 'T00:00:00');
  const now = new Date();
  const diff = due.getTime() - now.getTime();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, overdue: true };
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return { days, hours, minutes, seconds, overdue: false };
}

export default function PreBirthView({ baby, displayName, onBabyUpdate, onSignOut }: Props) {
  const [countdown, setCountdown] = useState(getCountdown(baby.due_date));
  const [showSettings, setShowSettings] = useState(false);
  const [showBirthForm, setShowBirthForm] = useState(false);
  const [birthDate, setBirthDate] = useState('');
  const [babyName, setBabyName] = useState(baby.name ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setCountdown(getCountdown(baby.due_date)), 1000);
    return () => clearInterval(t);
  }, [baby.due_date]);

  async function handleBabyArrived() {
    if (!birthDate) return;
    setSaving(true);
    const updates: Record<string, unknown> = { birth_date: birthDate };
    if (babyName.trim()) updates.name = babyName.trim();

    const { data, error } = await supabase()
      .from('babies')
      .update(updates)
      .eq('id', baby.id)
      .select()
      .single();

    setSaving(false);
    if (data && !error) onBabyUpdate(data);
  }

  if (showSettings) {
    return (
      <Settings
        baby={baby}
        onBabyUpdate={onBabyUpdate}
        onBack={() => setShowSettings(false)}
        onSignOut={onSignOut}
      />
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <span style={styles.headerTitle}>Baby Logger</span>
        <button onClick={() => setShowSettings(true)} style={styles.settingsBtn}>
          Settings
        </button>
      </header>

      <div style={styles.hero}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>&#127769;</div>

        {countdown.overdue ? (
          <div style={styles.countdownLabel}>Any day now!</div>
        ) : (
          <>
            <div style={styles.countdownGrid}>
              <CountdownUnit value={countdown.days} label="days" />
              <CountdownUnit value={countdown.hours} label="hours" />
              <CountdownUnit value={countdown.minutes} label="min" />
              <CountdownUnit value={countdown.seconds} label="sec" />
            </div>
            <div style={styles.countdownLabel}>until due date</div>
          </>
        )}

        <p style={styles.readyText}>
          Baby Logger is ready. Once your little one arrives, tap below to start tracking.
        </p>

        {!showBirthForm ? (
          <button onClick={() => setShowBirthForm(true)} style={styles.arrivedBtn}>
            Baby has arrived!
          </button>
        ) : (
          <div style={styles.birthForm}>
            <input
              type="text"
              placeholder="Baby's name (optional)"
              value={babyName}
              onChange={(e) => setBabyName(e.target.value)}
              style={styles.input}
            />
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              style={styles.input}
              required
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleBabyArrived} disabled={saving || !birthDate} style={styles.confirmBtn}>
                {saving ? 'Saving...' : 'Confirm'}
              </button>
              <button onClick={() => setShowBirthForm(false)} style={styles.cancelBtn}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {baby.name && (
        <div style={styles.nameTag}>
          Waiting for <span style={{ color: 'var(--accent)' }}>{baby.name}</span>
        </div>
      )}
    </div>
  );
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: '2.2rem',
        fontWeight: 700,
        color: 'var(--accent)',
        lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 4 }}>{label}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 480,
    margin: '0 auto',
    padding: '0 16px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 0',
    borderBottom: '1px solid var(--border)',
    position: 'sticky',
    top: 0,
    background: 'var(--bg)',
    zIndex: 10,
  },
  headerTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '1.1rem',
    color: 'var(--accent)',
  },
  settingsBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--muted)',
    padding: '6px 12px',
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
  hero: {
    textAlign: 'center',
    padding: '48px 0 32px',
  },
  countdownGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 8,
    maxWidth: 320,
    margin: '0 auto 12px',
  },
  countdownLabel: {
    fontFamily: 'var(--font-display)',
    color: 'var(--muted)',
    fontSize: '0.95rem',
    fontWeight: 500,
  },
  readyText: {
    color: 'var(--muted)',
    fontSize: '0.9rem',
    lineHeight: 1.5,
    margin: '24px auto',
    maxWidth: 300,
  },
  arrivedBtn: {
    background: 'transparent',
    border: '1px solid var(--accent-secondary)',
    borderRadius: 'var(--radius)',
    color: 'var(--accent-secondary)',
    padding: '12px 24px',
    fontSize: '0.95rem',
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 8,
  },
  birthForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    maxWidth: 280,
    margin: '12px auto 0',
  },
  input: {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '10px 14px',
    color: 'var(--text)',
    fontSize: '0.95rem',
    fontFamily: 'var(--font-body)',
    outline: 'none',
  },
  confirmBtn: {
    flex: 1,
    background: 'var(--accent-secondary)',
    color: '#121018',
    border: 'none',
    borderRadius: 'var(--radius)',
    padding: '10px',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    cursor: 'pointer',
  },
  cancelBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--muted)',
    padding: '10px 16px',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    fontSize: '0.9rem',
  },
  nameTag: {
    textAlign: 'center',
    color: 'var(--muted)',
    fontSize: '0.9rem',
    fontFamily: 'var(--font-display)',
    paddingBottom: 32,
  },
};
