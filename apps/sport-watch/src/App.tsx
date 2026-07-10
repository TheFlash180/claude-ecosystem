import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, CSSProperties } from "react";
import { S, SPORT, type SportEvent, type SportKey } from "./lib/config";
import { fetchEvents, sortEvents } from "./lib/events";
import { fmtTime, getCountdown, isPast, isLive } from "./lib/time";
import { pruneToExisting } from "./lib/reminders";
import { loadIdSet, saveIdSet, loadLeads, saveLead } from "./lib/storage";
import {
  DEFAULT_LEAD_MINUTES,
  registerPush,
  removeReminder,
  setReminder,
  syncAllReminders,
} from "./lib/push";
import { CALENDAR_FEED_URL, downloadEventIcs } from "./lib/ics";
import { HeroCard } from "./components/HeroCard";
import { EventCard } from "./components/EventCard";
import { RemindersModal } from "./components/RemindersModal";

// Owners only — keep admin code out of the normal bundle.
const AdminPage = lazy(() => import("./components/AdminPage"));

const STORAGE_KEY = "sa-sport-watch:notified";
const ALERTED_KEY = "sa-sport-watch:alerted";

const loadNotified = () => loadIdSet(STORAGE_KEY);
const saveNotified = (s: Set<string>) => saveIdSet(STORAGE_KEY, s);

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

// Fire a one-time in-app alert for any belled event starting within the next
// hour. (Fallback for the foreground app — real pushes with per-reminder lead
// times are handled server-side by the send-sport-reminders edge function.)
async function checkReminders(events: SportEvent[], notified: Set<string>) {
  const alerted = loadIdSet(ALERTED_KEY);
  let changed = false;
  for (const ev of events) {
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

function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0 10px" }}>
      <div style={{ flex: 1, height: 1, background: S.border }} />
      <span style={{
        fontFamily: S.body, fontSize: 9, fontWeight: 600,
        letterSpacing: "0.18em", textTransform: "uppercase", color: S.muted,
      }}>
        {text}
      </span>
      <div style={{ flex: 1, height: 1, background: S.border }} />
    </div>
  );
}

export default function App() {
  const route = useHashRoute();
  const [filter, setFilter] = useState<"all" | SportKey>("all");
  const [events, setEvents] = useState<SportEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [notified, setNotified] = useState<Set<string>>(loadNotified);
  const [leads, setLeads] = useState<Record<string, number>>(loadLeads);
  const [showReminders, setShowReminders] = useState(false);
  const [, tick] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const pushReady = useRef(false);

  const leadFor = useCallback(
    (id: string) => leads[id] ?? DEFAULT_LEAD_MINUTES,
    [leads],
  );

  const loadEvents = useCallback(async () => {
    const { events: evs } = await fetchEvents();
    setEvents(sortEvents(evs));
    setLoading(false);
  }, []);

  useEffect(() => { void loadEvents(); }, [loadEvents]);

  // Once real events are in: prune bells whose event no longer exists (the
  // header count must never include ghosts), then bring the server's push
  // reminders in line with this device.
  useEffect(() => {
    if (events.length === 0) return;
    const valid = new Set(events.map(e => e.id));
    setNotified(prev => {
      const pruned = pruneToExisting(prev, valid);
      if (pruned.size !== prev.size) saveNotified(pruned);
      (async () => {
        if (!pushReady.current) pushReady.current = await registerPush();
        if (pushReady.current) await syncAllReminders(events, pruned, leadFor);
      })();
      return pruned;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  // Re-render every second for the countdown.
  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // In-app pre-kick-off alerts, checked now and every minute.
  useEffect(() => {
    if (events.length === 0) return;
    void checkReminders(events, notified);
    const t = setInterval(() => void checkReminders(events, notified), 60000);
    return () => clearInterval(t);
  }, [events, notified]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const toggleNotify = async (id: string) => {
    const wasOn = notified.has(id);
    const ev = events.find(e => e.id === id);

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

      if (granted && !pushReady.current) {
        pushReady.current = await registerPush();
      }
      if (pushReady.current && ev) {
        void setReminder(ev, leadFor(id));
      }
      showToast(granted
        ? "🔔 Reminder set — you'll get a push before kick-off"
        : "🔔 Saved — allow notifications for push alerts");
    } else {
      void removeReminder(id);
      showToast("🔕 Reminder removed");
    }

    setNotified(prev => {
      const next = new Set(prev);
      if (wasOn) next.delete(id);
      else next.add(id);
      saveNotified(next);
      return next;
    });
  };

  const changeLead = (ev: SportEvent, minutes: number) => {
    saveLead(ev.id, minutes);
    setLeads(prev => ({ ...prev, [ev.id]: minutes }));
    void setReminder(ev, minutes);
    showToast(`🔔 Push moves to ${minutes >= 1440 ? "1 day" : minutes >= 60 ? `${minutes / 60}h` : `${minutes} min`} before`);
  };

  const handleCalendar = (ev: SportEvent) => {
    if (downloadEventIcs(ev)) showToast("📅 Added — open the file to save it to your calendar");
  };

  const visible  = events.filter(e => filter === "all" || e.sport === filter);
  const past     = visible.filter(e => isPast(e.date) && !isLive(e.date, SPORT[e.sport].liveDuration) && !e.dateTBC);
  const upcoming = visible.filter(e => !isPast(e.date) || isLive(e.date, SPORT[e.sport].liveDuration) || e.dateTBC);
  const nextUp   = upcoming.find(e => e.date && !e.dateTBC);
  const cd       = nextUp ? getCountdown(nextUp.date) : null;
  const bellCount = notified.size;
  const belledEvents = useMemo(
    () => events.filter(e => notified.has(e.id)),
    [events, notified],
  );

  const filters: { key: "all" | SportKey; label: string }[] = [
    { key: "all",   label: "All" },
    { key: "rugby", label: "🏉 Rugby" },
    { key: "mma",   label: "🥊 MMA" },
    { key: "f1",    label: "🏎️ F1" },
  ];

  const chrome = (
    <style>{`
      * { box-sizing: border-box; }
      body { margin: 0; background: ${S.bg}; }
      button:focus-visible { outline: 2px solid #3AA864; outline-offset: 2px; }
      ::-webkit-scrollbar { height: 0; }
      @keyframes sw-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
    `}</style>
  );

  const toastEl = toast && (
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
  );

  if (route.startsWith("#/admin")) {
    return (
      <div style={{ background: S.bg, minHeight: "100vh", fontFamily: S.body }}>
        {chrome}
        {toastEl}
        <Suspense fallback={<div style={{ color: S.muted, padding: 40, textAlign: "center" }}>Opening owner page…</div>}>
          <AdminPage events={events} onChanged={() => void loadEvents()} onToast={showToast} />
        </Suspense>
      </div>
    );
  }

  return (
    <div style={{ background: S.bg, minHeight: "100vh", fontFamily: S.body, maxWidth: 480, margin: "0 auto" }}>
      {chrome}
      {toastEl}

      {/* Reminders popup */}
      {showReminders && (
        <RemindersModal
          events={belledEvents}
          leadFor={leadFor}
          onLeadChange={changeLead}
          onRemove={id => void toggleNotify(id)}
          onClose={() => setShowReminders(false)}
        />
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
            <button
              onClick={() => setShowReminders(true)}
              aria-label={`Show ${bellCount} reminder${bellCount > 1 ? "s" : ""}`}
              style={{
                background: "#061B0E", border: "1px solid #3AA86445",
                borderRadius: 20, padding: "4px 12px", cursor: "pointer",
                fontFamily: S.body, fontSize: 12, color: "#3AA864",
                fontWeight: 600, flexShrink: 0,
              }}>
              🔔 {bellCount}
            </button>
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
        {loading ? (
          <div style={{ color: S.muted, fontSize: 12, textAlign: "center", padding: 40 }}>
            Loading fixtures…
          </div>
        ) : (
          <>
            {/* Hero countdown */}
            <HeroCard event={nextUp} countdown={cd} />

            {/* Upcoming events */}
            {upcoming.length > 0 && (
              <>
                <SectionLabel text="Upcoming" />
                {upcoming.map(e => (
                  <EventCard key={e.id} event={e}
                    notified={notified.has(e.id)}
                    onToggle={id => void toggleNotify(id)}
                    onCalendar={handleCalendar} />
                ))}
              </>
            )}

            {/* Past events */}
            {past.length > 0 && (
              <>
                <SectionLabel text="Played" />
                {[...past].reverse().map(e => (
                  <EventCard key={e.id} event={e}
                    notified={notified.has(e.id)}
                    onToggle={id => void toggleNotify(id)}
                    onCalendar={handleCalendar} />
                ))}
              </>
            )}
          </>
        )}

        {/* Footer */}
        <div style={{
          marginTop: 24, paddingTop: 14, borderTop: `1px solid ${S.border}`,
          fontFamily: S.body, fontSize: 10, color: S.dim, lineHeight: 1.7,
        }}>
          📌 Times in SAST. F1 fixtures & results refresh daily from the
          official calendar; everything else is editable on the{" "}
          <a href="#/admin" style={{ color: S.muted }}>owner page</a>.
          <br />
          📅{" "}
          <a href={CALENDAR_FEED_URL} style={{ color: S.muted }}>
            Subscribe to the calendar feed
          </a>{" "}
          to see every fixture in your own calendar app.
        </div>
      </div>
    </div>
  );
}
