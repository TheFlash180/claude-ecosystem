import { X } from 'lucide-react';
import { W, type Exercise } from '../lib/config';
import { ExerciseImage } from './ExerciseImage';

export function ExerciseDetail({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: W.bg, width: '100%', maxWidth: 520, borderRadius: '18px 18px 0 0',
        border: `1px solid ${W.border}`, borderBottom: 'none',
        maxHeight: '86vh', overflowY: 'auto', padding: '16px 16px calc(24px + env(safe-area-inset-bottom))',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: W.display, fontSize: 24, color: W.text, letterSpacing: '0.02em' }}>{exercise.name}</div>
            <div style={{ fontSize: 12, color: W.muted, marginTop: 2 }}>{exercise.muscle} · {exercise.equipment}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: W.muted, cursor: 'pointer', display: 'flex', padding: 4 }}>
            <X size={20} />
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <ExerciseImage src={exercise.imageUrl} alt={exercise.name} size={260} radius={14} />
        </div>
        <div style={{ fontSize: 13.5, color: W.sub, lineHeight: 1.6 }}>
          {exercise.instructions || 'Focus on controlled reps and full range of motion.'}
        </div>
      </div>
    </div>
  );
}
