import { useEffect, useState } from 'react';
import { Timer, X } from 'lucide-react';
import { W } from '../lib/config';

/** A dismissible rest countdown that appears when `startedAt` changes.
 *  Sits above the tab bar; buzzes (if allowed) when it hits zero. */
export function RestTimer({ startedAt, seconds = 90, onDone }: {
  startedAt: number | null;
  seconds?: number;
  onDone: () => void;
}) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    setRemaining(seconds);
    const started = Date.now();
    const t = setInterval(() => {
      const left = seconds - Math.floor((Date.now() - started) / 1000);
      if (left <= 0) {
        clearInterval(t);
        setRemaining(0);
        try { navigator.vibrate?.(200); } catch { /* unsupported */ }
        onDone();
      } else {
        setRemaining(left);
      }
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt]);

  if (!startedAt || remaining <= 0) return null;

  return (
    <div style={{
      position: 'fixed', left: '50%', transform: 'translateX(-50%)',
      bottom: 'calc(78px + env(safe-area-inset-bottom))', zIndex: 50,
      display: 'flex', alignItems: 'center', gap: 10,
      background: W.raised, border: `1px solid ${W.volt}`, borderRadius: 24,
      padding: '9px 14px', boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
    }}>
      <Timer size={16} color={W.volt} />
      <span style={{ fontFamily: W.display, fontSize: 20, color: W.volt, letterSpacing: '0.04em', minWidth: 42, textAlign: 'center' }}>
        {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
      </span>
      <span style={{ fontSize: 11.5, color: W.sub }}>rest</span>
      <button onClick={onDone} aria-label="Skip rest" style={{ background: 'none', border: 'none', color: W.muted, cursor: 'pointer', display: 'flex', padding: 2 }}>
        <X size={16} />
      </button>
    </div>
  );
}
