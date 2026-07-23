import { Plus, Timer, TrendingDown, Trophy } from 'lucide-react';
import { W, type BodyweightEntry, type Exercise, type LoggedSet, type RunEntry } from '../lib/config';
import { bestSet, formatRunTime, sessionsThisWeek } from '../lib/fitness';
import { Sparkline } from './Sparkline';

export function Progress({
  weights, runs, allSets, exercises, sessionDates, targetWeight,
  onLogWeight, onLogRun,
}: {
  weights: BodyweightEntry[];
  runs: RunEntry[];
  allSets: Map<string, LoggedSet[]>;
  exercises: Map<string, Exercise>;
  sessionDates: string[];
  targetWeight: number | null;
  onLogWeight: () => void;
  onLogRun: () => void;
}) {
  const current = weights[weights.length - 1]?.weightKg ?? null;
  const start = weights[0]?.weightKg ?? null;
  const delta = current != null && start != null ? current - start : null;

  const runPb = runs.length ? Math.min(...runs.map(r => r.seconds)) : null;
  const thisWeek = sessionsThisWeek(sessionDates);

  const pbs = [...allSets.entries()]
    .map(([id, sets]) => ({ id, best: bestSet(sets), ex: exercises.get(id) }))
    .filter(p => p.best > 0 && p.ex)
    .sort((a, b) => b.best - a.best)
    .slice(0, 6);

  return (
    <div>
      {/* week consistency */}
      <div style={sectionCard}>
        <Label>This week</Label>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: W.display, fontSize: 40, color: W.volt, lineHeight: 1 }}>{thisWeek}</span>
          <span style={{ fontSize: 12.5, color: W.sub }}>session{thisWeek === 1 ? '' : 's'} logged · aim for 5</span>
        </div>
      </div>

      {/* bodyweight */}
      <div style={sectionCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Label>Bodyweight</Label>
          <button onClick={onLogWeight} style={miniBtn}><Plus size={13} /> Log</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
          <span style={{ fontFamily: W.display, fontSize: 34, color: W.text, lineHeight: 1 }}>
            {current != null ? current.toFixed(1) : '—'}<span style={{ fontSize: 16, color: W.muted }}> kg</span>
          </span>
          {delta != null && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12.5, fontWeight: 600, color: delta <= 0 ? W.volt : W.sub }}>
              <TrendingDown size={13} /> {delta > 0 ? '+' : ''}{delta.toFixed(1)} kg
            </span>
          )}
          {targetWeight != null && <span style={{ fontSize: 11.5, color: W.muted }}>target {targetWeight} kg</span>}
        </div>
        <Sparkline values={weights.map(w => w.weightKg)} />
      </div>

      {/* runs */}
      <div style={sectionCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Label>parkrun · 5 km</Label>
          <button onClick={onLogRun} style={miniBtn}><Plus size={13} /> Log</button>
        </div>
        {runs.length === 0 ? (
          <div style={{ fontSize: 12.5, color: W.muted }}>No runs logged yet — add Saturday's time.</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Trophy size={16} color={W.volt} />
              <span style={{ fontFamily: W.display, fontSize: 30, color: W.volt, lineHeight: 1 }}>{formatRunTime(runPb!)}</span>
              <span style={{ fontSize: 12, color: W.sub }}>PB</span>
            </div>
            {runs.slice(0, 5).map(r => (
              <div key={r.date} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderTop: `1px solid ${W.border}`, fontSize: 12.5 }}>
                <span style={{ color: W.sub, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Timer size={12} /> {fmtDate(r.date)}{r.location && r.location !== 'parkrun' ? ` · ${r.location}` : ''}
                </span>
                <span style={{ fontFamily: W.body, fontWeight: 700, color: r.seconds === runPb ? W.volt : W.text }}>{formatRunTime(r.seconds)}</span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* PBs */}
      {pbs.length > 0 && (
        <div style={sectionCard}>
          <Label>Strength PBs <span style={{ color: W.muted, fontWeight: 400 }}>· est. 1RM</span></Label>
          <div style={{ marginTop: 4 }}>
            {pbs.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: `1px solid ${W.border}`, fontSize: 13 }}>
                <span style={{ color: W.text }}>{p.ex!.name}</span>
                <span style={{ fontFamily: W.body, fontWeight: 700, color: W.volt }}>{p.best.toFixed(0)} kg</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function fmtDate(ymd: string): string {
  return new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
}
function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: W.display, fontSize: 14, letterSpacing: '0.06em', textTransform: 'uppercase', color: W.sub, marginBottom: 4 }}>{children}</div>;
}
const sectionCard = { background: W.surface, border: `1px solid ${W.border}`, borderRadius: 14, padding: 14, marginBottom: 12 } as const;
const miniBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
  background: 'transparent', border: `1px solid ${W.border}`, borderRadius: 8,
  padding: '5px 10px', color: W.text, fontFamily: W.body, fontSize: 12, fontWeight: 600,
} as const;
