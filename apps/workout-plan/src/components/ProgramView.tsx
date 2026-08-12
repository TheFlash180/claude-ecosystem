import { Calendar, Check, Clock, Home, Layers, Play, Square } from 'lucide-react';
import { W, type Benchmark, type Exercise, type Program, type Routine, type Setting } from '../lib/config';
import { minutesLabel, thumbnails } from '../lib/library';
import { ExerciseImage } from './ExerciseImage';
import {
  benchmarkStats, hasBothSettings, phaseForWeek, programProgress, progressFraction,
  progressLabel, routineForDay, scoreLabel,
} from '../lib/program';

type Where = Exclude<Setting, 'both'>;

/** The programme tab: the weekly split, where you are in it, and what the
 *  current block asks for. Sessions open in the normal WorkoutView. */
export function ProgramView({
  program, programs, onPickProgram, startedOn, routines, exercises, benchmarks,
  where, onWhere, onOpenRoutine, onLogScore, onStart, onStop, today,
}: {
  program: Program;
  programs: Program[];
  onPickProgram: (id: string) => void;
  benchmarks: Benchmark[];
  onLogScore: (routineId: string) => void;
  startedOn: string | null;
  routines: Map<string, Routine>;
  exercises: Map<string, Exercise>;
  where: Where;
  onWhere: (w: Where) => void;
  onOpenRoutine: (id: string) => void;
  onStart: () => void;
  onStop: () => void;
  today: string;
}) {
  const progress = programProgress(startedOn, program.weeks, today);
  const phase = progress ? phaseForWeek(program.phases, progress.week) : null;
  const running = progress !== null;

  return (
    <div style={{ fontFamily: W.body }}>
      {programs.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 13, flexWrap: 'wrap' }}>
          {programs.map(p => {
            const on = p.id === program.id;
            return (
              <button key={p.id} onClick={() => onPickProgram(p.id)} style={{
                cursor: 'pointer', borderRadius: 20, padding: '6px 14px',
                fontFamily: W.body, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
                border: `1px solid ${on ? W.volt : W.border}`,
                background: on ? `${W.volt}1A` : 'transparent',
                color: on ? W.volt : W.sub,
              }}>
                {p.title}
              </button>
            );
          })}
        </div>
      )}
      <div style={{ fontFamily: W.display, fontSize: 30, color: W.text, letterSpacing: '0.02em' }}>
        {program.title}
      </div>
      <div style={{ fontSize: 12.5, color: W.sub, marginTop: 2 }}>{program.subtitle}</div>

      {/* Where you are */}
      <div style={{ background: W.surface, border: `1px solid ${W.border}`, borderRadius: 14, padding: 14, marginTop: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{
            fontFamily: W.display, fontSize: 20,
            color: progress?.complete ? W.volt : W.text, letterSpacing: '0.02em',
          }}>
            {progressLabel(progress)}
          </span>
          <button
            onClick={running ? onStop : onStart}
            style={{
              cursor: 'pointer', borderRadius: 10, padding: '7px 13px',
              fontFamily: W.body, fontSize: 12.5, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              border: `1px solid ${running ? W.border : W.volt}`,
              background: running ? 'transparent' : W.volt,
              color: running ? W.sub : W.ink,
            }}
          >
            {running ? <><Square size={13} /> Stop</> : <><Play size={13} /> Start</>}
          </button>
        </div>

        <div style={{ height: 6, borderRadius: 3, background: W.raised, marginTop: 11, overflow: 'hidden' }}>
          <div style={{
            width: `${Math.round(progressFraction(progress) * 100)}%`,
            height: '100%', background: W.volt, borderRadius: 3,
          }} />
        </div>

        {startedOn && (
          <div style={{ fontSize: 11.5, color: W.muted, marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Calendar size={12} /> Started {startedOn}
          </div>
        )}
        {!running && (
          <div style={{ fontSize: 12.5, color: W.sub, marginTop: 9, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
            {program.summary}
          </div>
        )}
      </div>

      {/* What this block asks for */}
      {phase && (
        <div style={{
          background: `${W.volt}12`, border: `1px solid ${W.volt}40`,
          borderRadius: 14, padding: 14, marginTop: 10,
        }}>
          <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: W.volt, fontWeight: 700 }}>
            Weeks {phase.fromWeek}–{phase.toWeek}
          </div>
          <div style={{ fontFamily: W.display, fontSize: 21, color: W.text, letterSpacing: '0.02em', marginTop: 2 }}>
            {phase.title}
          </div>
          <div style={{ fontSize: 12.5, color: W.sub, marginTop: 6, lineHeight: 1.55 }}>
            {phase.guidance}
          </div>
        </div>
      )}

      {/* Home / gym — not rendered at all when every session in this programme
          is the same either way, as in Twenty. */}
      {program.days.some(hasBothSettings) && (
      <div style={{ display: 'flex', gap: 6, marginTop: 14, marginBottom: 10 }}>
        {(['home', 'gym'] as const).map(w => {
          const on = where === w;
          return (
            <button key={w} onClick={() => onWhere(w)} style={{
              flex: 1, cursor: 'pointer', borderRadius: 10, padding: '8px 0',
              fontFamily: W.body, fontSize: 12.5, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              border: `1px solid ${on ? W.volt : W.border}`,
              background: on ? `${W.volt}1A` : 'transparent',
              color: on ? W.volt : W.sub,
            }}>
              {w === 'home' ? <Home size={14} /> : <Dumbbell14 />}
              {w === 'home' ? 'At home' : 'At the gym'}
            </button>
          );
        })}
      </div>
      )}

      {program.days.map(day => {
        const routineId = routineForDay(day, where);
        const routine = routineId ? routines.get(routineId) : undefined;
        const both = hasBothSettings(day);
        const time = minutesLabel(routine?.estMinutes ?? null);
        const count = routine?.exercises.length ?? 0;

        const stats = routine?.scored ? benchmarkStats(benchmarks, routine.id) : null;

        return (
          // A card, not a button: the scored rows carry their own Log-score
          // control, and a button cannot be nested inside a button.
          <div
            key={day.dayIndex}
            style={{
              marginBottom: 10, background: W.surface, border: `1px solid ${W.border}`,
              borderLeft: `3px solid ${W.volt}`, borderRadius: 14,
              fontFamily: W.body, opacity: routine ? 1 : 0.5, overflow: 'hidden',
            }}
          >
          <button
            onClick={() => routineId && onOpenRoutine(routineId)}
            disabled={!routine}
            style={{
              width: '100%', textAlign: 'left', cursor: routine ? 'pointer' : 'default',
              background: 'transparent', border: 'none', padding: '13px 14px',
              display: 'block', fontFamily: W.body, color: 'inherit',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{
                fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em',
                color: W.volt, fontWeight: 700,
              }}>
                Day {day.dayIndex}
              </span>
              {!both && (
                <span style={{ fontSize: 10.5, color: W.muted, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <Check size={11} /> same either way
                </span>
              )}
            </div>
            <div style={{ fontFamily: W.display, fontSize: 22, color: W.text, letterSpacing: '0.02em', marginTop: 2 }}>
              {day.label}
            </div>
            {routine?.subtitle && (
              <div style={{ fontSize: 12, color: W.sub, marginTop: 2 }}>{routine.subtitle}</div>
            )}
            <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11.5, color: W.muted }}>
              {time && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={12} /> {time}
                </span>
              )}
              {count > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Layers size={12} /> {count} exercises
                </span>
              )}
            </div>
            {day.note && (
              <div style={{ fontSize: 11.5, color: W.muted, marginTop: 7, lineHeight: 1.45 }}>{day.note}</div>
            )}
            {routine && thumbnails(routine, exercises, 4).length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 11 }}>
                {thumbnails(routine, exercises, 4).map((src, i) => (
                  <ExerciseImage key={i} src={src} alt="" size={52} radius={9} />
                ))}
              </div>
            )}
          </button>

          {routine && stats && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              padding: '10px 14px', borderTop: `1px solid ${W.border}`, background: W.raised,
            }}>
              <span style={{ fontSize: 11.5, color: W.sub, display: 'inline-flex', alignItems: 'baseline', gap: 7 }}>
                {stats.pb ? (
                  <>
                    <span style={{ fontFamily: W.display, fontSize: 17, color: W.volt, letterSpacing: '0.02em' }}>
                      {scoreLabel(stats.pb)}
                    </span>
                    <span>best{stats.attempts > 1 ? ` of ${stats.attempts}` : ''}</span>
                    {stats.latest && !stats.latestIsPb && (
                      <span style={{ color: W.muted }}>· last {scoreLabel(stats.latest)}</span>
                    )}
                    {stats.latestIsPb && <span style={{ color: W.volt }}>· new PB</span>}
                  </>
                ) : (
                  <span style={{ color: W.muted }}>No score yet — the round count is the point.</span>
                )}
              </span>
              <button
                onClick={() => onLogScore(routine.id)}
                style={{
                  flexShrink: 0, cursor: 'pointer', borderRadius: 9, padding: '6px 11px',
                  fontFamily: W.body, fontSize: 12, fontWeight: 700,
                  border: `1px solid ${W.volt}`, background: 'transparent', color: W.volt,
                }}
              >
                Log score
              </button>
            </div>
          )}
          </div>
        );
      })}

      <div style={{ fontSize: 11.5, color: W.muted, lineHeight: 1.5, marginTop: 4 }}>
        {program.days.length} sessions, any {program.days.length} days that suit the
        week — the order matters more than the dates.
      </div>
    </div>
  );
}

/** lucide's Dumbbell at the size the toggle wants, without a second import
 *  line in App for one icon. */
function Dumbbell14() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6.5 6.5 11 11" /><path d="m21 21-1-1" /><path d="m3 3 1 1" />
      <path d="m18 22 4-4" /><path d="m2 6 4-4" /><path d="m3 10 7-7" /><path d="m14 21 7-7" />
    </svg>
  );
}
