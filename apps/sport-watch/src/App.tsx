import React, { useState, useEffect, CSSProperties } from "react";
import eventsData from "./data/events.json";

// =====================
// TYPES
// =====================

type SportKey = "rugby" | "mma" | "f1";

interface SportEvent {
  id: number;
  sport: SportKey;
  competition: string;
  home: string;
  away: string | null;
  homeFlag: string;
  awayFlag: string | null;
  date: Date | null;
  venue?: string;
  result?: string;
  note?: string;
  isConditional?: boolean;
  isSpecial?: boolean;
  dateTBC?: boolean;
}

// =====================
// CONFIG
// =====================

const SPORT: Record<SportKey, { label: string; icon: string; color: string; bg: string; liveDuration: number }> = {
  rugby: { label: "Rugby",  icon: "🏉", color: "#3AA864", bg: "#061B0E", liveDuration: 7200000 },
  mma:   { label: "MMA",    icon: "🥊", color: "#D44040", bg: "#1C0606", liveDuration: 18000000 },
  f1:    { label: "F1",     icon: "🏎️", color: "#E0762F", bg: "#1C0F06", liveDuration: 7200000 },
};

const S = {
  bg:      "#080C09",
  surface: "#111814",
  border:  "#1A221A",
  text:    "#F0EDE6",
  muted:   "#4A524A",
  dim:     "#272F27",
  display: "'Oswald', sans-serif",
  body:    "'Inter', sans-serif",
};

// =====================
// DATA
// =====================

interface RawEvent {
  id: number; sport: string; competition: string;
  home: string; away: string | null;
  homeFlag: string; awayFlag: string | null;
  date: string | null; venue?: string; result?: string;
  note?: string; isConditional?: boolean; isSpecial?: boolean; dateTBC?: boolean;
}

const EVENTS: SportEvent[] = (eventsData.events as RawEvent[])
  .filter(e => e.sport in SPORT)
  .map(e => ({
    ...e,
    sport: e.sport as SportKey,
    date: e.date ? new Date(e.date) : null,
  }));

const SORTED = [...EVENTS].sort((a, b) => {
  if (!a.date && !b.date) return 0;
  if (!a.date) return 1;
  if (!b.date) return -1;
  return a.date.getTime() - b.date.getTime();
});

// =====================
// HELPERS
// =====================

const isPast = (d: Date | null) => !!d && d.getTime() < Date.now();
const isLive = (d: Date | null, sport?: SportKey) => {
  if (!d) return false;
  const n = Date.now();
  const duration = sport ? SPORT[sport].liveDuration : 7200000;
  return n >= d.getTime() && n < d.getTime() + duration;
};

function getCountdown(d: Date | null) {
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

function fmtDate(d: Date) {
  // Same timezone as fmtTime, or a 02:00 SAST kick-off shows the wrong day
  // for viewers outside SAST.
  return d.toLocaleDateString("en-ZA", {
    weekday: "short", day: "numeric", month: "short",
    timeZone: "Africa/Johannesburg",
  });
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString("en-ZA", {
    hour: "2-digit", minute: "2-digit",
    timeZone: "Africa/Johannesburg",
  }) + " SAST";
}

// localStorage persistence for bell reminders (safe in an installed PWA)
const STORAGE_KEY = "sa-sport-watch:notified";
const ALERTED_KEY = "sa-sport-watch:alerted";

function loadIdSet(key: string): Set<number> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw) as number[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveIdSet(key: string, s: Set<number>) {
  try {
    localStorage.setItem(key, JSON.stringify([...s]));
  } catch {
    /* storage unavailable - degrade to in-memory */
  }
}

const loadNotified = () => loadIdSet(STORAGE_KEY);
const saveNotified = (s: Set<number>) => saveIdSet(STORAGE_KEY, s);

// Android Chrome PWAs must show notifications through the service worker —
// `new Notification()` throws there. Try SW first, then the constructor.
async function fireNotification(title: string, body: string): Promise<boolean> {
  if (!("Notification" in window) || Notification.permission !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, { body, icon: "pwa-192.png" });
      return true;
    }
  } catch { /* fall through */ }
  try {
    new Notification(title, { body });
    return true;
  } catch {
    return false;
  }
}

// Fire a one-time alert for any belled event starting within the next hour.
// (No push server, so this runs while the app is open or in the background.)
async function checkReminders(notified: Set<number>) {
  const alerted = loadIdSet(ALERTED_KEY);
  let changed = false;
  for (const ev of EVENTS) {
    if (!notified.has(ev.id) || !ev.date || alerted.has(ev.id)) continue;
    const diff = ev.date.getTime() - Date.now();
    if (diff > 0 && diff <= 3600000) {
      const mins = Math.max(1, Math.round(diff / 60000));
      await fireNotification(
        `🇿🇦 ${ev.home}${ev.away ? ` vs ${ev.away}` : ""}`,
        `Starts in ${mins} min · ${fmtTime(ev.date)}${ev.venue ? ` · ${ev.venue}` : ""}`,
      );
      alerted.add(ev.id);
      changed = true;
    }
  }
  if (changed) saveIdSet(ALERTED_KEY, alerted);
}

// =====================
// SUBCOMPONENTS
// =====================

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0 10px" }}>
      <div style={{ flex: 1, height: 1, background: S.border }} />
      <span style={{
        fontFamily: S.body, fontSize: 9, fontWeight: 600,
        letterSpacing: "0.16em", textTransform: "uppercase", color: S.muted,
      }}>
        {text}
      </span>
      <div style={{ flex: 1, height: 1, background: S.border }} />
    </div>
  );
}

function HeroCard({ event, countdown }: {
  event: SportEvent | undefined;
  countdown: ReturnType<typeof getCountdown>;
}) {
  if (!event || !event.date) {
    return (
      <div style={{
        borderRadius: 14, background: S.surface,
        border: `1px solid ${S.border}`,
        padding: "20px", marginBottom: 14, textAlign: "center",
      }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>🕐</div>
        <div style={{ fontFamily: S.display, fontSize: 16, color: S.text }}>
          Date To Be Announced
        </div>
        <div style={{ fontFamily: S.body, fontSize: 11, color: S.muted, marginTop: 4 }}>
          Switch to All to see upcoming fixtures
        </div>
      </div>
    );
  }

  const sp = SPORT[event.sport];
  const cd = countdown;
  const live = isLive(event.date);

  return (
    <div style={{
      borderRadius: 14,
      background: `linear-gradient(140deg, ${sp.bg} 0%, #090D0A 65%)`,
      border: `1px solid ${sp.color}20`,
      padding: "18px 20px", marginBottom: 14,
      position: "relative", overflow: "hidden",
    }}>
      {/* ambient glow */}
      <div style={{
        position: "absolute", top: -28, right: -28, width: 100, height: 100,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${sp.color}28 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />

      <div style={{
        fontFamily: S.body, fontSize: 9, fontWeight: 600,
        letterSpacing: "0.15em", textTransform: "uppercase",
        color: sp.color, marginBottom: 8,
      }}>
        {sp.icon} {live ? "Live Now" : "Next Up"} · {event.competition}
      </div>

      <div style={{
        fontFamily: S.display, fontSize: 21, fontWeight: 700,
        color: S.text, lineHeight: 1.2, marginBottom: 6,
      }}>
        {event.homeFlag} {event.home}
        {event.away ? ` vs ${event.awayFlag} ${event.away}` : ""}
      </div>

      <div style={{
        fontFamily: S.body, fontSize: 11, color: S.muted, marginBottom: 16,
      }}>
        {fmtDate(event.date)} · {fmtTime(event.date)} · {event.venue}
      </div>

      {live && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 10, height: 10, borderRadius: "50%",
            background: sp.color, animation: "sw-pulse 1.4s ease-in-out infinite",
          }} />
          <span style={{
            fontFamily: S.display, fontSize: 22, fontWeight: 700,
            color: sp.color, letterSpacing: "0.06em",
          }}>
            LIVE NOW
          </span>
        </div>
      )}

      {!live && cd && (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {[
            { v: cd.d, l: "days" },
            { v: cd.h, l: "hrs" },
            { v: cd.m, l: "min" },
            { v: cd.s, l: "sec" },
          ].map(({ v, l }, i) => (
            <span key={l} style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
              <span style={{
                fontFamily: S.display, fontSize: 30,
                fontWeight: 700, color: S.text, lineHeight: 1,
              }}>
                {String(v).padStart(2, "0")}
              </span>
              <span style={{
                fontFamily: S.body, fontSize: 9, color: S.muted,
                letterSpacing: "0.1em", textTransform: "uppercase",
              }}>
                {l}
              </span>
              {i < 3 && (
                <span style={{
                  fontFamily: S.display, fontSize: 22,
                  color: "#1E261E", margin: "0 3px",
                }}>:</span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function BellIcon({ on, color }: { on: boolean; color: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24"
      fill={on ? color : "none"}
      stroke={on ? color : S.muted}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

function EventCard({ event, notified, onToggle }: {
  event: SportEvent;
  notified: boolean;
  onToggle: (id: number) => void;
}) {
  const sp = SPORT[event.sport];
  const past = isPast(event.date) && !isLive(event.date, event.sport);
  const live = isLive(event.date, event.sport);

  return (
    <div style={{
      background: live ? sp.bg : S.surface,
      borderRadius: 10,
      padding: "11px 12px",
      marginBottom: 7,
      borderLeft: `3px solid ${live ? sp.color : past ? S.dim : event.isSpecial ? "#D4A035" : sp.color + "65"}`,
      display: "flex", alignItems: "center", gap: 11,
      opacity: past ? 0.35 : 1,
      outline: live ? `1px solid ${sp.color}22` : event.isSpecial && !past ? `1px solid #D4A03530` : "none",
      outlineOffset: -1,
    }}>
      <div style={{ fontSize: 18, flexShrink: 0 }}>{sp.icon}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Competition label */}
        <div style={{
          fontFamily: S.body, fontSize: 9, fontWeight: 600,
          letterSpacing: "0.11em", textTransform: "uppercase",
          color: past ? S.dim : sp.color,
          marginBottom: 2, display: "flex", alignItems: "center", gap: 6,
        }}>
          {event.competition}
          {live && (
            <span style={{
              background: sp.color, color: "#000",
              padding: "1px 5px", borderRadius: 3,
              fontSize: 7, fontWeight: 800, letterSpacing: "0.1em",
            }}>LIVE</span>
          )}
          {event.result && (
            <span style={{ color: S.text }}> · {event.result}</span>
          )}
        </div>

        {/* Teams */}
        <div style={{
          fontFamily: S.display, fontSize: 15, fontWeight: 600,
          color: past ? "#303830" : S.text,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          lineHeight: 1.2,
        }}>
          {event.homeFlag} {event.home}
          {event.away != null ? ` vs ${event.awayFlag} ${event.away}` : ""}
        </div>

        {/* Date / venue */}
        <div style={{
          fontFamily: S.body, fontSize: 10,
          color: past ? "#282E28" : S.muted,
          marginTop: 2, display: "flex", gap: 4, flexWrap: "wrap",
        }}>
          {event.dateTBC || !event.date ? (
            <span>Date TBA</span>
          ) : (
            <>
              <span>{fmtDate(event.date)}</span>
              <span>·</span>
              <span>{fmtTime(event.date)}</span>
            </>
          )}
          {event.venue && (
            <>
              <span>·</span>
              <span style={{
                maxWidth: 170, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {event.venue}
              </span>
            </>
          )}
        </div>

        {/* Conditional note */}
        {(event.isConditional || event.note) && !event.result && (
          <div style={{
            fontFamily: S.body, fontSize: 9, color: "#8A6830",
            marginTop: 3, fontStyle: "italic",
          }}>
            ⚡ {event.note}
          </div>
        )}
      </div>

      {/* Bell button */}
      {!past && (
        <button
          onClick={() => onToggle(event.id)}
          title={notified ? "Remove reminder" : "Remind me"}
          style={{
            border: `1px solid ${notified ? sp.color : S.border}`,
            background: notified ? `${sp.color}18` : "transparent",
            borderRadius: 7, padding: 7, cursor: "pointer", flexShrink: 0,
            display: "flex", alignItems: "center",
            transition: "all 0.12s",
          }}
        >
          <BellIcon on={notified} color={sp.color} />
        </button>
      )}
    </div>
  );
}

// =====================
// APP
// =====================

export default function App() {
  const [filter, setFilter] = useState<"all" | SportKey>("all");
  const [notified, setNotified] = useState<Set<number>>(loadNotified);
  const [, tick] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  // Re-render every second for countdown
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Pre-kick-off alerts for belled events, checked now and every minute.
  useEffect(() => {
    void checkReminders(notified);
    const t = setInterval(() => void checkReminders(notified), 60000);
    return () => clearInterval(t);
  }, [notified]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const toggleNotify = async (id: number) => {
    const wasOn = notified.has(id);

    if (!wasOn) {
      let granted = false;
      try {
        if ("Notification" in window) {
          if (Notification.permission !== "granted") {
            await Notification.requestPermission();
          }
          granted = Notification.permission === "granted";
        }
      } catch { /* notifications unsupported */ }
      showToast(granted
        ? "🔔 Reminder set — alert ~1h before kick-off"
        : "🔔 Saved — allow notifications for alerts");
    } else {
      showToast("🔕 Reminder removed");
    }

    setNotified(prev => {
      const next = new Set(prev);
      if (wasOn) {
        next.delete(id);
      } else {
        next.add(id);
      }
      saveNotified(next);
      return next;
    });
  };

  const visible  = SORTED.filter(e => filter === "all" || e.sport === filter);
  const past     = visible.filter(e => isPast(e.date) && !isLive(e.date, e.sport) && !e.dateTBC);
  const upcoming = visible.filter(e => !isPast(e.date) || isLive(e.date, e.sport) || e.dateTBC);
  const nextUp   = upcoming.find(e => e.date && !e.dateTBC);
  const cd       = nextUp ? getCountdown(nextUp.date) : null;
  const bellCount = notified.size;

  const filters: { key: "all" | SportKey; label: string }[] = [
    { key: "all",   label: "All" },
    { key: "rugby", label: "🏉 Rugby" },
    { key: "mma",   label: "🥊 MMA" },
    { key: "f1",    label: "🏎️ F1" },
  ];

  return (
    <div style={{ background: S.bg, minHeight: "100vh", fontFamily: S.body, maxWidth: 480, margin: "0 auto" }}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: ${S.bg}; }
        button:focus-visible { outline: 2px solid #3AA864; outline-offset: 2px; }
        ::-webkit-scrollbar { height: 0; }
        @keyframes sw-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 16, left: "50%",
          transform: "translateX(-50%)", zIndex: 999,
          background: "#141E15", border: "1px solid #3AA864",
          color: S.text, padding: "10px 20px", borderRadius: 24,
          fontSize: 13, fontWeight: 500,
          boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
          whiteSpace: "nowrap", pointerEvents: "none",
        } as CSSProperties}>
          {toast}
        </div>
      )}

      {/* Sticky header */}
      <div style={{
        padding: "calc(18px + env(safe-area-inset-top)) 16px 12px",
        borderBottom: `1px solid ${S.border}`,
        position: "sticky", top: 0, zIndex: 10,
        background: S.bg,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{
              fontFamily: S.display, fontSize: 22, fontWeight: 700,
              color: S.text, letterSpacing: "-0.01em",
            }}>
              🇿🇦 SA Sport Watch
            </div>
            <div style={{ fontSize: 11, color: S.muted, marginTop: 1 }}>
              2026 · Rugby · MMA · F1
            </div>
          </div>

          {bellCount > 0 && (
            <div style={{
              background: "#061B0E", border: "1px solid #3AA86445",
              borderRadius: 20, padding: "4px 12px",
              fontSize: 12, color: "#3AA864", fontWeight: 600, flexShrink: 0,
            }}>
              🔔 {bellCount}
            </div>
          )}
        </div>

        {/* Filter pills */}
        <div style={{ display: "flex", gap: 6, marginTop: 12, overflowX: "auto" }}>
          {filters.map(f => {
            const on = filter === f.key;
            const sc = f.key !== "all" ? SPORT[f.key] : null;
            return (
              <button key={f.key} onClick={() => setFilter(f.key)} style={{
                padding: "5px 14px", borderRadius: 20,
                whiteSpace: "nowrap", cursor: "pointer",
                fontFamily: S.body, fontSize: 12, fontWeight: 500,
                border: `1px solid ${on ? (sc?.color || S.text) : S.border}`,
                background: on ? (sc?.bg || "#141E15") : "transparent",
                color: on ? (sc?.color || S.text) : S.muted,
                transition: "all 0.1s",
              }}>
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "14px 14px 48px" }}>

        {/* Hero countdown */}
        <HeroCard event={nextUp} countdown={cd} />

        {/* Upcoming events */}
        {upcoming.length > 0 && (
          <>
            <SectionLabel text="Upcoming" />
            {upcoming.map(e => (
              <EventCard key={e.id} event={e}
                notified={notified.has(e.id)} onToggle={toggleNotify} />
            ))}
          </>
        )}

        {/* Past events */}
        {past.length > 0 && (
          <>
            <SectionLabel text="Recent" />
            {past.map(e => (
              <EventCard key={e.id} event={e}
                notified={notified.has(e.id)} onToggle={toggleNotify} />
            ))}
          </>
        )}

        {visible.length === 0 && (
          <div style={{
            textAlign: "center", padding: "48px 20px",
            color: S.muted, fontSize: 14,
          }}>
            No events found.
          </div>
        )}

        {/* Footer note */}
        <div style={{
          marginTop: 20, padding: "12px 14px",
          background: S.surface, borderRadius: 10,
          fontSize: 10, color: S.muted, lineHeight: 1.7,
        }}>
          📌 Times in SAST. DDP vs Usman (18 Jul) is the road back after losing the MW title to Chimaev. To update fixtures: edit src/data/events.json and push.
        </div>
      </div>
    </div>
  );
}
