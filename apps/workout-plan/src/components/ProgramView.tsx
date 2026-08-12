import { Calendar, Check, Clock, Home, Layers, Play, Square } from 'lucide-react';
import { W, type Exercise, type Program, type Routine, type Setting } from '../lib/config';
import { minutesLabel, thumbnails } from '../lib/library';
import { ExerciseImage } from './ExerciseImage';
import {
  hasBothSettings, phaseForWeek, programProgress, progressFraction, progressLabel, routineForDay,
} from '../lib/program';

type Where = Exclude<Setting, 'both'>;

/** The programme tab: the weekly split, where you are in it, and what the
 *  current block asks for. Sessions open in the normal WorkoutView. */
export function ProgramView({
  program, startedOn, routines, exercises, where, onWhere, onOpenRoutine, onStart, onStop, today,
}: {
  program: Program;
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

      {/* Home / gym */}
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

      {program.days.map(day => {
        const routineId = routineForDay(day, where);
        const routine = routineId ? routines.get(routineId) : undefined;
        const both = hasBothSettings(day);
        const time = minutesLabel(routine?.estMinutes ?? null);
        const count = routine?.exercises.length ?? 0;

        return (
          <button
            key={day.dayIndex}
            onClick={() => routineId && onOpenRoutine(routineId)}
            disabled={!routine}
            style={{
              width: '100%', textAlign: 'left', cursor: routine ? 'pointer' : 'default',
              marginBottom: 10, background: W.surface, border: `1px solid ${W.border}`,
              borderLeft: `3px solid ${W.volt}`, borderRadius: 14, padding: '13px 14px',
              display: 'block', fontFamily: W.body, opacity: routine ? 1 : 0.5,
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
        );
      })}

      <div style={{ fontSize: 11.5, color: W.muted, lineHeight: 1.5, marginTop: 4 }}>
        Four sessions, any four days that suit the week — the order matters more
        than the dates. Leave a day between the two upper sessions where you can.
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
