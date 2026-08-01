import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { BarChart3, Dumbbell, LayoutGrid, Settings } from 'lucide-react';
import {
  KIND_META, KIND_ORDER, W,
  type Exercise, type Profile, type Routine, type RoutineKind,
} from './lib/config';
import {
  deleteRun, fetchBodyweights, fetchExercises, fetchProfile, fetchRoutines,
  fetchRuns, logBodyweight, logRun, saveProfile,
} from './lib/data';
import { nutritionTargets, runStats, sastDay, weightTrend } from './lib/fitness';
import { filterRoutines, EMPTY_EXERCISE_FILTER, type ExerciseFilter } from './lib/library';
import { daySeed, motivate } from './lib/motivation';
import { ExerciseDetail } from './components/ExerciseDetail';
import { ExerciseLibrary } from './components/ExerciseLibrary';
import { EatCard } from './components/EatCard';
import { Progress } from './components/Progress';
import { WorkoutCard } from './components/WorkoutCard';
import { WorkoutView } from './components/WorkoutView';
import { BodyweightSheet, ProfileSheet, RunSheet } from './components/Sheets';

type Tab = 'workouts' | 'exercises' | 'progress';
const MEAL_PREP_URL = '../meal-prep/';

export default function App() {
  const today = sastDay();
  const [tab, setTab] = useState<Tab>('workouts');

  const [profile, setProfile] = useState<Profile | null>(null);
  const [exercises, setExercises] = useState<Map<string, Exercise>>(new Map());
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [weights, setWeights] = useState<{ date: string; weightKg: number }[]>([]);
  const [runs, setRuns] = useState<{ date: string; seconds: number; location: string; note: string }[]>([]);

  const [openRoutineId, setOpenRoutineId] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<RoutineKind | 'all'>('all');
  const [exFilter, setExFilter] = useState<ExerciseFilter>(EMPTY_EXERCISE_FILTER);

  const [detail, setDetail] = useState<Exercise | null>(null);
  const [sheet, setSheet] = useState<'profile' | 'weight' | 'run' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  const load = useCallback(async () => {
    const [p, ex, rt, bw, rn] = await Promise.all([
      fetchProfile(), fetchExercises(), fetchRoutines(), fetchBodyweights(), fetchRuns(),
    ]);
    setProfile(p); setExercises(ex); setRoutines(rt); setWeights(bw); setRuns(rn);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const currentWeight = weightTrend(weights, null).current;
  const targets = useMemo(
    () => (profile && currentWeight ? nutritionTargets(profile, currentWeight, today) : null),
    [profile, currentWeight, today],
  );
  const openRoutine = routines.find(r => r.id === openRoutineId) ?? null;
  const exerciseList = useMemo(() => [...exercises.values()], [exercises]);
  const shown = useMemo(() => filterRoutines(routines, kindFilter), [routines, kindFilter]);

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
    const fresh = await fetchRuns();
    setRuns(fresh);
    setSheet(null);
    // A PB only means something once there is a previous time to beat.
    const { latestIsPb } = runStats(fresh);
    showToast(latestIsPb ? motivate('runPb', daySeed(date)) : 'Run logged. 🏃');
  };

  const onDeleteRun = async (date: string) => {
    const ok = await deleteRun(date);
    if (!ok) { showToast('Could not delete that run.'); return; }
    setRuns(prev => prev.filter(r => r.date !== date));
  };

  const headerLine = useMemo(() => motivate('open', daySeed(today)), [today]);

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
          <div style={{ color: W.sub, textAlign: 'center', padding: 48 }}>Loading your workouts…</div>
        ) : tab === 'workouts' ? (
          openRoutine ? (
            <WorkoutView
              routine={openRoutine} exercises={exercises}
              onBack={() => setOpenRoutineId(null)}
              onOpenExercise={setDetail}
              onLogRun={() => setSheet('run')}
            />
          ) : (
            <>
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
                {(['all', ...KIND_ORDER] as const).map(k => {
                  const on = kindFilter === k;
                  return (
                    <button key={k} onClick={() => setKindFilter(k)} style={{
                      flexShrink: 0, cursor: 'pointer', borderRadius: 20, padding: '6px 14px',
                      fontFamily: W.body, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
                      border: `1px solid ${on ? W.volt : W.border}`,
                      background: on ? `${W.volt}1A` : 'transparent',
                      color: on ? W.volt : W.sub,
                    }}>
                      {k === 'all' ? 'All' : KIND_META[k].label}
                    </button>
                  );
                })}
              </div>
              {shown.map(r => (
                <WorkoutCard key={r.id} routine={r} exercises={exercises} onOpen={() => setOpenRoutineId(r.id)} />
              ))}
              {shown.length === 0 && (
                <div style={{ fontSize: 13, color: W.muted, textAlign: 'center', padding: '28px 0' }}>
                  Nothing here yet.
                </div>
              )}
            </>
          )
        ) : tab === 'exercises' ? (
          <ExerciseLibrary exercises={exerciseList} filter={exFilter} onFilter={setExFilter} onOpen={setDetail} />
        ) : (
          <>
            <Progress
              weights={weights} runs={runs}
              targetWeight={profile?.targetWeightKg ?? null}
              onLogWeight={() => setSheet('weight')}
              onLogRun={() => setSheet('run')}
              onDeleteRun={onDeleteRun}
            />
            <EatCard targets={targets} goal={profile?.goal ?? 'recomp'} mealPrepUrl={MEAL_PREP_URL} />
          </>
        )}
      </div>

      {/* Bottom tabs */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40, display: 'flex', justifyContent: 'center', gap: 4, padding: '8px 10px calc(8px + env(safe-area-inset-bottom))', background: `${W.bg}F2`, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderTop: `1px solid ${W.border}` }}>
        {([
          { key: 'workouts' as Tab, label: 'Workouts', Icon: LayoutGrid },
          { key: 'exercises' as Tab, label: 'Exercises', Icon: Dumbbell },
          { key: 'progress' as Tab, label: 'Progress', Icon: BarChart3 },
        ]).map(t => {
          const on = tab === t.key;
          return (
            <button key={t.key} onClick={() => { setTab(t.key); if (t.key === 'workouts') setOpenRoutineId(null); }} style={{ flex: 1, maxWidth: 150, background: on ? `${W.volt}18` : 'transparent', border: 'none', borderRadius: 12, padding: '8px 4px', cursor: 'pointer', color: on ? W.volt : W.muted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, fontFamily: W.body, fontSize: 11, fontWeight: 700 }}>
              <t.Icon size={19} strokeWidth={on ? 2.4 : 2} /> {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
