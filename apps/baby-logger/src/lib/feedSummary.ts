// "When did she last eat, and which side?" — the question asked at 3am.
//
// Pure: no React, no Supabase. The dashboard's newborn card answers the same
// question with its own copy of these rules (apps cannot import each other's
// src); keep the two in step.
import type { FeedEvent } from '../types';

type FeedType = FeedEvent['feed_type'];

/** Hours *and* minutes: feeds come every two to three hours, so "2h ago"
 *  cannot tell 2:05 from 2:55, and that difference is the whole decision. */
export function elapsedText(ms: number): string {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    const rest = mins % 60;
    return rest === 0 ? `${hrs}h ago` : `${hrs}h ${rest}m ago`;
  }
  return `${Math.floor(hrs / 24)}d ago`;
}

export function feedLabel(f: Pick<FeedEvent, 'feed_type' | 'amount_ml'>): string {
  switch (f.feed_type) {
    case 'breast_left': return 'Left side';
    case 'breast_right': return 'Right side';
    case 'bottle': return f.amount_ml ? `Bottle · ${f.amount_ml} ml` : 'Bottle';
    case 'solid': return 'Solids';
  }
}

/** The feed with the latest start, whatever order the list arrived in —
 *  offline-queued rows are merged in on top of the server's order. */
export function latestFeed<T extends Pick<FeedEvent, 'started_at'>>(feeds: T[]): T | null {
  let best: T | null = null;
  for (const f of feeds) {
    if (!best || Date.parse(f.started_at) > Date.parse(best.started_at)) best = f;
  }
  return best;
}

/** What the feed form should open on: the same kind of feed as last time,
 *  with the breast side switched, because the next feed starts on the other
 *  side. Nothing logged yet keeps the form's old default. */
export function suggestedFeedType(feeds: Pick<FeedEvent, 'started_at' | 'feed_type'>[]): FeedType {
  const last = latestFeed(feeds);
  if (!last) return 'bottle';
  if (last.feed_type === 'breast_left') return 'breast_right';
  if (last.feed_type === 'breast_right') return 'breast_left';
  return last.feed_type;
}

export interface LastFeedSummary {
  ago: string;
  label: string;
}

export function lastFeedSummary(feeds: FeedEvent[], now = Date.now()): LastFeedSummary | null {
  const last = latestFeed(feeds);
  if (!last) return null;
  return {
    ago: elapsedText(Math.max(0, now - Date.parse(last.started_at))),
    label: feedLabel(last),
  };
}
