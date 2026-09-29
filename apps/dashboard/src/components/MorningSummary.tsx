import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { supabaseConfigured } from '@ecosystem/shared';
import {
  disableMorning, enableMorning, morningStatus, type MorningState,
} from '../lib/morning';

/** One line under the date: the switch for the 07:00 summary. Lives outside
 *  Today on purpose — Today disappears on a quiet day, and the switch must
 *  not disappear with it. */
export function MorningSummary() {
  const [state, setState] = useState<MorningState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured()) return;
    let live = true;
    void morningStatus().then(s => { if (live) setState(s); }).catch(() => { if (live) setState('off'); });
    return () => { live = false; };
  }, []);

  if (state === null) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      setState(state === 'on' ? await disableMorning() : await enableMorning());
    } catch {
      // Leave the state as it was; the next tap tries again.
    } finally {
      setBusy(false);
    }
  };

  if (state === 'unsupported') {
    return (
      <p className="morning morning--note">
        <BellOff size={13} aria-hidden="true" />
        Add the hub to your home screen to get a 07:00 summary.
      </p>
    );
  }
  if (state === 'denied') {
    return (
      <p className="morning morning--note">
        <BellOff size={13} aria-hidden="true" />
        Notifications are blocked for this site — allow them in the browser to get the 07:00 summary.
      </p>
    );
  }

  const on = state === 'on';
  return (
    <p className="morning">
      <Bell size={13} aria-hidden="true" />
      {/* Short enough for one line on a phone; the quiet-day rule is in the
          tooltip rather than wrapping the bell onto a line of its own. */}
      <span title="Sent only on days with something on — a quiet day sends nothing.">
        {on ? '07:00 summary is on' : 'Get a 07:00 summary of the day'}
      </span>
      <button type="button" className="morning-btn" onClick={() => void toggle()} disabled={busy}>
        {busy ? '…' : on ? 'Turn off' : 'Turn on'}
      </button>
    </p>
  );
}

export const MORNING_CSS = `
.morning {
  display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px;
  margin: -12px 0 20px; font-size: 0.78rem; color: var(--text-dim);
}
.morning svg { flex: none; }
.morning--note { font-size: 0.74rem; }
.morning-btn {
  font: inherit; font-weight: 600; font-size: 0.74rem; color: var(--text);
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 999px; padding: 3px 11px; cursor: pointer;
  transition: border-color 160ms ease;
}
.morning-btn:hover, .morning-btn:focus-visible { border-color: var(--text-dim); }
.morning-btn:focus-visible { outline: 2px solid var(--text-dim); outline-offset: 2px; }
.morning-btn:disabled { opacity: 0.6; cursor: default; }
`;
