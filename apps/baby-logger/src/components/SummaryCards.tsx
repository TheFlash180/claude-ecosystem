import React from 'react';
import type { FeedEvent, SleepEvent, NappyEvent } from '../types';

interface Props {
  feeds: FeedEvent[];
  sleeps: SleepEvent[];
  nappies: NappyEvent[];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function SummaryCards({ feeds, sleeps, nappies }: Props) {
  const lastFeed = feeds[0];
  const lastSleep = sleeps[0];
  const activeSleep = sleeps.find((s) => !s.ended_at);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const nappiesToday = nappies.filter((n) => new Date(n.logged_at) >= todayStart).length;
  const feedsToday = feeds.filter((f) => new Date(f.started_at) >= todayStart).length;

  const cards = [
    {
      label: 'Last feed',
      value: lastFeed ? timeAgo(lastFeed.started_at) : '-',
      sub: feedsToday > 0 ? `${feedsToday} today` : undefined,
      color: 'var(--accent-secondary)',
    },
    {
      label: 'Sleep',
      value: activeSleep ? 'Sleeping now' : lastSleep ? timeAgo(lastSleep.started_at) : '-',
      color: 'var(--sleep)',
    },
    {
      label: 'Nappies today',
      value: String(nappiesToday),
      color: 'var(--nappy)',
    },
  ];

  return (
    <div style={styles.grid}>
      {cards.map((c) => (
        <div key={c.label} style={{ ...styles.card, borderTop: `2px solid ${c.color}` }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: 4 }}>{c.label}</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, fontFamily: 'var(--font-display)' }}>{c.value}</div>
          {c.sub && <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 8,
    marginBottom: 12,
  },
  card: {
    background: 'var(--surface)',
    borderRadius: 'var(--radius)',
    padding: '10px',
  },
};
