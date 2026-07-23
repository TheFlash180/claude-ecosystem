import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  Activity, BarChart3, CalendarDays, CheckCircle2, Dumbbell, Home, PlayCircle,
  Settings, Trophy,
} from 'lucide-react';
import {
  DAY_NAMES, DAY_SHORT, KIND_META, W,
  type Exercise, type LoggedSet, type Profile, type Routine, type RoutineKind,
} from './lib/config';
import {
  completeSession, deleteRun, fetchAllSets, fetchBodyweights, fetchCompletedRoutines,
  fetchExercises, fetchLastSets, fetchProfile, fetchRoutines, fetchRuns, fetchSessionDates,
  fetchSets, logBodyweight, logRun, logSet, saveProfile,
} from './lib/data';
import { bestSet, dayIndex, est1RM, nutritionTargets, sastDay } from './lib/fitness';
import { daySeed, motivate, type MotiveContext } from './lib/motivation';
import { ExerciseCard } from './components/ExerciseCard';
import { ExerciseDetail } from './components/ExerciseDetail';
import { RestTimer } from './components/RestTimer';
import { EatCard } from './components/EatCard';
import { Progress } from './components/Progress';
import { BodyweightSheet, ProfileSheet, RunSheet } from './components/Sheets';

type Tab = 'today' | 'week' | 'progress';
const MEAL_PREP_URL = '../meal-prep/';

export default function App() {
  const today = sastDay();
  const [tab, setTab] = useState<Tab>('today');
  const [viewedDate, setViewedDate] = useState(today);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [exercises, setExercises] = useState<Map<string, Exercise>>(new Map());
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [sets, setSets] = useState<Map<string, LoggedSet[]>>(new Map());
  const [lastSets, setLastSets] = useState<Map<string, LoggedSet[]>>(new Map());
  const [allSets, setAllSets] = useState<Map<string, LoggedSet[]>>(new Map());
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [weights, setWeights] = useState<{ date: string; weightKg: number }[]>([]);
  const [runs, setRuns] = useState<{ date: string; seconds: number; location: string; note: string }[]>([]);
  const [sessionDates, setSessionDates] = useState<string[]>([]);
  const [wedVariant, setWedVariant] = useState<'main' | 'fallback'>('main');

  const [detail, setDetail] = useState<Exercise | null>(null);
  const [sheet, setSheet] = useState<'profile' | 'weight' | 'run' | null>(null);
  const [restStart, setRestStart] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  const loadStatic = useCallback(async () => {
    const [p, ex, rt, bw, rn, sd, all] = await Promise.all([
      fetchProfile(), fetchExercises(), fetchRoutines(), fetchBodyweights(),
      fetchRuns(), fetchSessionDates(), fetchAllSets(),
    ]);
    setProfile(p); setExercises(ex); setRoutines(rt); setWeights(bw);
    setRuns(rn); setSessionDates(sd); setAllSets(all); setLoading(false);
  }, []);

  const loadDay = useCallback(async (date: string, dayRoutines: Routine[]) => {
    const exIds = [...new Set(dayRoutines.flatMap(r => r.exercises.map(e => e.exerciseId)))];
    const [flat, last, done] = await Promise.all([
      fetchSets(date), fetchLastSets(exIds, date), fetchCompletedRoutines(date),
    ]);
    const map = new Map<string, LoggedSet[]>();
    for (const s of flat) { const l = map.get(s.exerciseId) ?? []; l.push(s); map.set(s.exerciseId, l); }
    setSets(map); setLastSets(last); setCompleted(done);
  }, []);

  useEffect(() => { void loadStatic(); }, [loadStatic]);

  const dayRoutines = useMemo(
    () => routines.filter(r => r.day === dayIndex(viewedDate)),
    [routines, viewedDate],
  );

  useEffect(() => {
    if (routines.length) void loadDay(viewedDate, dayRoutines);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedDate, routines]);

  const currentWeight = weights.length ? weights[weights.length - 1].weightKg : null;
  const targets = useMemo(
    () => (profile && currentWeight ? nutritionTargets(profile, currentWeight, today) : null),
    [profile, currentWeight, today],
  );

  // Which routine to show for the viewed day (Wed has a gym main + home fallback).
  const activeRoutine: Routine | null = useMemo(() => {
    if (dayRoutines.length === 0) return null;
    const fallback = dayRoutines.find(r => r.variant === 'fallback');
    const main = dayRoutines.find(r => r.variant === 'main') ?? dayRoutines[0];
    if (fallback && wedVariant === 'fallback') return fallback;
    return main;
  }, [dayRoutines, wedVariant]);

  const onLog = async (ex: Exercise, setNo: number, weight: number | null, reps: number | null) => {
    const prevBest = bestSet(allSets.get(ex.id) ?? []);
    const ok = await logSet(viewedDate, ex.id, setNo, weight, reps);
    if (!ok) { showToast('Could not save that set.'); return; }
    // update local sets + allSets
    setSets(prev => {
      const m = new Map(prev);
      const list = (m.get(ex.id) ?? []).filter(s => s.setNo !== setNo);
      if (reps != null) list.push({ exerciseId: ex.id, setNo, weightKg: weight, reps });
      m.set(ex.id, list.sort((a, b) => a.setNo - b.setNo));
      return m;
    });
    if (reps != null) {
      setAllSets(prev => {
        const m = new Map(prev);
        m.set(ex.id, [...(m.get(ex.id) ?? []), { exerciseId: ex.id, setNo, weightKg: weight, reps }]);
        return m;
      });
      if (weight && prevBest > 0 && est1RM(weight, reps) > prevBest + 0.01) {
        showToast(motivate('pb', daySeed(viewedDate)));
      }
    }
  };

  const onComplete = async () => {
    if (!activeRoutine) return;
    const isDone = completed.has(activeRoutine.id);
    const ok = await completeSession(viewedDate, activeRoutine.id, !isDone);
    if (!ok) return;
    setCompleted(prev => { const s = new Set(prev); isDone ? s.delete(activeRoutine.id) : s.add(activeRoutine.id); return s; });
    if (!isDone) {
      setSessionDates(prev => [...prev, viewedDate]);
      showToast(motivate('sessionDone', daySeed(viewedDate)));
    }
  };

  const onSaveProfile = async (p: Profile) => {
    const ok = await saveProfile(p);
    if (ok) { setProfile(p); setSheet(null); showToast('Profile saved.'); }
    else showToast('Could not save profile.');
  };
  const onSaveWeight = async (kg: number) => {
    const prev = currentWeight;
    const ok = await logBodyweight(today, kg);
    if (!ok) { showToast('Could not save weight.'); return; }
    setWeights(prevW => {
      const others = prevW.filter(w => w.date !== today);
      return [...others, { date: today, weightKg: kg }].sort((a, b) => a.date.localeCompare(b.date));
    });
    setSheet(null);
    showToast(prev != null && kg < prev ? motivate('weightDown', daySeed(today)) : 'Weight logged.');
  };
  const onSaveRun = async (date: string, seconds: number, location: string) => {
    const ok = await logRun(date, seconds, location, '');
    if (!ok) { showToast('Could not save run.'); return; }
    setRuns(await fetchRuns());
    setSheet(null);
    showToast('Run logged. 🏃');
  };

  const headerLine = useMemo(() => {
    const ctx: MotiveContext = viewedDate !== today ? 'open'
      : activeRoutine?.kind === 'run' ? 'runDay'
      : activeRoutine?.kind === 'rest' ? 'restDay' : 'open';
    return motivate(ctx, daySeed(today));
  }, [activeRoutine, viewedDate, today]);

  const chrome = (
    <style>{`
      * { box-sizing: border-box; }
      body { margin: 0; background: ${W.bg}; }
      button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid ${W.volt}; outline-offset: 2px; }
      ::-webkit-scrollbar { width: 0; height: 0; }
    `}</style>
  );

  return (
    <div style={{ background: W.bg, minHeight: '100vh', fontFamily: W.body, maxWidth: 520, margin: '0 auto', color: W.text }}>
      {chrome}

      {toast && (
        <div style={{
          position: 'fixed', top: 'calc(14px + env(safe-area-inset-top))', left: '50%', transform: 'translateX(-50%)',
          zIndex: 999, background: W.raised, border: `1px solid ${W.volt}`, color: W.text,
          padding: '11px 18px', borderRadius: 24, fontSize: 13.5, fontWeight: 600,
          boxShadow: '0 4px 24px rgba(0,0,0,0.6)', maxWidth: '92vw', textAlign: 'center',
        } as CSSProperties}>{toast}</div>
      )}

      {detail && <ExerciseDetail exercise={detail} onClose={() => setDetail(null)} />}
      {sheet === 'profile' && profile && <ProfileSheet profile={profile} onSave={onSaveProfile} onClose={() => setSheet(null)} />}
      {sheet === 'weight' && <BodyweightSheet current={currentWeight} onSave={onSaveWeight} onClose={() => setSheet(null)} />}
      {sheet === 'run' && <RunSheet onSave={onSaveRun} onClose={() => setSheet(null)} />}
      <RestTimer startedAt={restStart} onDone={() => setRestStart(null)} />

      {/* Header */}
      <div style={{ padding: 'calc(18px + env(safe-area-inset-top)) 16px 12px', borderBottom: `1px solid ${W.border}`, position: 'sticky', top: 0, zIndex: 10, background: `${W.bg}F2`, backdropFilter: 'blur(9px)', WebkitBackdropFilter: 'blur(9px)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: W.display, fontSize: 27, letterSpacing: '0.04em', color: W.text, lineHeight: 1 }}>
              WORKOUT<span style={{ color: W.volt }}> PLAN</span>
            </div>
            <div style={{ fontSize: 11.5, color: W.sub, marginTop: 4 }}>{headerLine}</div>
          </div>
          <button onClick={() => setSheet('profile')} aria-label="Profile" style={{ background: 'transparent', border: `1px solid ${W.border}`, borderRadius: 20, padding: '7px 11px', cursor: 'pointer', color: W.muted, display: 'inline-flex' }}>
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '14px 14px 90px' }}>
        {loading ? (
          <div style={{ color: W.sub, textAlign: 'center', padding: 48 }}>Loading your plan…</div>
        ) : tab === 'today' ? (
          <TodayView
            date={viewedDate} today={today} routines={dayRoutines} active={activeRoutine}
            wedVariant={wedVariant} onWedVariant={setWedVariant}
            exercises={exercises} sets={sets} lastSets={lastSets}
            completed={activeRoutine ? completed.has(activeRoutine.id) : false}
            targets={targets} goal={profile?.goal ?? 'recomp'}
            onLog={onLog} onSetDone={() => setRestStart(Date.now())}
            onOpenDetail={setDetail} onComplete={onComplete}
            onLogRun={() => setSheet('run')} onBackToToday={() => setViewedDate(today)}
          />
        ) : tab === 'week' ? (
          <WeekView today={today} viewed={viewedDate} routines={routines} sessionDates={sessionDates}
            onPick={(d) => { setViewedDate(d); setTab('today'); }} />
        ) : (
          <Progress weights={weights} runs={runs} allSets={allSets} exercises={exercises}
            sessionDates={sessionDates} targetWeight={profile?.targetWeightKg ?? null}
            onLogWeight={() => setSheet('weight')} onLogRun={() => setSheet('run')} />
        )}
      </div>

      {/* Bottom tabs */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40, display: 'flex', justifyContent: 'center', gap: 4, padding: '8px 10px calc(8px + env(safe-area-inset-bottom))', background: `${W.bg}F2`, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderTop: `1px solid ${W.border}` }}>
        {([
          { key: 'today' as Tab, label: 'Today', Icon: PlayCircle },
          { key: 'week' as Tab, label: 'Week', Icon: CalendarDays },
          { key: 'progress' as Tab, label: 'Progress', Icon: BarChart3 },
        ]).map(t => {
          const on = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, maxWidth: 150, background: on ? `${W.volt}18` : 'transparent', border: 'none', borderRadius: 12, padding: '8px 4px', cursor: 'pointer', color: on ? W.volt : W.muted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, fontFamily: W.body, fontSize: 11, fontWeight: 700 }}>
              <t.Icon size={19} strokeWidth={on ? 2.4 : 2} /> {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Today
function TodayView(props: {
  date: string; today: string; routines: Routine[]; active: Routine | null;
  wedVariant: 'main' | 'fallback'; onWedVariant: (v: 'main' | 'fallback') => void;
  exercises: Map<string, Exercise>; sets: Map<string, LoggedSet[]>; lastSets: Map<string, LoggedSet[]>;
  completed: boolean; targets: ReturnType<typeof nutritionTargets>; goal: Profile['goal'];
  onLog: (ex: Exercise, setNo: number, w: number | null, r: number | null) => void;
  onSetDone: () => void; onOpenDetail: (e: Exercise) => void; onComplete: () => void;
  onLogRun: () => void; onBackToToday: () => void;
}) {
  const { active } = props;
  const di = dayIndex(props.date);
  const isToday = props.date === props.today;
  const hasFallback = props.routines.some(r => r.variant === 'fallback');
  const kind = active?.kind ?? 'rest';
  const meta = KIND_META[kind];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: W.display, fontSize: 22, color: W.text, letterSpacing: '0.02em' }}>
            {isToday ? 'TODAY' : DAY_NAMES[di].toUpperCase()}
          </div>
          <div style={{ fontSize: 11.5, color: W.muted }}>{fmtLong(props.date)}</div>
        </div>
        {!isToday && (
          <button onClick={props.onBackToToday} style={{ background: 'transparent', border: `1px solid ${W.border}`, borderRadius: 8, padding: '6px 11px', cursor: 'pointer', color: W.sub, fontSize: 12, fontWeight: 600 }}>
            ‹ Today
          </button>
        )}
      </div>

      {/* Wed gym/home toggle */}
      {hasFallback && (
        <div style={{ display: 'flex', gap: 7, marginBottom: 12 }}>
          {([{ v: 'main' as const, label: 'Gym', Icon: Dumbbell }, { v: 'fallback' as const, label: 'Home', Icon: Home }]).map(o => {
            const on = props.wedVariant === o.v;
            return (
              <button key={o.v} onClick={() => props.onWedVariant(o.v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 15px', borderRadius: 20, cursor: 'pointer', fontFamily: W.body, fontSize: 13, fontWeight: 700, border: `1px solid ${on ? W.volt : W.border}`, background: on ? `${W.volt}1A` : 'transparent', color: on ? W.volt : W.sub }}>
                <o.Icon size={15} /> {o.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Session header card */}
      {active && (
        <div style={{ background: W.surface, border: `1px solid ${W.border}`, borderLeft: `3px solid ${meta.color}`, borderRadius: 14, padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: meta.color, fontWeight: 700 }}>{meta.label}</div>
              <div style={{ fontFamily: W.display, fontSize: 24, color: W.text, letterSpacing: '0.02em', marginTop: 2 }}>{active.title}</div>
              <div style={{ fontSize: 12, color: W.sub, marginTop: 2 }}>{active.subtitle}</div>
            </div>
            {props.completed && <CheckCircle2 size={26} color={W.volt} />}
          </div>
        </div>
      )}

      {/* Exercises, or a themed non-lifting card */}
      {active && active.exercises.length > 0 ? (
        <>
          {active.exercises.map(pe => {
            const ex = props.exercises.get(pe.exerciseId);
            if (!ex) return null;
            return (
              <ExerciseCard key={pe.exerciseId} exercise={ex} plan={pe}
                logged={props.sets.get(ex.id) ?? []} last={props.lastSets.get(ex.id) ?? []}
                onLog={(setNo, w, r) => props.onLog(ex, setNo, w, r)}
                onSetDone={props.onSetDone} onOpenDetail={props.onOpenDetail} />
            );
          })}
          <button onClick={props.onComplete} style={{ width: '100%', padding: '13px 0', borderRadius: 12, cursor: 'pointer', marginTop: 2, border: 'none', fontFamily: W.body, fontWeight: 800, fontSize: 15, background: props.completed ? W.raised : W.volt, color: props.completed ? W.sub : W.ink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <CheckCircle2 size={18} /> {props.completed ? 'Session complete — undo?' : 'Complete session'}
          </button>
        </>
      ) : (
        <NonLiftingCard kind={kind} onLogRun={props.onLogRun} />
      )}

      {/* Eat card always shows on the day view */}
      <div style={{ marginTop: 16 }}>
        <EatCard targets={props.targets} goal={props.goal} mealPrepUrl={MEAL_PREP_URL} />
      </div>
    </div>
  );
}

function NonLiftingCard({ kind, onLogRun }: { kind: RoutineKind; onLogRun: () => void }) {
  if (kind === 'run') {
    return (
      <div style={cardCenter}>
        <Trophy size={30} color={KIND_META.run.color} />
        <div style={{ fontFamily: W.display, fontSize: 22, color: W.text, marginTop: 8 }}>parkrun day</div>
        <div style={{ fontSize: 12.5, color: W.sub, margin: '4px 0 14px', maxWidth: 260 }}>Go run your 5k, then log your time to track your PB.</div>
        <button onClick={onLogRun} style={{ background: W.volt, color: W.ink, border: 'none', borderRadius: 11, padding: '11px 20px', cursor: 'pointer', fontFamily: W.body, fontWeight: 800, fontSize: 14 }}>Log my time</button>
      </div>
    );
  }
  if (kind === 'sport') {
    return (
      <div style={cardCenter}>
        <Activity size={30} color={KIND_META.sport.color} />
        <div style={{ fontFamily: W.display, fontSize: 22, color: W.text, marginTop: 8 }}>Active day</div>
        <div style={{ fontSize: 12.5, color: W.sub, marginTop: 4, maxWidth: 260 }}>Padel or squash tonight — that's your cardio and fun sorted. No lifting stacked on top.</div>
      </div>
    );
  }
  return (
    <div style={cardCenter}>
      <Home size={30} color={KIND_META.rest.color} />
      <div style={{ fontFamily: W.display, fontSize: 22, color: W.text, marginTop: 8 }}>Rest & recover</div>
      <div style={{ fontSize: 12.5, color: W.sub, marginTop: 4, maxWidth: 260 }}>Muscle is built on rest days. Light stretch or a walk, drink water, eat well.</div>
    </div>
  );
}

// ---------------------------------------------------------------- Week
function WeekView({ today, viewed, routines, sessionDates, onPick }: {
  today: string; viewed: string; routines: Routine[]; sessionDates: string[];
  onPick: (date: string) => void;
}) {
  const start = weekStartLocal(today);
  const doneSet = new Set(sessionDates);
  return (
    <div>
      <div style={{ fontFamily: W.display, fontSize: 20, color: W.text, letterSpacing: '0.03em', marginBottom: 10 }}>THIS WEEK</div>
      {DAY_NAMES.map((name, di) => {
        const date = addDaysLocal(start, di);
        const dayRoutines = routines.filter(r => r.day === di);
        const main = dayRoutines.find(r => r.variant === 'main') ?? dayRoutines[0];
        const fallback = dayRoutines.find(r => r.variant === 'fallback');
        const meta = KIND_META[main?.kind ?? 'rest'];
        const isToday = date === today;
        const isViewed = date === viewed;
        const done = doneSet.has(date);
        return (
          <button key={di} onClick={() => onPick(date)} style={{
            width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: 8,
            background: W.surface, border: `1px solid ${isViewed ? W.volt : W.border}`,
            borderLeft: `3px solid ${meta.color}`, borderRadius: 12, padding: '11px 13px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ width: 38, flexShrink: 0 }}>
              <div style={{ fontFamily: W.display, fontSize: 15, color: isToday ? W.volt : W.text }}>{DAY_SHORT[di]}</div>
              <div style={{ fontSize: 10, color: W.muted }}>{date.slice(8)}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: W.body, fontSize: 14, fontWeight: 700, color: W.text }}>
                {main?.title ?? 'Rest'}
                {fallback && <span style={{ color: W.muted, fontWeight: 400, fontSize: 12 }}> · or home</span>}
              </div>
              <div style={{ fontSize: 11.5, color: W.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{main?.subtitle ?? ''}</div>
            </div>
            {done && <CheckCircle2 size={18} color={W.volt} style={{ flexShrink: 0 }} />}
          </button>
        );
      })}
    </div>
  );
}

// small local date helpers (avoid importing everything)
function addDaysLocal(ymd: string, n: number): string {
  const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
function weekStartLocal(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00Z'); const dow = (d.getUTCDay() + 6) % 7; return addDaysLocal(ymd, -dow);
}
function fmtLong(ymd: string): string {
  return new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' });
}
const cardCenter = {
  background: W.surface, border: `1px solid ${W.border}`, borderRadius: 14, padding: '28px 18px',
  display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
} as CSSProperties;
