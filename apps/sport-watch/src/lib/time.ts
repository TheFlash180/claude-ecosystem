// Pure date/time helpers for SA Sport Watch — kept free of React and app
// config so they can be unit-tested.

export const DEFAULT_LIVE_DURATION = 7200000; // 2h

export const isPast = (d: Date | null) => !!d && d.getTime() < Date.now();

/** An event is "live" from kick-off until its typical duration has passed
 *  (2h for rugby/F1, 5h for MMA cards — the caller passes the duration). */
export const isLive = (d: Date | null, durationMs = DEFAULT_LIVE_DURATION) => {
  if (!d) return false;
  const n = Date.now();
  return n >= d.getTime() && n < d.getTime() + durationMs;
};

export function getCountdown(d: Date | null) {
  if (!d) return null;
  const diff = d.getTime() - Date.now();
  if (diff <= 0) return null;
  return {
    d: Math.floor(diff / 86400000),
    h: Math.floor((diff % 86400000) / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
    s: Math.floor((diff % 60000) / 1000),
  };
}

export function fmtDate(d: Date) {
  // Same timezone as fmtTime, or a 02:00 SAST kick-off shows the wrong day
  // for viewers outside SAST.
  return d.toLocaleDateString("en-ZA", {
    weekday: "short", day: "numeric", month: "short",
    timeZone: "Africa/Johannesburg",
  });
}

export function fmtTime(d: Date) {
  return d.toLocaleTimeString("en-ZA", {
    hour: "2-digit", minute: "2-digit",
    timeZone: "Africa/Johannesburg",
  }) + " SAST";
}
