import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Baby, UserProfile } from '../types';

interface Props {
  baby: Baby;
  onBabyUpdate: (baby: Baby) => void;
  onBack: () => void;
  onSignOut: () => void;
}

export default function Settings({ baby, onBabyUpdate, onBack, onSignOut }: Props) {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [babyName, setBabyName] = useState(baby.name ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase()
      .from('profiles')
      .select('*')
      .then(({ data }) => { if (data) setProfiles(data); });
  }, []);

  async function handleSaveName() {
    if (babyName.trim() === (baby.name ?? '')) return;
    setSaving(true);
    const { data } = await supabase()
      .from('babies')
      .update({ name: babyName.trim() || null })
      .eq('id', baby.id)
      .select()
      .single();
    setSaving(false);
    if (data) onBabyUpdate(data);
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <button onClick={onBack} style={styles.backBtn}>Back</button>
        <span style={styles.headerTitle}>Settings</span>
        <div style={{ width: 50 }} />
      </header>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Baby</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            placeholder="Baby's name"
            value={babyName}
            onChange={(e) => setBabyName(e.target.value)}
            style={{ ...styles.input, flex: 1 }}
          />
          <button onClick={handleSaveName} disabled={saving} style={styles.smallBtn}>
            {saving ? '...' : 'Save'}
          </button>
        </div>
        <div style={styles.info}>Due: {baby.due_date}</div>
        {baby.birth_date && <div style={styles.info}>Born: {baby.birth_date}</div>}
      </section>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Family</h3>
        <div>
          {profiles.map((p) => (
            <div key={p.id} style={styles.memberRow}>
              <span style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'var(--accent)',
                color: '#121018',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 700,
                flexShrink: 0,
              }}>
                {p.display_name.charAt(0).toUpperCase()}
              </span>
              <span>{p.display_name}</span>
            </div>
          ))}
        </div>
      </section>

      <button onClick={onSignOut} style={styles.signOutBtn}>Sign out</button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 480,
    margin: '0 auto',
    padding: '0 16px 32px',
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
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--accent)',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontFamily: 'var(--font-body)',
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '0.95rem',
    fontWeight: 700,
    color: 'var(--accent)',
    margin: '0 0 12px',
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
  smallBtn: {
    background: 'var(--accent)',
    color: '#121018',
    border: 'none',
    borderRadius: 'var(--radius)',
    padding: '10px 16px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-display)',
    fontSize: '0.85rem',
  },
  info: {
    fontSize: '0.82rem',
    color: 'var(--muted)',
    marginTop: 6,
  },
  memberRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 0',
    borderBottom: '1px solid var(--border)',
    fontSize: '0.9rem',
  },
  signOutBtn: {
    marginTop: 32,
    width: '100%',
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '12px',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    fontSize: '0.9rem',
  },
};
