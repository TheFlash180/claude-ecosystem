import { Plus, Timer, Trash2, TrendingDown, Trophy } from 'lucide-react';
import { W, type BodyweightEntry, type RunEntry } from '../lib/config';
import { formatRunTime, runStats, weightTrend } from '../lib/fitness';
import { Sparkline } from './Sparkline';

/** The two things worth a history: what you weigh and how fast you run 5 km. */
export function Progress({
  weights, runs, targetWeight, onLogWeight, onLogRun, onDeleteRun,
}: {
  weights: BodyweightEntry[];
  runs: RunEntry[];
  targetWeight: number | null;
  onLogWeight: () => void;
  onLogRun: () => void;
  onDeleteRun: (date: string) => void;
}) {
  const trend = weightTrend(weights, targetWeight);
  const { pbSeconds } = runStats(runs);

  return (
    <div>
      {/* bodyweight */}
      <div style={sectionCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Label>Bodyweight</Label>
          <button onClick={onLogWeight} style={miniBtn}><Plus size={13} /> Log</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: W.display, fontSize: 34, color: W.text, lineHeight: 1 }}>
            {trend.current != null ? trend.current.toFixed(1) : '—'}<span style={{ fontSize: 16, color: W.muted }}> kg</span>
          </span>
          {trend.delta != null && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12.5, fontWeight: 600, color: trend.delta <= 0 ? W.volt : W.sub }}>
              <TrendingDown size={13} /> {trend.delta > 0 ? '+' : ''}{trend.delta.toFixed(1)} kg
            </span>
          )}
          {trend.toTarget != null && (
            <span style={{ fontSize: 11.5, color: W.muted }}>
              {trend.toTarget > 0 ? `${trend.toTarget.toFixed(1)} kg to target` : `target ${targetWeight} kg reached`}
            </span>
          )}
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
              <span style={{ fontFamily: W.display, fontSize: 30, color: W.volt, lineHeight: 1 }}>{formatRunTime(pbSeconds!)}</span>
              <span style={{ fontSize: 12, color: W.sub }}>PB</span>
            </div>
            {runs.slice(0, 8).map(r => (
              <div key={r.date} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderTop: `1px solid ${W.border}`, fontSize: 12.5 }}>
                <span style={{ flex: 1, color: W.sub, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Timer size={12} /> {fmtDate(r.date)}{r.location && r.location !== 'parkrun' ? ` · ${r.location}` : ''}
                </span>
                <span style={{ fontFamily: W.body, fontWeight: 700, color: r.seconds === pbSeconds ? W.volt : W.text }}>{formatRunTime(r.seconds)}</span>
                <button
                  onClick={() => onDeleteRun(r.date)}
                  aria-label={`Delete run on ${r.date}`}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: W.muted, display: 'flex', padding: 2 }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </>
        )}
      </div>
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
