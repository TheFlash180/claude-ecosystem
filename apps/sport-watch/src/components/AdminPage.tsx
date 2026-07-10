import { useEffect, useState } from "react";
import { S, SPORT, type SportEvent, type SportKey } from "../lib/config";
import { sb } from "../lib/supabase";
import { fmtDate, fmtTime } from "../lib/time";

// Owner page (#/admin): add, edit and remove events without a redeploy.
// Every action is verified inside Postgres against the admin password
// (sport_settings table, security-definer RPCs) — nothing trusted client-side.
//
// Note: F1 rows are refreshed daily from the Jolpica API — date/venue/name
// edits to them will be overwritten; results are only auto-filled when empty.

const PW_KEY = "sport-admin-pw";

interface Draft {
  competition: string;
  home: string;
  away: string;
  homeFlag: string;
  awayFlag: string;
  date: string; // ISO UTC (yyyy-mm-ddThh:mm)
  venue: string;
  result: string;
  note: string;
  channel: string;
  watchUrl: string;
  special: boolean;
}

function toDraft(ev: SportEvent): Draft {
  return {
    competition: ev.competition,
    home: ev.home,
    away: ev.away ?? "",
    homeFlag: ev.homeFlag,
    awayFlag: ev.awayFlag ?? "",
    date: ev.date ? ev.date.toISOString().slice(0, 16) : "",
    venue: ev.venue ?? "",
    result: ev.result ?? "",
    note: ev.note ?? "",
    channel: ev.channel ?? "",
    watchUrl: ev.watchUrl ?? "",
    special: ev.isSpecial ?? false,
  };
}

const inputStyle = {
  background: S.bg, color: S.text, border: `1px solid ${S.border}`,
  borderRadius: 6, fontFamily: S.body, fontSize: 12, padding: "6px 8px",
  width: "100%",
} as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 6 }}>
      <span style={{
        display: "block", fontSize: 9, textTransform: "uppercase",
        letterSpacing: "0.1em", color: S.muted, marginBottom: 2,
      }}>{label}</span>
      {children}
    </label>
  );
}

export default function AdminPage({
  events,
  onChanged,
  onToast,
}: {
  events: SportEvent[];
  onChanged: () => void;
  onToast: (msg: string) => void;
}) {
  const [password, setPassword] = useState(sessionStorage.getItem(PW_KEY) ?? "");
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [addSport, setAddSport] = useState<SportKey>("rugby");
  const [adding, setAdding] = useState(false);

  const unlock = async (pw: string) => {
    const client = sb();
    if (!client) { onToast("No connection — try again."); return; }
    setChecking(true);
    const { data, error } = await client.rpc("sport_admin_check", { p_password: pw });
    setChecking(false);
    if (!error && data === true) {
      sessionStorage.setItem(PW_KEY, pw);
      setUnlocked(true);
    } else {
      onToast("That password isn't right.");
    }
  };

  useEffect(() => {
    const stored = sessionStorage.getItem(PW_KEY);
    if (stored) void unlock(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (id: string | null, sport: SportKey, d: Draft) => {
    const client = sb();
    if (!client) { onToast("No connection."); return; }
    const { data, error } = await client.rpc("sport_admin_upsert_event", {
      p_id: id,
      p_sport: sport,
      p_competition: d.competition,
      p_home: d.home,
      p_away: d.away || null,
      p_home_flag: d.homeFlag,
      p_away_flag: d.awayFlag || null,
      p_date: d.date ? new Date(d.date + (d.date.length === 16 ? ":00Z" : "")).toISOString() : null,
      p_venue: d.venue || null,
      p_result: d.result || null,
      p_note: d.note || null,
      p_channel: d.channel || null,
      p_watch_url: d.watchUrl || null,
      p_special: d.special,
      p_password: password,
    });
    if (error || !data) {
      onToast("Couldn't save — check the fields.");
    } else {
      onToast("Saved.");
      setEditingId(null);
      setDraft(null);
      setAdding(false);
      onChanged();
    }
  };

  const remove = async (ev: SportEvent) => {
    if (!window.confirm(`Remove "${ev.home}${ev.away ? ` vs ${ev.away}` : ""}"? Reminders pointing at it are removed from guests' devices on their next visit.`)) return;
    const client = sb();
    if (!client) { onToast("No connection."); return; }
    const { data, error } = await client.rpc("sport_admin_delete_event", {
      p_id: ev.id,
      p_password: password,
    });
    if (error || data !== true) onToast("Couldn't remove that event.");
    else {
      onToast("Removed.");
      onChanged();
    }
  };

  if (!unlocked) {
    return (
      <div style={{ padding: "60px 24px", maxWidth: 360, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontFamily: S.display, fontSize: 20, fontWeight: 700, color: S.text, marginBottom: 12 }}>
          ⚙️ Owner page
        </div>
        <input
          type="password"
          placeholder="Admin password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !checking) void unlock(password); }}
          style={{ ...inputStyle, marginBottom: 10, textAlign: "center" }}
          autoFocus
        />
        <button
          onClick={() => void unlock(password)}
          disabled={checking || password.length === 0}
          style={{
            ...inputStyle, cursor: "pointer", background: "#141E15",
            border: "1px solid #3AA864", color: "#3AA864", fontWeight: 600,
          }}>
          {checking ? "Checking…" : "Unlock"}
        </button>
        <div style={{ marginTop: 16 }}>
          <a href="#/" style={{ color: S.muted, fontSize: 12 }}>← back to the app</a>
        </div>
      </div>
    );
  }

  const editor = (id: string | null, sport: SportKey, d: Draft) => (
    <div style={{ background: S.bg, border: `1px solid ${S.border}`, borderRadius: 8, padding: 10, marginTop: 8 }}>
      <Field label="Competition"><input style={inputStyle} value={d.competition} onChange={e => setDraft({ ...d, competition: e.target.value })} /></Field>
      <div style={{ display: "flex", gap: 6 }}>
        <Field label="Home / name"><input style={inputStyle} value={d.home} onChange={e => setDraft({ ...d, home: e.target.value })} /></Field>
        <Field label="Flag"><input style={{ ...inputStyle, width: 52 }} value={d.homeFlag} onChange={e => setDraft({ ...d, homeFlag: e.target.value })} /></Field>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <Field label="Away (optional)"><input style={inputStyle} value={d.away} onChange={e => setDraft({ ...d, away: e.target.value })} /></Field>
        <Field label="Flag"><input style={{ ...inputStyle, width: 52 }} value={d.awayFlag} onChange={e => setDraft({ ...d, awayFlag: e.target.value })} /></Field>
      </div>
      <Field label="Date & time (UTC)"><input style={inputStyle} type="datetime-local" value={d.date} onChange={e => setDraft({ ...d, date: e.target.value })} /></Field>
      <Field label="Venue"><input style={inputStyle} value={d.venue} onChange={e => setDraft({ ...d, venue: e.target.value })} /></Field>
      <Field label="Result (e.g. W 32–17 ✓)"><input style={inputStyle} value={d.result} onChange={e => setDraft({ ...d, result: e.target.value })} /></Field>
      <Field label="Note"><input style={inputStyle} value={d.note} onChange={e => setDraft({ ...d, note: e.target.value })} /></Field>
      <div style={{ display: "flex", gap: 6 }}>
        <Field label="TV channel"><input style={inputStyle} value={d.channel} onChange={e => setDraft({ ...d, channel: e.target.value })} /></Field>
        <Field label="Watch URL"><input style={inputStyle} value={d.watchUrl} onChange={e => setDraft({ ...d, watchUrl: e.target.value })} /></Field>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: S.muted, margin: "4px 0 10px" }}>
        <input type="checkbox" checked={d.special} onChange={e => setDraft({ ...d, special: e.target.checked })} />
        Special event (gold accent)
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => { setEditingId(null); setDraft(null); setAdding(false); }}
          style={{ ...inputStyle, cursor: "pointer", width: "auto" }}>Cancel</button>
        <button onClick={() => void save(id, sport, d)}
          style={{ ...inputStyle, cursor: "pointer", width: "auto", border: "1px solid #3AA864", color: "#3AA864", fontWeight: 600 }}>
          Save
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ padding: "20px 14px 48px", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontFamily: S.display, fontSize: 18, fontWeight: 700, color: S.text }}>
          ⚙️ Manage events
        </div>
        <a href="#/" style={{ color: S.muted, fontSize: 12 }}>← app</a>
      </div>
      <div style={{ fontSize: 10.5, color: S.dim, marginBottom: 14 }}>
        F1 rows refresh daily from the official calendar — name/date/venue edits
        to them will be overwritten; results you type in are kept.
      </div>

      {/* add */}
      {adding && draft ? (
        <div style={{ marginBottom: 16 }}>
          <select value={addSport} onChange={e => setAddSport(e.target.value as SportKey)} style={{ ...inputStyle, width: "auto", marginBottom: 4 }}>
            {(Object.keys(SPORT) as SportKey[]).map(k => <option key={k} value={k}>{SPORT[k].icon} {SPORT[k].label}</option>)}
          </select>
          {editor(null, addSport, draft)}
        </div>
      ) : (
        <button
          onClick={() => { setAdding(true); setEditingId(null); setDraft({ competition: "", home: "", away: "", homeFlag: "🇿🇦", awayFlag: "", date: "", venue: "", result: "", note: "", channel: "", watchUrl: "", special: false }); }}
          style={{ ...inputStyle, cursor: "pointer", marginBottom: 16, border: "1px solid #3AA864", color: "#3AA864", fontWeight: 600 }}>
          + Add event
        </button>
      )}

      {/* list */}
      {events.map(ev => (
        <div key={ev.id} style={{ background: S.surface, borderRadius: 8, padding: "9px 10px", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>{SPORT[ev.sport].icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: S.text, fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {ev.home}{ev.away ? ` vs ${ev.away}` : ""}{ev.result ? ` · ${ev.result}` : ""}
              </div>
              <div style={{ color: S.muted, fontSize: 10 }}>
                {ev.date ? `${fmtDate(ev.date)} · ${fmtTime(ev.date)}` : "Date TBC"}
              </div>
            </div>
            <button onClick={() => { setEditingId(ev.id); setAdding(false); setDraft(toDraft(ev)); }}
              style={{ ...inputStyle, cursor: "pointer", width: "auto", padding: "4px 10px" }}>Edit</button>
            <button onClick={() => void remove(ev)}
              style={{ ...inputStyle, cursor: "pointer", width: "auto", padding: "4px 10px", color: "#D44040" }}>✕</button>
          </div>
          {editingId === ev.id && draft && editor(ev.id, ev.sport, draft)}
        </div>
      ))}
    </div>
  );
}
