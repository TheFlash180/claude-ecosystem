import React, { useEffect, useState } from 'react';
import { AppShell, supabaseConfigured, getSupabase } from '@ecosystem/shared';

type CloudStatus = 'checking' | 'connected' | 'not-configured' | 'error';

interface AppEntry {
  slug: string;
  name: string;
}

// Injected by tooling/build-all.mjs: every app deployed alongside the hub.
function installedApps(): AppEntry[] {
  try {
    return JSON.parse((import.meta.env.VITE_APPS as string | undefined) ?? '[]');
  } catch {
    return [];
  }
}

// Apps that live outside this repo but belong to the family.
const EXTERNAL: { name: string; url: string; note: string }[] = [
  { name: 'FinTrack Pro', url: 'https://theflash180.github.io/fintrack-pro/', note: 'household finance' },
  { name: 'Baby Registry', url: 'https://theflash180.github.io/baby-registry-pwa/', note: 'gifts & claims' },
];

// In planning — see the session notes for each brief.
const PLANNED: { name: string; note: string }[] = [
  { name: 'Workout Plan', note: 'parkrun + gym schedule' },
];

export default function App() {
  const [cloud, setCloud] = useState<CloudStatus>('checking');
  const apps = installedApps();

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

  return (
    <AppShell title="Ecosystem" subtitle="All apps, one home" headerRight={<CloudBadge status={cloud} />}>
      <div style={styles.grid}>
        {apps.map((a) => (
          <a key={a.slug} href={`./${a.slug}/`} style={{ ...styles.tile, ...styles.liveTile }}>
            <div style={styles.tileName}>{a.name}</div>
            <div style={{ ...styles.tileStatus, color: 'var(--ok)' }}>● open</div>
          </a>
        ))}
        {EXTERNAL.map((a) => (
          <a key={a.name} href={a.url} style={{ ...styles.tile, ...styles.liveTile }}>
            <div style={styles.tileName}>{a.name}</div>
            <div style={{ ...styles.tileStatus, color: 'var(--ok)' }}>● {a.note}</div>
          </a>
        ))}
        {PLANNED.map((a) => (
          <div key={a.name} style={{ ...styles.tile, opacity: 0.45 }}>
            <div style={styles.tileName}>{a.name}</div>
            <div style={styles.tileStatus}>coming soon · {a.note}</div>
          </div>
        ))}
      </div>
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
    display: 'block',
  },
  liveTile: {
    textDecoration: 'none',
    color: 'inherit',
    cursor: 'pointer',
  },
  tileName: { fontWeight: 600, marginBottom: 4 },
  tileStatus: { fontSize: '0.78rem', color: 'var(--text-dim)' },
};
