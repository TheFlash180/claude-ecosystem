import { Search } from 'lucide-react';
import { W, type Exercise } from '../lib/config';
import { muscleOptions, searchExercises, type ExerciseFilter } from '../lib/library';
import { ExerciseImage } from './ExerciseImage';

/** Every movement in the catalogue, searchable — for looking up how something
 *  is done without first remembering which workout it belongs to. */
export function ExerciseLibrary({ exercises, filter, onFilter, onOpen }: {
  exercises: Exercise[];
  filter: ExerciseFilter;
  onFilter: (f: ExerciseFilter) => void;
  onOpen: (e: Exercise) => void;
}) {
  const muscles = muscleOptions(exercises);
  const hits = searchExercises(exercises, filter);

  return (
    <div>
      <div style={{ position: 'relative', marginBottom: 9 }}>
        <Search size={15} color={W.muted} style={{ position: 'absolute', left: 12, top: 12 }} />
        <input
          value={filter.search}
          onChange={e => onFilter({ ...filter, search: e.target.value })}
          placeholder="Search a movement, muscle or kit"
          style={{
            width: '100%', boxSizing: 'border-box', background: W.surface, color: W.text,
            border: `1px solid ${W.border}`, borderRadius: 11,
            padding: '10px 12px 10px 34px', fontFamily: W.body, fontSize: 14, outline: 'none',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
        {(['all', ...muscles] as const).map(m => {
          const on = filter.muscle === m;
          return (
            <button
              key={m}
              onClick={() => onFilter({ ...filter, muscle: m })}
              style={{
                flexShrink: 0, cursor: 'pointer', borderRadius: 20, padding: '6px 13px',
                fontFamily: W.body, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                border: `1px solid ${on ? W.volt : W.border}`,
                background: on ? `${W.volt}1A` : 'transparent',
                color: on ? W.volt : W.sub,
              }}
            >
              {m === 'all' ? 'All' : m}
            </button>
          );
        })}
      </div>

      {hits.length === 0 ? (
        <div style={{ fontSize: 13, color: W.muted, textAlign: 'center', padding: '28px 0' }}>
          Nothing matches. Try clearing the filters.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 9 }}>
          {hits.map(e => (
            <button
              key={e.id}
              onClick={() => onOpen(e)}
              style={{
                textAlign: 'left', cursor: 'pointer', background: W.surface,
                border: `1px solid ${W.border}`, borderRadius: 13, padding: 9,
                display: 'flex', flexDirection: 'column', gap: 7, fontFamily: W.body,
              }}
            >
              <ExerciseImage src={e.imageUrl} alt={e.name} radius={9} fill />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: W.text, lineHeight: 1.25 }}>{e.name}</div>
                <div style={{ fontSize: 11, color: W.muted, marginTop: 2 }}>{e.muscle} · {e.equipment}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
