import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { mergePending, QUEUE_EVENT } from '../lib/eventQueue';
import type { Baby, UserProfile, FeedEvent, SleepEvent, NappyEvent, WeightEvent, TimelineEvent } from '../types';
import QuickLog from './QuickLog';
import Timeline from './Timeline';
import SummaryCards from './SummaryCards';
import FeedForm from './FeedForm';
import SleepToggle from './SleepToggle';
import NappyForm from './NappyForm';
import WeightForm from './WeightForm';
import GrowthChart from './GrowthChart';
import Settings from './Settings';

interface Props {
  baby: Baby;
  displayName: string;
  userId: string;
  onBabyUpdate: (baby: Baby) => void;
  onSignOut: () => void;
}

type Modal = 'feed' | 'sleep' | 'nappy' | 'weight' | 'growth' | 'settings' | null;

const PAGE_SIZE = 50;

export default function PostBirthView({ baby, displayName, userId, onBabyUpdate, onSignOut }: Props) {
  const [feeds, setFeeds] = useState<FeedEvent[]>([]);
  const [sleeps, setSleeps] = useState<SleepEvent[]>([]);
  const [nappies, setNappies] = useState<NappyEvent[]>([]);
  const [weights, setWeights] = useState<WeightEvent[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [modal, setModal] = useState<Modal>(null);
  const [timelinePage, setTimelinePage] = useState(1);

  const activeSleep = sleeps.find((s) => !s.ended_at) ?? null;

  // Anything still sitting in the offline queue is merged in on top of what
  // the server returned, so a feed or sleep logged in a dead spot is on screen
  // the moment it is tapped rather than only after the next sync.
  const loadData = useCallback(async () => {
    const sb = supabase();
    const [f, s, n, w, p] = await Promise.all([
      sb.from('feed_events').select('*').eq('baby_id', baby.id).order('started_at', { ascending: false }).limit(PAGE_SIZE * timelinePage),
      sb.from('sleep_events').select('*').eq('baby_id', baby.id).order('started_at', { ascending: false }).limit(PAGE_SIZE * timelinePage),
      sb.from('nappy_events').select('*').eq('baby_id', baby.id).order('logged_at', { ascending: false }).limit(PAGE_SIZE * timelinePage),
      sb.from('weight_events').select('*').eq('baby_id', baby.id).order('measured_at', { ascending: false }).limit(PAGE_SIZE * timelinePage),
      sb.from('profiles').select('*'),
    ]);
    // Falling back to `prev` rather than `[]` when the query fails: offline it
    // returns null, and emptying the list would blank out the whole history
    // just when there is no way to fetch it again. Re-merging over the previous
    // merged list is safe — rows are keyed by id, so nothing doubles up.
    setFeeds(prev => mergePending<FeedEvent>(f.data ?? prev, 'feed_events'));
    setSleeps(prev => mergePending<SleepEvent>(s.data ?? prev, 'sleep_events'));
    setNappies(prev => mergePending<NappyEvent>(n.data ?? prev, 'nappy_events'));
    setWeights(prev => mergePending<WeightEvent>(w.data ?? prev, 'weight_events'));
    if (p.data) setProfiles(p.data);
  }, [baby.id, timelinePage]);

  useEffect(() => { loadData(); }, [loadData]);

  // The queue changing means a row was just added offline, or a flush landed.
  // Either way what is on screen is now stale. Coalesced, because a flush
  // fires one event per row and each reload is five queries — twenty queued
  // feeds would otherwise mean a hundred requests on reconnect.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onQueueChange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { void loadData(); }, 250);
    };
    window.addEventListener(QUEUE_EVENT, onQueueChange);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(QUEUE_EVENT, onQueueChange);
    };
  }, [loadData]);

  function buildTimeline(): TimelineEvent[] {
    const all: TimelineEvent[] = [
      ...feeds.map((d): TimelineEvent => ({ type: 'feed', data: d })),
      ...sleeps.map((d): TimelineEvent => ({ type: 'sleep', data: d })),
      ...nappies.map((d): TimelineEvent => ({ type: 'nappy', data: d })),
      ...weights.map((d): TimelineEvent => ({ type: 'weight', data: d })),
    ];
    all.sort((a, b) => {
      const ta = getEventTimestamp(a);
      const tb = getEventTimestamp(b);
      return tb.localeCompare(ta);
    });
    return all;
  }

  function getEventTimestamp(e: TimelineEvent): string {
    switch (e.type) {
      case 'feed': return e.data.started_at;
      case 'sleep': return e.data.started_at;
      case 'nappy': return e.data.logged_at;
      case 'weight': return e.data.created_at;
    }
  }

  function handleQuickTap(type: 'feed' | 'sleep' | 'nappy' | 'weight') {
    setModal(type);
  }

  function handleFormDone() {
    setModal(null);
    loadData();
  }

  if (modal === 'settings') {
    return (
      <Settings
        baby={baby}
        onBabyUpdate={onBabyUpdate}
        onBack={() => setModal(null)}
        onSignOut={onSignOut}
      />
    );
  }

  const timeline = buildTimeline();
  const totalEvents = feeds.length + sleeps.length + nappies.length + weights.length;
  const hasMore = totalEvents >= PAGE_SIZE * timelinePage;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <span style={styles.headerTitle}>
          {baby.name ?? 'Baby Logger'}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setModal('growth')} style={styles.headerBtn}>Growth</button>
          <button onClick={() => setModal('settings')} style={styles.headerBtn}>Settings</button>
        </div>
      </header>

      <div style={styles.content}>
        <SummaryCards feeds={feeds} sleeps={sleeps} nappies={nappies} />
        <Timeline
          events={timeline}
          profiles={profiles}
          hasMore={hasMore}
          onLoadMore={() => setTimelinePage((p) => p + 1)}
        />
      </div>

      <QuickLog activeSleep={!!activeSleep} onTap={handleQuickTap} />

      {modal === 'feed' && (
        <FeedForm babyId={baby.id} userId={userId} onDone={handleFormDone} />
      )}
      {modal === 'sleep' && (
        <SleepToggle
          babyId={baby.id}
          userId={userId}
          activeSleep={activeSleep}
          onToggle={handleFormDone}
        />
      )}
      {modal === 'nappy' && (
        <NappyForm babyId={baby.id} userId={userId} onDone={handleFormDone} />
      )}
      {modal === 'weight' && (
        <WeightForm babyId={baby.id} userId={userId} onDone={handleFormDone} />
      )}
      {modal === 'growth' && (
        <GrowthChart weights={weights} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 480,
    margin: '0 auto',
    padding: '0 16px',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100dvh',
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
    color: 'var(--accent)',
  },
  headerBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--muted)',
    padding: '6px 12px',
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
  content: {
    flex: 1,
    padding: '12px 0',
    overflowY: 'auto',
  },
};
