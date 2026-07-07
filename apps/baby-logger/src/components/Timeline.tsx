import React from 'react';
import type { TimelineEvent, UserProfile } from '../types';

interface Props {
  events: TimelineEvent[];
  profiles: UserProfile[];
  hasMore: boolean;
  onLoadMore: () => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function getInitial(userId: string, profiles: UserProfile[]): string {
  const p = profiles.find((x) => x.id === userId);
  return p ? p.display_name.charAt(0).toUpperCase() : '?';
}

function renderEvent(event: TimelineEvent) {
  switch (event.type) {
    case 'feed': {
      const d = event.data;
      const typeLabel: Record<string, string> = {
        breast_left: 'Left breast',
        breast_right: 'Right breast',
        bottle: 'Bottle',
        solid: 'Solid food',
      };
      let detail = typeLabel[d.feed_type] ?? d.feed_type;
      if (d.duration_minutes) detail += ` · ${d.duration_minutes}min`;
      if (d.amount_ml) detail += ` · ${d.amount_ml}ml`;
      return {
        emoji: '\u{1F37C}',
        label: 'Feed',
        detail,
        color: 'var(--accent-secondary)',
        userId: d.logged_by,
        time: formatTime(d.started_at),
      };
    }
    case 'sleep': {
      const d = event.data;
      let detail = 'Started';
      if (d.ended_at) {
        const dur = Math.floor((new Date(d.ended_at).getTime() - new Date(d.started_at).getTime()) / 60000);
        const h = Math.floor(dur / 60);
        const m = dur % 60;
        detail = h > 0 ? `${h}h ${m}m` : `${m}m`;
      } else {
        detail = 'Sleeping now...';
      }
      return {
        emoji: '\u{1F634}',
        label: 'Sleep',
        detail,
        color: 'var(--sleep)',
        userId: d.logged_by,
        time: formatTime(d.started_at),
      };
    }
    case 'nappy': {
      const d = event.data;
      const typeLabel: Record<string, string> = { wet: 'Wet', dirty: 'Dirty', both: 'Wet & Dirty' };
      return {
        emoji: '\u{1F9F7}',
        label: 'Nappy',
        detail: typeLabel[d.nappy_type] ?? d.nappy_type,
        color: 'var(--nappy)',
        userId: d.logged_by,
        time: formatTime(d.logged_at),
      };
    }
    case 'weight': {
      const d = event.data;
      const kg = (d.weight_g / 1000).toFixed(2);
      return {
        emoji: '⚖️',
        label: 'Weight',
        detail: `${kg} kg`,
        color: 'var(--weight)',
        userId: d.logged_by,
        time: formatTime(d.created_at),
      };
    }
  }
}

export default function Timeline({ events, profiles, hasMore, onLoadMore }: Props) {
  if (events.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>
        No events yet. Use the buttons below to start logging!
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {events.map((event, i) => {
        const r = renderEvent(event);
        return (
          <div key={`${event.type}-${event.data.id}-${i}`} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--surface)',
            borderRadius: 'var(--radius)',
            padding: '10px 12px',
            borderLeft: `3px solid ${r.color}`,
          }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>{r.emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{r.label}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{r.detail}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{r.time}</span>
              <span style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: r.color,
                color: '#121018',
                fontSize: '0.65rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {getInitial(r.userId, profiles)}
              </span>
            </div>
          </div>
        );
      })}
      {hasMore && (
        <button onClick={onLoadMore} style={{
          background: 'none',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          color: 'var(--muted)',
          padding: '10px',
          cursor: 'pointer',
          fontFamily: 'var(--font-body)',
          fontSize: '0.85rem',
          marginTop: 4,
        }}>
          Load more
        </button>
      )}
    </div>
  );
}
