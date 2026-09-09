import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { GOAL_LABEL, W, type Goal, type Profile, type RunEntry } from '../lib/config';
import {
  comparePb, formatGap, formatRunTime, lastSaturday, pacePerKm, runSeconds, sastDay,
  splitTimeText,
} from '../lib/fitness';

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

/** Two boxes, minutes and seconds, rather than one "mm:ss" field.
 *
 *  The old single field asked for "24:53" behind inputMode="numeric" — and a
 *  phone's numeric keypad has no colon on it, so the time could not actually
 *  be typed at the finish line. Splitting it means every character you need is
 *  on the pad, and the minutes box hands focus over on its own so it still
 *  reads as typing one number. */
export function RunSheet({ runs, onSave, onClose }: {
  runs: RunEntry[];
  onSave: (date: string, seconds: number, location: string) => void;
  onClose: () => void;
}) {
  const today = sastDay();
  const [date, setDate] = useState(today);
  const [mm, setMm] = useState('');
  const [ss, setSs] = useState('');
  const [loc, setLoc] = useState('');
  const [focused, setFocused] = useState<'mm' | 'ss' | null>(null);
  const minRef = useRef<HTMLInputElement>(null);
  const secRef = useRef<HTMLInputElement>(null);

  const secs = runSeconds(mm, ss);
  const secondsTooBig = /^\d{1,2}$/.test(ss) && Number(ss) > 59;
  const saturday = lastSaturday(today);
  const cmp = secs !== null ? comparePb(secs, runs, date) : null;

  const onMinutes = (raw: string) => {
    // A pasted or dictated "24:53" fills both boxes rather than being chopped.
    const digits = raw.replace(/\D/g, '');
    if (/[:.\s]/.test(raw) || (mm === '' && digits.length >= 3)) {
      const parts = splitTimeText(raw);
      if (parts) {
        setMm(parts.minutes);
        setSs(parts.seconds);
        secRef.current?.focus();
        return;
      }
    }
    const next = digits.slice(0, 2);
    setMm(next);
    if (next.length === 2) secRef.current?.focus();
  };

  const box = (active: boolean, error = false) => ({
    background: W.surface, color: W.text,
    border: `1px solid ${error ? W.warn : active ? W.volt : W.border}`,
    borderRadius: 12, padding: '8px 0', width: 96, textAlign: 'center' as const,
    fontFamily: W.display, fontSize: 38, lineHeight: 1.15, letterSpacing: '0.03em',
    outline: 'none', boxSizing: 'border-box' as const,
  });

  return (
    <Sheet title="Log a run" onClose={onClose}>
      <Row label="Time">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 2 }}>
          <input
            ref={minRef} value={mm} onChange={e => onMinutes(e.target.value)}
            onFocus={e => { setFocused('mm'); e.target.select(); }} onBlur={() => setFocused(null)}
            inputMode="numeric" pattern="[0-9]*" enterKeyHint="next"
            placeholder="24" aria-label="Minutes" autoFocus style={box(focused === 'mm')}
          />
          <span style={{ fontFamily: W.display, fontSize: 32, color: W.muted, lineHeight: 1 }}>:</span>
          <input
            ref={secRef} value={ss} onChange={e => setSs(e.target.value.replace(/\D/g, '').slice(0, 2))}
            onFocus={e => { setFocused('ss'); e.target.select(); }} onBlur={() => setFocused(null)}
            onKeyDown={e => {
              // Backspace out of an empty seconds box goes back to minutes, so
              // a mistyped time is fixed without aiming at a small target.
              if (e.key === 'Backspace' && ss === '') { e.preventDefault(); minRef.current?.focus(); }
            }}
            inputMode="numeric" pattern="[0-9]*" enterKeyHint="done"
            placeholder="53" aria-label="Seconds"
            style={box(focused === 'ss', secondsTooBig)}
          />
        </div>
      </Row>

      {/* What the time means, while it is still being typed — pace, and whether
          it beats what is already logged. */}
      <div style={{
        minHeight: 34, marginTop: -4, marginBottom: 10, textAlign: 'center',
        fontFamily: W.body, fontSize: 12.5, lineHeight: 1.5,
      }}>
        {secondsTooBig ? (
          <span style={{ color: W.warn }}>Seconds go up to 59.</span>
        ) : secs === null || cmp === null ? (
          <span style={{ color: W.muted }}>Minutes, then seconds — 24 then 53 for 24:53.</span>
        ) : (
          <>
            <span style={{ color: W.sub }}>{pacePerKm(secs)} /km over 5 km</span>
            <br />
            {cmp.isFirst ? (
              <span style={{ color: W.muted }}>First run logged — this becomes your PB.</span>
            ) : cmp.isPb ? (
              <span style={{ color: W.volt, fontWeight: 700 }}>
                New PB — {formatGap(cmp.deltaSeconds!)} faster than {formatRunTime(cmp.pbSeconds!)}
              </span>
            ) : cmp.deltaSeconds === 0 ? (
              <span style={{ color: W.sub }}>Matches your PB ({formatRunTime(cmp.pbSeconds!)})</span>
            ) : (
              <span style={{ color: W.muted }}>
                {formatGap(cmp.deltaSeconds!)} off your PB ({formatRunTime(cmp.pbSeconds!)})
              </span>
            )}
          </>
        )}
      </div>

      <Row label="Date">
        <input type="date" max={today} style={field} value={date} onChange={e => setDate(e.target.value)} />
      </Row>
      {date !== saturday && (
        // parkrun is on a Saturday; logging it on Sunday should not mean
        // retyping the date on a spinner.
        <button
          onClick={() => setDate(saturday)}
          style={{
            background: 'none', border: `1px solid ${W.border}`, color: W.sub,
            borderRadius: 999, padding: '5px 11px', fontFamily: W.body, fontSize: 11.5,
            cursor: 'pointer', marginTop: -4, marginBottom: 10,
          }}
        >
          Use Saturday {saturday.slice(8)}/{saturday.slice(5, 7)}
        </button>
      )}

      <Row label="parkrun / location (optional)">
        <input style={field} placeholder="parkrun" value={loc} onChange={e => setLoc(e.target.value)} />
      </Row>

      <button
        style={{ ...primary, opacity: secs === null ? 0.5 : 1 }}
        disabled={secs === null}
        onClick={() => { if (secs !== null) onSave(date, secs, loc.trim() || 'parkrun'); }}
      >
        {secs === null ? 'Save run' : `Save ${formatRunTime(secs)}`}
      </button>
    </Sheet>
  );
}

/** Log an AMRAP score. Rounds is the number; the reps box is optional because
 *  most people stop mid-round and "11 + 7" is how that is written. */
export function BenchmarkSheet({ title, onSave, onClose }: {
  title: string;
  onSave: (date: string, rounds: number, reps: number, note: string) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(sastDay());
  const [rounds, setRounds] = useState('');
  const [reps, setReps] = useState('');
  const [note, setNote] = useState('');
  const r = Number(rounds.trim());
  const valid = rounds.trim() !== '' && Number.isInteger(r) && r >= 0;
  const extra = Math.max(0, Math.floor(Number(reps.trim()) || 0));

  return (
    <Sheet title={`${title} — log a score`} onClose={onClose}>
      <Row label="Date"><input type="date" style={field} value={date} onChange={e => setDate(e.target.value)} /></Row>
      <Row label="Rounds completed">
        <input inputMode="numeric" placeholder="11" autoFocus style={field}
               value={rounds} onChange={e => setRounds(e.target.value)} />
      </Row>
      <Row label="Extra reps into the next round (optional)">
        <input inputMode="numeric" placeholder="7" style={field}
               value={reps} onChange={e => setReps(e.target.value)} />
      </Row>
      <Row label="Note (optional)">
        <input style={field} placeholder="banded pull-ups" value={note}
               onChange={e => setNote(e.target.value)} />
      </Row>
      <button style={primary} disabled={!valid}
              onClick={() => { if (valid) onSave(date, r, extra, note.trim()); }}>
        {valid ? `Save ${extra > 0 ? `${r} + ${extra}` : r}` : 'Enter your rounds'}
      </button>
    </Sheet>
  );
}
