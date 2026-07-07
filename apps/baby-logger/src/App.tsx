import React, { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import type { Baby, HouseholdMember } from './types';
import AuthScreen from './components/AuthScreen';
import Onboarding from './components/Onboarding';
import PreBirthView from './components/PreBirthView';
import PostBirthView from './components/PostBirthView';
import type { Session } from '@supabase/supabase-js';

type AppState = 'loading' | 'auth' | 'onboarding' | 'pre-birth' | 'post-birth';

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
  const [member, setMember] = useState<HouseholdMember | null>(null);
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
      if (data.session) loadHousehold(data.session.user.id);
      else setState('auth');
    });

    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) loadHousehold(s.user.id);
      else {
        setMember(null);
        setBaby(null);
        setState('auth');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadHousehold(userId: string) {
    const sb = supabase();
    const { data: memberData } = await sb
      .from('household_members')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!memberData) {
      setState('onboarding');
      return;
    }

    setMember(memberData);

    const { data: babyData } = await sb
      .from('babies')
      .select('*')
      .eq('household_id', memberData.household_id)
      .limit(1)
      .single();

    if (babyData) {
      setBaby(babyData);
      setState(babyData.birth_date ? 'post-birth' : 'pre-birth');
    } else {
      setState('onboarding');
    }
  }

  function handleOnboardingComplete(m: HouseholdMember, b: Baby) {
    setMember(m);
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
          Offline — events will sync when reconnected
        </div>
      )}
      {state === 'auth' && <AuthScreen />}
      {state === 'onboarding' && session && (
        <Onboarding userId={session.user.id} onComplete={handleOnboardingComplete} />
      )}
      {state === 'pre-birth' && baby && member && session && (
        <PreBirthView
          baby={baby}
          member={member}
          onBabyUpdate={handleBabyUpdate}
          onSignOut={handleSignOut}
        />
      )}
      {state === 'post-birth' && baby && member && session && (
        <PostBirthView
          baby={baby}
          member={member}
          userId={session.user.id}
          onBabyUpdate={handleBabyUpdate}
          onSignOut={handleSignOut}
        />
      )}
    </div>
  );
}
