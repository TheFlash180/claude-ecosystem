// Night mode: the app is already dark, but its lilac/pink accents and
// near-white text are still bright and blue-heavy — the wrong thing to light
// a dark bedroom with at 3am. Night mode swaps the palette for dim, warm
// amber-on-black (see App.tsx), and in "auto" does so from 19:00 to 06:00.
//
// The preference is per phone, in localStorage: one parent may want it at
// the 7pm bath while the other is still reading in daylight elsewhere. It is
// a convenience, so a storage failure just means "auto".

export type NightPref = 'auto' | 'on' | 'off';

export const NIGHT_PREF_KEY = 'baby-logger:night-mode';
/** Fired on window when the preference changes, so App re-applies it. */
export const NIGHT_PREF_EVENT = 'baby-night-pref';

export const NIGHT_START_HOUR = 19;
export const NIGHT_END_HOUR = 6;

/** The SAST clock hour, 0-23. The household's night, not the device's zone. */
export function sastHour(now = new Date()): number {
  const h = Number(new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Johannesburg',
  }).format(now));
  return Number.isFinite(h) ? h % 24 : now.getHours();
}

export function isNightHour(now = new Date()): boolean {
  const h = sastHour(now);
  return h >= NIGHT_START_HOUR || h < NIGHT_END_HOUR;
}

export function nightActive(pref: NightPref, now = new Date()): boolean {
  if (pref === 'on') return true;
  if (pref === 'off') return false;
  return isNightHour(now);
}

export function readNightPref(): NightPref {
  try {
    const v = localStorage.getItem(NIGHT_PREF_KEY);
    return v === 'on' || v === 'off' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function writeNightPref(pref: NightPref): void {
  try {
    if (pref === 'auto') localStorage.removeItem(NIGHT_PREF_KEY);
    else localStorage.setItem(NIGHT_PREF_KEY, pref);
  } catch {
    // Storage unavailable: the choice lasts until the page closes, then auto.
  }
  window.dispatchEvent(new CustomEvent(NIGHT_PREF_EVENT, { detail: pref }));
}
