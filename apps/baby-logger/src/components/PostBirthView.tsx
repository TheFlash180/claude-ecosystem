import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Baby, HouseholdMember, FeedEvent, SleepEvent, NappyEvent, WeightEvent, TimelineEvent } from '../types';
import QuickLog from './QuickLog';
import Timeline from './Timeline';
import SummaryCards from './SummaryCards';
import FeedForm from './FeedForm';
import SleepToggle from './SleepToggle';
import NappyForm from './NappyForm';
import WeightForm from './WeightForm';
import GrowthChart from './GrowthChart';
import HouseholdSettings from './HouseholdSettings';

interface Props {
  baby: Baby;
  member: HouseholdMember;
  userId: string;
  onBabyUpdate: (baby: Baby) => void;
  onSignOut: () => void;
}

type Modal = 'feed' | 'sleep' | 'nappy' | 'weight' | 'growth' | 'settings' | null;

const PAGE_SIZE = 50;

export default function PostBirthView({ baby, member, userId, onBabyUpdate, onSignOut }: Props) {
  const [feeds, setFeeds] = useState<FeedEvent[]>([]);
  const [sleeps, setSleeps] = useState<SleepEvent[]>([]);
  const [nappies, setNappies] = useState<NappyEvent[]>([]);
  const [weights, setWeights] = useState<WeightEvent[]>([]);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [modal, setModal] = useState<Modal>(null);
  const [timelinePage, setTimelinePage] = useState(1);

  const activeSleep = sleeps.find((s) => !s.ended_at) ?? null;

  const loadData = useCallback(async () => {
    const sb = supabase();
    const [f, s, n, w, m] = await Promise.all([
      sb.from('feed_events').select('*').eq('baby_id', baby.id).order('started_at', { ascending: false }).limit(PAGE_SIZE * timelinePage),
      sb.from('sleep_events').select('*').eq('baby_id', baby.id).order('started_at', { ascending: false }).limit(PAGE_SIZE * timelinePage),
      sb.from('nappy_events').select('*').eq('baby_id', baby.id).order('logged_at', { ascending: false }).limit(PAGE_SIZE * timelinePage),
      sb.from('weight_events').select('*').eq('baby_id', baby.id).order('measured_at', { ascending: false }).limit(PAGE_SIZE * timelinePage),
      sb.from('household_members').select('*').eq('household_id', member.household_id),
    ]);
    if (f.data) setFeeds(f.data);
    if (s.data) setSleeps(s.data);
    if (n.data) setNappies(n.data);
    if (w.data) setWeights(w.data);
    if (m.data) setMembers(m.data);
  }, [baby.id, member.household_id, timelinePage]);

  useEffect(() => { loadData(); }, [loadData]);

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
      <HouseholdSettings
        member={member}
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
          members={members}
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
