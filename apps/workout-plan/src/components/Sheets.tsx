import { useState } from 'react';
import { X } from 'lucide-react';
import { GOAL_LABEL, W, type Goal, type Profile } from '../lib/config';
import { parseRunTime, sastDay } from '../lib/fitness';

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: W.bg, width: '100%', maxWidth: 520, borderRadius: '18px 18px 0 0',
        border: `1px solid ${W.border}`, borderBottom: 'none',
        padding: '16px 16px calc(24px + env(safe-area-inset-bottom))', maxHeight: '86vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontFamily: W.display, fontSize: 22, color: W.text, letterSpacing: '0.02em' }}>{title}</div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: W.muted, cursor: 'pointer', display: 'flex', padding: 4 }}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const field = { background: W.surface, color: W.text, border: `1px solid ${W.border}`, borderRadius: 10, padding: '10px 12px', fontFamily: W.body, fontSize: 14, width: '100%', boxSizing: 'border-box' as const, outline: 'none' };
const primary = { ...field, cursor: 'pointer', background: W.volt, color: W.ink, border: 'none', fontWeight: 800, marginTop: 6 };
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <span style={{ display: 'block', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.09em', color: W.muted, marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

const ACTIVITY = [
  { v: 1.375, label: 'Light (1–2 days)' },
  { v: 1.5, label: 'Moderate (3–5 days)' },
  { v: 1.65, label: 'High (6+ days)' },
];

export function ProfileSheet({ profile, onSave, onClose }: {
  profile: Profile; onSave: (p: Profile) => void; onClose: () => void;
}) {
  const [p, setP] = useState<Profile>(profile);
  return (
    <Sheet title="Your profile" onClose={onClose}>
      <Row label="Date of birth"><input type="date" style={field} value={p.dob ?? ''} onChange={e => setP({ ...p, dob: e.target.value || null })} /></Row>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><Row label="Height (cm)"><input inputMode="numeric" style={field} value={p.heightCm ?? ''} onChange={e => setP({ ...p, heightCm: e.target.value ? Number(e.target.value) : null })} /></Row></div>
        <div style={{ flex: 1 }}><Row label="Target weight (kg)"><input inputMode="decimal" style={field} value={p.targetWeightKg ?? ''} onChange={e => setP({ ...p, targetWeightKg: e.target.value ? Number(e.target.value) : null })} /></Row></div>
      </div>
      <Row label="Goal">
        <select style={field} value={p.goal} onChange={e => setP({ ...p, goal: e.target.value as Goal })}>
          {(Object.keys(GOAL_LABEL) as Goal[]).map(g => <option key={g} value={g}>{GOAL_LABEL[g]}</option>)}
        </select>
      </Row>
      <Row label="Weekly activity">
        <select style={field} value={p.activityFactor} onChange={e => setP({ ...p, activityFactor: Number(e.target.value) })}>
          {ACTIVITY.map(a => <option key={a.v} value={a.v}>{a.label}</option>)}
        </select>
      </Row>
      <Row label="Sex (for the calorie formula)">
        <select style={field} value={p.sex} onChange={e => setP({ ...p, sex: e.target.value as 'male' | 'female' })}>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
      </Row>
      <button style={primary} onClick={() => onSave(p)}>Save profile</button>
    </Sheet>
  );
}

export function BodyweightSheet({ current, onSave, onClose }: {
  current: number | null; onSave: (weight: number) => void; onClose: () => void;
}) {
  const [w, setW] = useState(current != null ? String(current) : '');
  return (
    <Sheet title="Log bodyweight" onClose={onClose}>
      <div style={{ fontSize: 12.5, color: W.sub, marginBottom: 10 }}>Today · {sastDay()}. Weigh in first thing for the truest read.</div>
      <Row label="Weight (kg)"><input inputMode="decimal" autoFocus style={field} value={w} onChange={e => setW(e.target.value)} /></Row>
      <button style={primary} disabled={!w} onClick={() => { const n = Number(w); if (n > 0) onSave(n); }}>Save weight</button>
    </Sheet>
  );
}

export function RunSheet({ onSave, onClose }: {
  onSave: (date: string, seconds: number, location: string) => void; onClose: () => void;
}) {
  const [date, setDate] = useState(sastDay());
  const [time, setTime] = useState('');
  const [loc, setLoc] = useState('');
  const secs = parseRunTime(time);
  return (
    <Sheet title="Log a run" onClose={onClose}>
      <Row label="Date"><input type="date" style={field} value={date} onChange={e => setDate(e.target.value)} /></Row>
      <Row label="Time (mm:ss)"><input inputMode="numeric" placeholder="24:53" autoFocus style={field} value={time} onChange={e => setTime(e.target.value)} /></Row>
      <Row label="parkrun / location (optional)"><input style={field} placeholder="parkrun" value={loc} onChange={e => setLoc(e.target.value)} /></Row>
      <button style={primary} disabled={secs === null} onClick={() => { if (secs !== null) onSave(date, secs, loc.trim() || 'parkrun'); }}>
        {secs !== null ? `Save ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : 'Enter a time like 24:53'}
      </button>
    </Sheet>
  );
}
