import React, { useEffect, useState } from 'react';
import type { FeedEvent, SleepEvent, NappyEvent } from '../types';
import { elapsedText, lastFeedSummary } from '../lib/feedSummary';

interface Props {
  feeds: FeedEvent[];
  sleeps: SleepEvent[];
  nappies: NappyEvent[];
}

function timeAgo(iso: string, now: number): string {
  return elapsedText(Math.max(0, now - new Date(iso).getTime()));
}

export default function SummaryCards({ feeds, sleeps, nappies }: Props) {
  // Re-render every half minute. Nothing else changes while the phone sits
  // open on the bedside table, and "1h 5m ago" frozen for an hour is wrong in
  // exactly the way that matters.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const lastFeed = lastFeedSummary(feeds, now);
  const lastSleep = sleeps[0];
  const activeSleep = sleeps.find((s) => !s.ended_at);

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const nappiesToday = nappies.filter((n) => new Date(n.logged_at) >= todayStart).length;
  const feedsToday = feeds.filter((f) => new Date(f.started_at) >= todayStart).length;

  const cards = [
    {
      label: 'Last feed',
      value: lastFeed ? lastFeed.ago : '-',
      // Two lines on purpose: the card is a third of a phone wide, and
      // "Left side · 3 today" otherwise breaks wherever it happens to.
      sub: lastFeed
        ? `${lastFeed.label}${feedsToday > 0 ? `\n${feedsToday} today` : ''}`
        : undefined,
      color: 'var(--accent-secondary)',
    },
    {
      label: 'Sleep',
      value: activeSleep ? 'Sleeping now' : lastSleep ? timeAgo(lastSleep.started_at, now) : '-',
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
          {c.sub && <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2, whiteSpace: 'pre-line' }}>{c.sub}</div>}
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
