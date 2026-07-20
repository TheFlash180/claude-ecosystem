import { lazy, Suspense, useCallback, useEffect, useState, CSSProperties } from "react";
import { Bell, Clapperboard, Settings, Tv, type LucideIcon } from "lucide-react";
import { M, type MediaType, type Title } from "./lib/config";
import { fetchTitles, groupTitles } from "./lib/titles";
import { listReminders, registerPush, setReminders } from "./lib/push";
import { HeroCard } from "./components/HeroCard";
import { TitleCard } from "./components/TitleCard";
import { LeadPicker } from "./components/LeadPicker";

const AdminPage = lazy(() => import("./components/AdminPage"));

const EMPTY_LEADS = new Set<number>();

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
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0 12px" }}>
      <span style={{
        fontFamily: M.display, fontSize: 19, letterSpacing: "0.06em",
        color: M.gold,
      }}>
        {text}
      </span>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${M.border}, transparent)` }} />
    </div>
  );
}

export default function App() {
  const route = useHashRoute();
  const [titles, setTitles] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | MediaType>("all");
  const [reminders, setRemindersMap] = useState<Map<string, Set<number>>>(new Map());
  const [picker, setPicker] = useState<Title | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const loadTitles = useCallback(async () => {
    setTitles(await fetchTitles());
    setLoading(false);
  }, []);

  const refreshReminders = useCallback(async () => {
    const map = await listReminders();
    if (map) setRemindersMap(map);
  }, []);

  useEffect(() => {
    void loadTitles();
    void refreshReminders();
  }, [loadTitles, refreshReminders]);

  const openPicker = async (t: Title) => {
    // Ask for permission up front so the save actually lands.
    try {
      if ("Notification" in window && Notification.permission !== "granted") {
        await Notification.requestPermission();
      }
    } catch { /* unsupported */ }
    await registerPush();
    setPicker(t);
  };

  const savePicker = async (t: Title, leads: number[]) => {
    setPicker(null);
    const ok = await setReminders(t, leads);
    if (!ok) {
      showToast("Couldn't save — allow notifications and try again.");
      return;
    }
    await refreshReminders();
    showToast(leads.length === 0
      ? "Reminders removed"
      : `Set — we'll nudge you ${leads.length} time${leads.length > 1 ? "s" : ""} before release`);
  };

  const visible = titles.filter(t => filter === "all" || t.mediaType === filter);
  const groups = groupTitles(visible);
  const comingUp = groups.upcoming.filter(t => t.id !== groups.nextUp?.id);
  const bellCount = reminders.size;

  const chrome = (
    <style>{`
      * { box-sizing: border-box; }
      body { margin: 0; background: ${M.bg}; }
      button:focus-visible { outline: 2px solid ${M.gold}; outline-offset: 2px; }
      ::-webkit-scrollbar { height: 0; }
    `}</style>
  );

  const toastEl = toast && (
    <div style={{
      position: "fixed", top: "calc(14px + env(safe-area-inset-top))", left: "50%",
      transform: "translateX(-50%)", zIndex: 999,
      background: "#231015", border: `1px solid ${M.crimson}`,
      color: M.text, padding: "11px 20px", borderRadius: 24,
      fontSize: 13.5, fontWeight: 500, fontFamily: M.body,
      boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
      whiteSpace: "nowrap", pointerEvents: "none",
    } as CSSProperties}>
      {toast}
    </div>
  );

  if (route.startsWith("#/admin")) {
    return (
      <div style={{ background: M.bg, minHeight: "100vh", fontFamily: M.body }}>
        {chrome}
        {toastEl}
        <Suspense fallback={<div style={{ color: M.sub, padding: 40, textAlign: "center" }}>Opening owner page…</div>}>
          <AdminPage titles={titles} onChanged={() => void loadTitles()} onToast={showToast} />
        </Suspense>
      </div>
    );
  }

  return (
    <div style={{ background: M.bg, minHeight: "100vh", fontFamily: M.body, maxWidth: 520, margin: "0 auto" }}>
      {chrome}
      {toastEl}

      {picker && (
        <LeadPicker
          title={picker}
          current={reminders.get(picker.id) ?? EMPTY_LEADS}
          onSave={(t, leads) => void savePicker(t, leads)}
          onClose={() => setPicker(null)}
        />
      )}

      {/* Header */}
      <div style={{
        padding: "calc(18px + env(safe-area-inset-top)) 16px 12px",
        borderBottom: `1px solid ${M.border}`,
        position: "sticky", top: 0, zIndex: 10,
        background: `${M.bg}F0`,
        backdropFilter: "blur(9px)",
        WebkitBackdropFilter: "blur(9px)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{
              fontFamily: M.display, fontSize: 27, lineHeight: 1,
              letterSpacing: "0.04em",
              background: `linear-gradient(100deg, ${M.crimson} 0%, ${M.gold} 120%)`,
              WebkitBackgroundClip: "text", backgroundClip: "text",
              color: "transparent",
            }}>
              MARVEL WATCH
            </div>
            <div style={{ fontSize: 11.5, color: M.muted, marginTop: 3 }}>
              Movies · Series · every upcoming release
            </div>
          </div>

          <div style={{ display: "flex", gap: 7, alignItems: "center", flexShrink: 0 }}>
            {bellCount > 0 && (
              <span
                aria-label={`${bellCount} titles with reminders`}
                style={{
                  background: `${M.gold}18`, border: `1px solid ${M.gold}55`,
                  borderRadius: 20, padding: "7px 13px",
                  fontFamily: M.body, fontSize: 13, color: M.gold, fontWeight: 700,
                  display: "inline-flex", alignItems: "center", gap: 5,
                }}>
                <Bell size={14} strokeWidth={2.2} /> {bellCount}
              </span>
            )}
            <button
              onClick={() => { window.location.hash = "#/admin"; }}
              aria-label="Owner page"
              title="Owner page"
              style={{
                background: "transparent", border: `1px solid ${M.border}`,
                borderRadius: 20, padding: "7px 11px", cursor: "pointer",
                lineHeight: 1, color: M.muted,
                display: "inline-flex", alignItems: "center",
              }}>
              <Settings size={15} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Filter pills */}
        <div style={{ display: "flex", gap: 7, marginTop: 12 }}>
          {([
            { key: "all" as const, label: "All", Icon: null as LucideIcon | null },
            { key: "movie" as const, label: "Movies", Icon: Clapperboard as LucideIcon | null },
            { key: "show" as const, label: "Series", Icon: Tv as LucideIcon | null },
          ]).map(f => {
            const on = filter === f.key;
            return (
              <button key={f.key} onClick={() => setFilter(f.key)} style={{
                padding: "8px 16px", borderRadius: 20, cursor: "pointer",
                fontFamily: M.body, fontSize: 13, fontWeight: 600,
                border: `1px solid ${on ? M.crimson : M.border}`,
                background: on ? `${M.crimson}1A` : "transparent",
                color: on ? M.crimson : M.sub,
                transition: "all 0.1s",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}>
                {f.Icon && <f.Icon size={14} strokeWidth={2.2} />}{f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "16px 14px 48px" }}>
        {loading ? (
          <div style={{ color: M.sub, fontSize: 13, textAlign: "center", padding: 40 }}>
            Assembling…
          </div>
        ) : (
          <>
            <HeroCard
              title={groups.nextUp}
              belled={(groups.nextUp && (reminders.get(groups.nextUp.id)?.size ?? 0) > 0) || false}
              onBell={t => void openPicker(t)}
            />

            {comingUp.length > 0 && (
              <>
                <SectionLabel text="COMING UP" />
                {comingUp.map(t => (
                  <TitleCard key={t.id} title={t}
                    leads={reminders.get(t.id) ?? EMPTY_LEADS}
                    onBell={tt => void openPicker(tt)} />
                ))}
              </>
            )}

            {groups.horizon.length > 0 && (
              <>
                <SectionLabel text="ON THE HORIZON" />
                {groups.horizon.map(t => (
                  <TitleCard key={t.id} title={t}
                    leads={reminders.get(t.id) ?? EMPTY_LEADS}
                    onBell={tt => void openPicker(tt)} />
                ))}
              </>
            )}

            {groups.outNow.length > 0 && (
              <>
                <SectionLabel text="OUT NOW" />
                {groups.outNow.map(t => (
                  <TitleCard key={t.id} title={t}
                    leads={reminders.get(t.id) ?? EMPTY_LEADS}
                    onBell={tt => void openPicker(tt)} />
                ))}
              </>
            )}
          </>
        )}

        {/* Footer */}
        <div style={{
          marginTop: 26, paddingTop: 14, borderTop: `1px solid ${M.border}`,
          fontFamily: M.body, fontSize: 11, color: M.muted, lineHeight: 1.8,
        }}>
          Releases refresh daily from TMDB; anything missing can be added on
          the <a href="#/admin" style={{ color: M.sub }}>owner page</a>.
          Newly announced titles push to your phone automatically.
          <br />
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </div>
      </div>
    </div>
  );
}
