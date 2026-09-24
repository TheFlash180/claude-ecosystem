import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { flushQueue, queueLength, QUEUE_EVENT } from './lib/eventQueue';
import { nightActive, NIGHT_PREF_EVENT, readNightPref } from './lib/night';
import type { Baby, UserProfile } from './types';
import AuthScreen from './components/AuthScreen';
import PreBirthView from './components/PreBirthView';
import PostBirthView from './components/PostBirthView';
import type { Session } from '@supabase/supabase-js';

type AppState = 'loading' | 'auth' | 'pre-birth' | 'post-birth';

// The shared profiles table (FinTrack's) requires owner_key — map it from
// the email so the fallback insert below can never violate its NOT NULL.
const OWNER_KEYS: Record<string, string> = {
  'rickust18@gmail.com': 'rickus',
  'anjonemaritz01@gmail.com': 'anjone',
};

const KNOWN_USERS: Record<string, string> = {
  'rickust18@gmail.com': 'Rickus',
  'anjonemaritz01@gmail.com': 'Anjoné',
};

const globalStyles = `
  :root {
    --bg: #121018;
    --surface: #1C1825;
    --border: #2A2535;
    --text: #F0ECF4;
    --muted: #6B6278;
    --accent: #C4A1FF;
    --accent-secondary: #FFB5C8;
    --ok: #7DD4A0;
    --sleep: #7BA8E0;
    --nappy: #E0C97B;
    --weight: #A0D4B4;
    --overlay: rgba(18, 16, 24, 0.8);
    --radius: 12px;
    --font-display: 'Quicksand', sans-serif;
    --font-body: 'Inter', system-ui, -apple-system, sans-serif;
    color-scheme: dark;
  }

  /* Night mode (lib/night.ts): dim and warm, nothing blue. Only the
     variables change, so every component follows without being touched;
     each category keeps its own hue so feed, sleep and nappy still read
     apart at a glance. */
  :root[data-night] {
    --bg: #0A0605;
    --surface: #140D0A;
    --border: #2A1C15;
    --text: #D9A882;
    --muted: #86664F;
    --accent: #C98A5E;
    --accent-secondary: #C9725F;
    --ok: #A89A5A;
    --sleep: #B0885A;
    --nappy: #A8914F;
    --weight: #9C8A5E;
    --overlay: rgba(10, 6, 5, 0.85);
  }

  *, *::before, *::after { box-sizing: border-box; }

  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-body);
    -webkit-font-smoothing: antialiased;
    min-height: 100dvh;
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
`;

export default function App() {
  const [state, setState] = useState<AppState>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [baby, setBaby] = useState<Baby | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [pendingSync, setPendingSync] = useState(queueLength());
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    const onQueueChange = () => setPendingSync(queueLength());
    window.addEventListener(QUEUE_EVENT, onQueueChange);
    return () => window.removeEventListener(QUEUE_EVENT, onQueueChange);
  }, []);

  // Flush queued offline events on start-up and whenever we come back
  // online; remount the views afterwards so they show the synced rows.
  useEffect(() => {
    if (!online) return;
    void flushQueue().then((n) => {
      if (n > 0) setRefreshNonce((x) => x + 1);
    });
  }, [online]);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = globalStyles;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // Night mode: re-checked every minute so "auto" turns on at 19:00 with the
  // app open, and immediately when the setting changes.
  useEffect(() => {
    const root = document.documentElement;
    const meta = document.querySelector('meta[name="theme-color"]');
    const apply = () => {
      const on = nightActive(readNightPref());
      if (on) root.dataset.night = '1';
      else delete root.dataset.night;
      // The status bar is drawn by the phone, outside the page's CSS.
      meta?.setAttribute('content', on ? '#0A0605' : '#121018');
    };
    apply();
    const t = setInterval(apply, 60000);
    window.addEventListener(NIGHT_PREF_EVENT, apply);
    return () => {
      clearInterval(t);
      window.removeEventListener(NIGHT_PREF_EVENT, apply);
    };
  }, []);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) void setup(data.session);
      else setState('auth');
    });

    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) void setup(s);
      else {
        setProfile(null);
        setBaby(null);
        setState('auth');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function setup(s: Session) {
    const sb = supabase();
    const userId = s.user.id;
    const email = s.user.email ?? '';

    const { data: existingProfile } = await sb
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    let prof: UserProfile;
    if (existingProfile) {
      prof = existingProfile;
    } else {
      const displayName = KNOWN_USERS[email] ?? email.split('@')[0];
      const { data: newProfile, error } = await sb
        .from('profiles')
        .insert({
          id: userId,
          display_name: displayName,
          owner_key: OWNER_KEYS[email.toLowerCase()] ?? 'rickus',
        })
        .select()
        .single();
      if (error || !newProfile) {
        setState('auth');
        return;
      }
      prof = newProfile;
    }
    setProfile(prof);

    const { data: babyData } = await sb
      .from('babies')
      .select('*')
      .limit(1)
      .single();

    let b: Baby;
    if (babyData) {
      b = babyData;
    } else {
      const { data: newBaby, error } = await sb
        .from('babies')
        .insert({ due_date: '2026-12-17' })
        .select()
        .single();
      if (error || !newBaby) {
        setState('auth');
        return;
      }
      b = newBaby;
    }
    setBaby(b);
    setState(b.birth_date ? 'post-birth' : 'pre-birth');
  }

  // The other phone setting the birth date (or renaming the baby) switches
  // this one over too, rather than leaving it on the pregnancy countdown
  // until someone thinks to reload on the one day that matters most.
  const babyId = baby?.id;
  useEffect(() => {
    if (!babyId) return;
    const sb = supabase();
    const channel = sb
      .channel(`baby-row-${babyId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'babies', filter: `id=eq.${babyId}` },
        (payload) => handleBabyUpdate(payload.new as Baby),
      )
      .subscribe();
    return () => { void sb.removeChannel(channel); };
  }, [babyId]);

  function handleBabyUpdate(b: Baby) {
    setBaby(b);
    setState(b.birth_date ? 'post-birth' : 'pre-birth');
  }

  async function handleSignOut() {
    await supabase().auth.signOut();
  }

  if (state === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
        <div style={{ color: 'var(--accent)', fontFamily: 'var(--font-display)', fontSize: '1.2rem' }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100dvh', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {!online && (
        <div style={{
          background: 'var(--nappy)',
          color: '#121018',
          textAlign: 'center',
          padding: '4px 8px',
          fontSize: '0.75rem',
          fontWeight: 600,
        }}>
          {pendingSync > 0
            ? `Offline — ${pendingSync} event${pendingSync === 1 ? '' : 's'} saved on this phone, syncing when you're back`
            : 'Offline — new events are saved on this phone and sync later'}
        </div>
      )}
      {online && pendingSync > 0 && (
        <div style={{
          background: 'var(--sleep)',
          color: '#121018',
          textAlign: 'center',
          padding: '4px 8px',
          fontSize: '0.75rem',
          fontWeight: 600,
        }}>
          Syncing {pendingSync} saved event{pendingSync === 1 ? '' : 's'}…
        </div>
      )}
      {state === 'auth' && <AuthScreen />}
      {state === 'pre-birth' && baby && profile && session && (
        <PreBirthView
          baby={baby}
          displayName={profile.display_name}
          onBabyUpdate={handleBabyUpdate}
          onSignOut={handleSignOut}
        />
      )}
      {state === 'post-birth' && baby && profile && session && (
        <PostBirthView
          key={refreshNonce}
          baby={baby}
          displayName={profile.display_name}
          userId={session.user.id}
          onBabyUpdate={handleBabyUpdate}
          onSignOut={handleSignOut}
        />
      )}
    </div>
  );
}
