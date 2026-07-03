import React, { useEffect, useState } from 'react';
import { AppShell, supabaseConfigured, getSupabase } from '@ecosystem/shared';

type CloudStatus = 'checking' | 'connected' | 'not-configured' | 'error';

/**
 * Phase 1 placeholder shell. Proves the pipeline works end to end:
 * builds in CI, deploys to Pages, installs as a PWA, reaches Supabase.
 * The real dashboard (F1, sport fixtures, FinTrack, chess, baby
 * countdown) lands in Phase 3.
 */
export default function App() {
  const [cloud, setCloud] = useState<CloudStatus>('checking');

  useEffect(() => {
    if (!supabaseConfigured()) {
      setCloud('not-configured');
      return;
    }
    getSupabase()
      .from('ping')
      .select('id')
      .limit(1)
      .then(({ error }) => setCloud(error ? 'error' : 'connected'));
  }, []);

  const tiles = [
    { name: 'FinTrack', status: 'Migration pending (Phase 2)' },
    { name: 'SA Sport Watch', status: 'Migration pending' },
    { name: 'F1 Briefing', status: 'Jolpica feed - Phase 3' },
    { name: 'Chess Coach', status: 'Planned' },
    { name: 'Baby Countdown', status: 'Phase 3' },
  ];

  return (
    <AppShell title="Ecosystem" subtitle="Pipeline check - Phase 1" headerRight={<CloudBadge status={cloud} />}>
      <div style={styles.grid}>
        {tiles.map((t) => (
          <div key={t.name} style={styles.tile}>
            <div style={styles.tileName}>{t.name}</div>
            <div style={styles.tileStatus}>{t.status}</div>
          </div>
        ))}
      </div>
      <p style={styles.note}>
        If you can read this on your phone from a GitHub Pages URL, Phase 1 is complete.
      </p>
    </AppShell>
  );
}

function CloudBadge({ status }: { status: CloudStatus }) {
  const map: Record<CloudStatus, { label: string; color: string }> = {
    checking: { label: 'Checking cloud...', color: 'var(--text-dim)' },
    connected: { label: 'Supabase connected', color: 'var(--ok)' },
    'not-configured': { label: 'Local only', color: 'var(--warn)' },
    error: { label: 'Cloud error', color: 'var(--accent)' },
  };
  const { label, color } = map[status];
  return (
    <span style={{ fontSize: '0.75rem', color, fontFamily: 'var(--font-data)' }}>{label}</span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 12,
  },
  tile: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: 16,
  },
  tileName: { fontWeight: 600, marginBottom: 4 },
  tileStatus: { fontSize: '0.78rem', color: 'var(--text-dim)' },
  note: { marginTop: 24, color: 'var(--text-dim)', fontSize: '0.85rem' },
};
