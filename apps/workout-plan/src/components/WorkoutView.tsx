import { ChevronLeft, ChevronRight, Clock, Timer } from 'lucide-react';
import { KIND_META, W, type Exercise, type Routine } from '../lib/config';
import { minutesLabel, musclesOf, prescription, stepsOf } from '../lib/library';
import { ExerciseImage } from './ExerciseImage';

/** A single workout, top to bottom: what it is, then the movements in order.
 *  Nothing here is logged — tap a movement to see how it is done. */
export function WorkoutView({ routine, exercises, onBack, onOpenExercise, onLogRun }: {
  routine: Routine;
  exercises: Map<string, Exercise>;
  onBack: () => void;
  onOpenExercise: (e: Exercise) => void;
  onLogRun: () => void;
}) {
  const meta = KIND_META[routine.kind];
  const steps = stepsOf(routine, exercises);
  const time = minutesLabel(routine.estMinutes);
  const muscles = musclesOf(routine, exercises);

  return (
    <div>
      <button onClick={onBack} style={{
        display: 'inline-flex', alignItems: 'center', gap: 3, marginBottom: 12,
        background: 'transparent', border: `1px solid ${W.border}`, borderRadius: 9,
        padding: '6px 11px 6px 7px', cursor: 'pointer',
        color: W.sub, fontFamily: W.body, fontSize: 12.5, fontWeight: 600,
      }}>
        <ChevronLeft size={15} /> All workouts
      </button>

      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: meta.color, fontWeight: 700 }}>
        {meta.label}
      </div>
      <h1 style={{ fontFamily: W.display, fontSize: 32, color: W.text, letterSpacing: '0.02em', margin: '2px 0 0', fontWeight: 400 }}>
        {routine.title}
      </h1>
      <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 12, color: W.muted }}>
        {time && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Clock size={13} /> {time}
          </span>
        )}
        <span>{routine.subtitle}</span>
      </div>

      {routine.summary && (
        <p style={{ fontSize: 13.5, color: W.sub, lineHeight: 1.6, margin: '13px 0 0' }}>
          {routine.summary}
        </p>
      )}

      {muscles.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {muscles.map(m => (
            <span key={m} style={{
              fontSize: 11, color: W.sub, background: W.raised,
              border: `1px solid ${W.border}`, borderRadius: 20, padding: '4px 10px',
            }}>
              {m}
            </span>
          ))}
        </div>
      )}

      {routine.kind === 'run' && (
        <button onClick={onLogRun} style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          width: '100%', marginTop: 14, background: W.volt, color: W.ink, border: 'none',
          borderRadius: 11, padding: '12px 18px', cursor: 'pointer',
          fontFamily: W.body, fontWeight: 800, fontSize: 14,
        }}>
          <Timer size={16} /> Log my time
        </button>
      )}

      <div style={{
        fontFamily: W.display, fontSize: 14, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: W.muted, margin: '22px 0 9px',
      }}>
        {routine.kind === 'run' ? 'Warm-up' : 'The workout'}
      </div>

      {steps.length === 0 && (
        <div style={{ fontSize: 13, color: W.muted }}>No movements listed for this one yet.</div>
      )}

      {steps.map(({ plan, exercise }, i) => (
        <button
          key={`${exercise.id}-${i}`}
          onClick={() => onOpenExercise(exercise)}
          style={{
            width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: 8,
            background: W.surface, border: `1px solid ${W.border}`, borderRadius: 13,
            padding: 11, display: 'flex', alignItems: 'center', gap: 12, fontFamily: W.body,
          }}
        >
          <ExerciseImage src={exercise.imageUrl} alt={exercise.name} size={62} radius={10} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
              <span style={{ fontSize: 11, color: W.muted, fontWeight: 700 }}>{i + 1}</span>
              <span style={{ fontSize: 14.5, fontWeight: 700, color: W.text }}>{exercise.name}</span>
            </div>
            <div style={{ fontSize: 13, color: W.volt, fontWeight: 700, marginTop: 3 }}>
              {prescription(plan)}
            </div>
            <div style={{ fontSize: 11.5, color: W.muted, marginTop: 2 }}>
              {plan.note || `${exercise.muscle} · ${exercise.equipment}`}
            </div>
          </div>
          <ChevronRight size={18} color={W.muted} style={{ flexShrink: 0 }} />
        </button>
      ))}
    </div>
  );
}
