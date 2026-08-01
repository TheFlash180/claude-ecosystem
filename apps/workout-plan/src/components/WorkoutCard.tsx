import { Clock, Layers } from 'lucide-react';
import { KIND_META, W, type Exercise, type Routine } from '../lib/config';
import { minutesLabel, thumbnails } from '../lib/library';
import { ExerciseImage } from './ExerciseImage';

/** One workout type in the library grid. */
export function WorkoutCard({ routine, exercises, onOpen }: {
  routine: Routine;
  exercises: Map<string, Exercise>;
  onOpen: () => void;
}) {
  const meta = KIND_META[routine.kind];
  const thumbs = thumbnails(routine, exercises, 4);
  const time = minutesLabel(routine.estMinutes);
  const count = routine.exercises.length;

  return (
    <button
      onClick={onOpen}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: 10,
        background: W.surface, border: `1px solid ${W.border}`,
        borderLeft: `3px solid ${meta.color}`, borderRadius: 14, padding: '13px 14px',
        display: 'block', fontFamily: W.body,
      }}
    >
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: meta.color, fontWeight: 700 }}>
        {meta.label}
      </div>
      <div style={{ fontFamily: W.display, fontSize: 23, color: W.text, letterSpacing: '0.02em', marginTop: 2 }}>
        {routine.title}
      </div>
      <div style={{ fontSize: 12, color: W.sub, marginTop: 2 }}>{routine.subtitle}</div>

      <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11.5, color: W.muted }}>
        {time && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Clock size={12} /> {time}
          </span>
        )}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Layers size={12} /> {count} {routine.kind === 'mobility' ? 'stretches' : 'exercises'}
        </span>
      </div>

      {thumbs.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 11 }}>
          {thumbs.map((src, i) => (
            <ExerciseImage key={i} src={src} alt="" size={52} radius={9} />
          ))}
        </div>
      )}
    </button>
  );
}
