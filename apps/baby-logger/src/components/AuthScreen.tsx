import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const sb = supabase();
    const { error: authError } = mode === 'signup'
      ? await sb.auth.signUp({ email, password })
      : await sb.auth.signInWithPassword({ email, password });

    setLoading(false);
    if (authError) setError(authError.message);
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>&#127769;</div>
        <h1 style={styles.title}>Baby Logger</h1>
        <p style={styles.subtitle}>
          {mode === 'signin' ? 'Welcome back' : 'Create your account'}
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={styles.input}
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={styles.input}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          />
          {error && <div style={styles.error}>{error}</div>}
          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? '...' : mode === 'signin' ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <button
          onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}
          style={styles.toggle}
        >
          {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
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
  logo: {
    fontSize: 48,
    marginBottom: 8,
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.6rem',
    fontWeight: 700,
    color: 'var(--accent)',
    margin: '0 0 4px',
  },
  subtitle: {
    color: 'var(--muted)',
    fontSize: '0.9rem',
    margin: '0 0 24px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
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
  error: {
    color: '#ff6b7a',
    fontSize: '0.85rem',
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
    marginTop: 4,
  },
  toggle: {
    background: 'none',
    border: 'none',
    color: 'var(--accent)',
    cursor: 'pointer',
    fontSize: '0.85rem',
    marginTop: 16,
    fontFamily: 'var(--font-body)',
  },
};
