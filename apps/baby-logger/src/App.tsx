import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
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
    --radius: 12px;
    --font-display: 'Quicksand', sans-serif;
    --font-body: 'Inter', system-ui, -apple-system, sans-serif;
    color-scheme: dark;
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

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = globalStyles;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
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
          Offline — saving is paused until you're back online
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
