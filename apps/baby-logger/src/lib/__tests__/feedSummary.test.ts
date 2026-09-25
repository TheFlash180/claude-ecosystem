import { describe, expect, it } from 'vitest';
import {
  elapsedText, feedLabel, lastFeedSummary, latestFeed, suggestedFeedType,
} from '../feedSummary';
import type { FeedEvent } from '../../types';

const feed = (feed_type: FeedEvent['feed_type'], started_at: string, amount_ml: number | null = null): FeedEvent => ({
  id: started_at, baby_id: 'b', logged_by: 'u', feed_type, started_at,
  duration_minutes: null, amount_ml, notes: null, created_at: started_at,
});

const MIN = 60000;

describe('elapsedText', () => {
  it('keeps the minutes once past an hour', () => {
    expect(elapsedText(2 * 60 * MIN + 10 * MIN)).toBe('2h 10m ago');
    expect(elapsedText(2 * 60 * MIN + 55 * MIN)).toBe('2h 55m ago');
  });

  it('drops a zero minute count', () => {
    expect(elapsedText(3 * 60 * MIN)).toBe('3h ago');
  });

  it('reads short gaps plainly', () => {
    expect(elapsedText(30 * 1000)).toBe('Just now');
    expect(elapsedText(45 * MIN)).toBe('45m ago');
  });

  it('falls back to days', () => {
    expect(elapsedText(50 * 60 * MIN)).toBe('2d ago');
  });
});

describe('feedLabel', () => {
  it('names the side and the bottle amount', () => {
    expect(feedLabel({ feed_type: 'breast_left', amount_ml: null })).toBe('Left side');
    expect(feedLabel({ feed_type: 'bottle', amount_ml: 120 })).toBe('Bottle · 120 ml');
    expect(feedLabel({ feed_type: 'bottle', amount_ml: null })).toBe('Bottle');
  });
});

describe('latestFeed', () => {
  it('goes by start time, not list order', () => {
    // An offline-queued feed merged onto the end of a newest-first list.
    const feeds = [feed('bottle', '2026-12-20T01:00:00Z'), feed('breast_left', '2026-12-20T03:00:00Z')];
    expect(latestFeed(feeds)?.feed_type).toBe('breast_left');
  });

  it('is null with nothing logged', () => {
    expect(latestFeed([])).toBeNull();
  });
});

describe('suggestedFeedType', () => {
  it('switches breast side', () => {
    expect(suggestedFeedType([feed('breast_left', '2026-12-20T01:00:00Z')])).toBe('breast_right');
    expect(suggestedFeedType([feed('breast_right', '2026-12-20T01:00:00Z')])).toBe('breast_left');
  });

  it('repeats a bottle or solids', () => {
    expect(suggestedFeedType([feed('bottle', '2026-12-20T01:00:00Z')])).toBe('bottle');
    expect(suggestedFeedType([feed('solid', '2026-12-20T01:00:00Z')])).toBe('solid');
  });

  it('keeps the old default when nothing is logged', () => {
    expect(suggestedFeedType([])).toBe('bottle');
  });
});

describe('lastFeedSummary', () => {
  it('answers when and which side', () => {
    const now = Date.parse('2026-12-20T05:10:00Z');
    expect(lastFeedSummary([feed('breast_right', '2026-12-20T03:00:00Z')], now))
      .toEqual({ ago: '2h 10m ago', label: 'Right side' });
  });

  it('never reads a clock-skewed future feed as negative', () => {
    const now = Date.parse('2026-12-20T03:00:00Z');
    expect(lastFeedSummary([feed('bottle', '2026-12-20T03:00:30Z')], now)?.ago).toBe('Just now');
  });

  it('is null with nothing logged', () => {
    expect(lastFeedSummary([])).toBeNull();
  });
});
