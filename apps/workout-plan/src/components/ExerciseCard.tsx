import { useEffect, useState } from 'react';
import { Check, Info } from 'lucide-react';
import { W, type Exercise, type LoggedSet, type RoutineExercise } from '../lib/config';
import { ExerciseImage } from './ExerciseImage';

interface Row { weight: string; reps: string; done: boolean; }

function rowsFrom(target: number, logged: LoggedSet[]): Row[] {
  const byNo = new Map(logged.map(s => [s.setNo, s]));
  const n = Math.max(target, logged.length);
  return Array.from({ length: n }, (_, i) => {
    const s = byNo.get(i + 1);
    return s
      ? { weight: s.weightKg != null ? String(s.weightKg) : '', reps: String(s.reps), done: true }
      : { weight: '', reps: '', done: false };
  });
}

function lastLabel(last: LoggedSet[]): string | null {
  if (last.length === 0) return null;
  return last.map(s => (s.weightKg != null ? `${s.weightKg}×${s.reps}` : `${s.reps}`)).join('  ');
}

export function ExerciseCard({ exercise, plan, logged, last, onLog, onSetDone, onOpenDetail }: {
  exercise: Exercise;
  plan: RoutineExercise;
  logged: LoggedSet[];
  last: LoggedSet[];
  onLog: (setNo: number, weight: number | null, reps: number | null) => void;
  onSetDone: () => void;
  onOpenDetail: (e: Exercise) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => rowsFrom(plan.sets, logged));
  useEffect(() => { setRows(rowsFrom(plan.sets, logged)); /* eslint-disable-next-line */ }, [exercise.id]);

  const bodyweight = exercise.equipment === 'body only';
  const lastRef = lastLabel(last);

  const update = (i: number, patch: Partial<Row>) =>
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const toggleDone = (i: number) => {
    const r = rows[i];
    if (r.done) {
      update(i, { done: false });
      onLog(i + 1, null, null); // clears the set
      return;
    }
    const reps = parseInt(r.reps, 10);
    if (!Number.isFinite(reps) || reps <= 0) return;
    const weight = r.weight === '' ? null : Number(r.weight);
    update(i, { done: true });
    onLog(i + 1, Number.isFinite(weight as number) ? weight : null, reps);
    onSetDone();
  };

  const doneCount = rows.filter(r => r.done).length;

  return (
    <div style={{ background: W.surface, border: `1px solid ${W.border}`, borderRadius: 14, padding: 12, marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={() => onOpenDetail(exercise)} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>
          <ExerciseImage src={exercise.imageUrl} alt={exercise.name} size={64} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: W.body, fontSize: 15, fontWeight: 700, color: W.text }}>{exercise.name}</span>
            <button onClick={() => onOpenDetail(exercise)} aria-label="How to" style={{ background: 'none', border: 'none', cursor: 'pointer', color: W.muted, display: 'flex', padding: 2 }}>
              <Info size={14} />
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: W.muted, marginTop: 1 }}>
            {exercise.muscle} · target {plan.sets} × {plan.reps}
          </div>
          {plan.note && <div style={{ fontSize: 11.5, color: W.voltDim, marginTop: 3 }}>{plan.note}</div>}
          {lastRef && (
            <div style={{ fontSize: 11, color: W.sub, marginTop: 3 }}>
              Last: <span style={{ fontFamily: W.body, fontWeight: 600 }}>{lastRef}</span>
            </div>
          )}
        </div>
        <div style={{ fontFamily: W.display, fontSize: 20, color: doneCount > 0 ? W.volt : W.muted, lineHeight: 1, alignSelf: 'flex-start' }}>
          {doneCount}/{rows.length}
        </div>
      </div>

      {/* set rows */}
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 16, fontSize: 11, color: W.muted, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
            <input
              inputMode="decimal"
              placeholder={bodyweight ? 'BW' : 'kg'}
              value={r.weight}
              onChange={e => update(i, { weight: e.target.value })}
              style={inputStyle(r.done)}
            />
            <span style={{ color: W.muted, fontSize: 12 }}>×</span>
            <input
              inputMode="numeric"
              placeholder="reps"
              value={r.reps}
              onChange={e => update(i, { reps: e.target.value })}
              style={inputStyle(r.done)}
            />
            <button
              onClick={() => toggleDone(i)}
              aria-label={r.done ? 'Un-log set' : 'Log set'}
              style={{
                width: 34, height: 34, borderRadius: 9, flexShrink: 0, cursor: 'pointer',
                border: `1px solid ${r.done ? W.volt : W.border}`,
                background: r.done ? W.volt : 'transparent',
                color: r.done ? W.ink : W.muted,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <Check size={16} strokeWidth={3} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function inputStyle(done: boolean) {
  return {
    flex: 1, minWidth: 0, textAlign: 'center' as const,
    background: W.bg, color: done ? W.volt : W.text,
    border: `1px solid ${W.border}`, borderRadius: 9,
    padding: '8px 6px', fontFamily: W.body, fontSize: 14, fontWeight: 600, outline: 'none',
  };
}
