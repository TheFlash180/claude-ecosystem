import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Baby, HouseholdMember } from '../types';

interface Props {
  userId: string;
  onComplete: (member: HouseholdMember, baby: Baby) => void;
}

export default function Onboarding({ userId, onComplete }: Props) {
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!displayName.trim()) return;
    setError('');
    setLoading(true);

    const sb = supabase();

    const { data: household, error: hErr } = await sb
      .from('households')
      .insert({ name: 'Our Family' })
      .select()
      .single();

    if (hErr || !household) {
      setError(hErr?.message ?? 'Failed to create family');
      setLoading(false);
      return;
    }

    const { data: member, error: mErr } = await sb
      .from('household_members')
      .insert({
        household_id: household.id,
        user_id: userId,
        display_name: displayName.trim(),
        role: 'parent',
      })
      .select()
      .single();

    if (mErr || !member) {
      setError(mErr?.message ?? 'Failed to create member');
      setLoading(false);
      return;
    }

    const { data: baby, error: bErr } = await sb
      .from('babies')
      .insert({
        household_id: household.id,
        due_date: '2026-12-17',
      })
      .select()
      .single();

    if (bErr || !baby) {
      setError(bErr?.message ?? 'Failed to create baby');
      setLoading(false);
      return;
    }

    setLoading(false);
    onComplete(member, baby);
  }

  async function handleJoin() {
    if (!displayName.trim() || !inviteCode.trim()) return;
    setError('');
    setLoading(true);

    const sb = supabase();

    const { data: household, error: hErr } = await sb
      .from('households')
      .select('*')
      .eq('invite_code', inviteCode.trim().toLowerCase())
      .single();

    if (hErr || !household) {
      setError('Invalid invite code');
      setLoading(false);
      return;
    }

    const { data: member, error: mErr } = await sb
      .from('household_members')
      .insert({
        household_id: household.id,
        user_id: userId,
        display_name: displayName.trim(),
        role: 'parent',
      })
      .select()
      .single();

    if (mErr || !member) {
      setError(mErr?.message ?? 'Failed to join family');
      setLoading(false);
      return;
    }

    const { data: baby } = await sb
      .from('babies')
      .select('*')
      .eq('household_id', household.id)
      .limit(1)
      .single();

    setLoading(false);
    if (baby) onComplete(member, baby);
  }

  if (mode === 'choose') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ fontSize: 48 }}>&#127769;</div>
          <h1 style={styles.title}>Welcome!</h1>
          <p style={styles.subtitle}>Let's set up your family</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button onClick={() => setMode('create')} style={styles.button}>
              Create your family
            </button>
            <button onClick={() => setMode('join')} style={styles.buttonSecondary}>
              Join a family
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>
          {mode === 'create' ? 'Create your family' : 'Join a family'}
        </h2>
        <p style={styles.subtitle}>
          {mode === 'create'
            ? "You'll get an invite code to share"
            : 'Enter the code your partner shared'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="text"
            placeholder="Your name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={styles.input}
            autoFocus
          />
          {mode === 'join' && (
            <input
              type="text"
              placeholder="Invite code"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              style={styles.input}
            />
          )}
          {error && <div style={{ color: '#ff6b7a', fontSize: '0.85rem' }}>{error}</div>}
          <button
            onClick={mode === 'create' ? handleCreate : handleJoin}
            disabled={loading}
            style={styles.button}
          >
            {loading ? '...' : mode === 'create' ? 'Create' : 'Join'}
          </button>
          <button onClick={() => setMode('choose')} style={styles.back}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100dvh',
    padding: 20,
  },
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: 32,
    width: '100%',
    maxWidth: 380,
    textAlign: 'center',
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.4rem',
    fontWeight: 700,
    color: 'var(--accent)',
    margin: '8px 0 4px',
  },
  subtitle: {
    color: 'var(--muted)',
    fontSize: '0.9rem',
    margin: '0 0 20px',
  },
  input: {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '12px 16px',
    color: 'var(--text)',
    fontSize: '1rem',
    fontFamily: 'var(--font-body)',
    outline: 'none',
  },
  button: {
    background: 'var(--accent)',
    color: '#121018',
    border: 'none',
    borderRadius: 'var(--radius)',
    padding: '14px',
    fontSize: '1rem',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    cursor: 'pointer',
  },
  buttonSecondary: {
    background: 'transparent',
    color: 'var(--accent)',
    border: '1px solid var(--accent)',
    borderRadius: 'var(--radius)',
    padding: '14px',
    fontSize: '1rem',
    fontWeight: 600,
    fontFamily: 'var(--font-display)',
    cursor: 'pointer',
  },
  back: {
    background: 'none',
    border: 'none',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontFamily: 'var(--font-body)',
  },
};
