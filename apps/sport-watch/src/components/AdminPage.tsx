import { useEffect, useState } from "react";
import { Settings, X } from "lucide-react";
import { catOf, S, type Category, type CatMap, type SportEvent, type SportKey } from "../lib/config";
import { sb } from "../lib/supabase";
import { fmtDate, fmtTime } from "../lib/time";

// Owner page (#/admin): add, edit and remove events AND sport categories
// without a redeploy. Every action is verified inside Postgres against the
// admin password (sport_settings table, security-definer RPCs).
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

interface CatDraft {
  key: string;
  label: string;
  icon: string;
  color: string;
  bg: string;
  liveHours: string;
}

const inputStyle = {
  background: S.bg, color: S.text, border: `1px solid ${S.border}`,
  borderRadius: 8, fontFamily: S.body, fontSize: 13, padding: "8px 10px",
  width: "100%",
} as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 7 }}>
      <span style={{
        display: "block", fontSize: 9.5, textTransform: "uppercase",
        letterSpacing: "0.1em", color: S.muted, marginBottom: 3,
      }}>{label}</span>
      {children}
    </label>
  );
}

export default function AdminPage({
  events,
  categories,
  cats,
  onChanged,
  onToast,
}: {
  events: SportEvent[];
  categories: Category[];
  cats: CatMap;
  onChanged: () => void;
  onToast: (msg: string) => void;
}) {
  const [password, setPassword] = useState(sessionStorage.getItem(PW_KEY) ?? "");
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [addSport, setAddSport] = useState<SportKey>(categories[0]?.key ?? "rugby");
  const [adding, setAdding] = useState(false);
  const [showCats, setShowCats] = useState(false);
  const [catDraft, setCatDraft] = useState<CatDraft | null>(null);
  const [catIsNew, setCatIsNew] = useState(false);

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
    if (!window.confirm(`Remove "${ev.home}${ev.away ? ` vs ${ev.away}` : ""}"? Its result disappears from history too.`)) return;
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

  const saveCategory = async (d: CatDraft) => {
    const client = sb();
    if (!client) { onToast("No connection."); return; }
    const { data, error } = await client.rpc("sport_admin_upsert_category", {
      p_key: d.key,
      p_label: d.label,
      p_icon: d.icon || "🏅",
      p_color: d.color,
      p_bg: d.bg,
      p_live_minutes: Math.round((Number(d.liveHours) || 2) * 60),
      p_sort: categories.find(c => c.key === d.key)?.sortOrder ?? categories.length + 1,
      p_password: password,
    });
    if (error || data !== true) onToast("Couldn't save the category.");
    else {
      onToast("Category saved.");
      setCatDraft(null);
      setCatIsNew(false);
      onChanged();
    }
  };

  const removeCategory = async (c: Category) => {
    if (!window.confirm(`Remove the "${c.label}" category? This only works when no events use it.`)) return;
    const client = sb();
    if (!client) { onToast("No connection."); return; }
    const { data, error } = await client.rpc("sport_admin_delete_category", {
      p_key: c.key,
      p_password: password,
    });
    if (error || data !== true) onToast("Couldn't remove — move or delete its events first.");
    else {
      onToast("Category removed.");
      onChanged();
    }
  };

  if (!unlocked) {
    return (
      <div style={{ padding: "60px 24px", maxWidth: 360, margin: "0 auto", textAlign: "center" }}>
        <div style={{
          fontFamily: S.display, fontSize: 20, fontWeight: 700, color: S.text, marginBottom: 12,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <Settings size={18} strokeWidth={2} /> Owner page
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
          <a href="#/" style={{ color: S.sub, fontSize: 12.5 }}>← back to the app</a>
        </div>
      </div>
    );
  }

  const editor = (id: string | null, sport: SportKey, d: Draft) => (
    <div style={{ background: S.bg, border: `1px solid ${S.border}`, borderRadius: 10, padding: 12, marginTop: 8 }}>
      <Field label="Competition"><input style={inputStyle} value={d.competition} onChange={e => setDraft({ ...d, competition: e.target.value })} /></Field>
      <div style={{ display: "flex", gap: 6 }}>
        <Field label="Home / name"><input style={inputStyle} value={d.home} onChange={e => setDraft({ ...d, home: e.target.value })} /></Field>
        <Field label="Flag (optional)"><input style={{ ...inputStyle, width: 64 }} placeholder="🇿🇦" value={d.homeFlag} onChange={e => setDraft({ ...d, homeFlag: e.target.value })} /></Field>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <Field label="Away (optional)"><input style={inputStyle} value={d.away} onChange={e => setDraft({ ...d, away: e.target.value })} /></Field>
        <Field label="Flag (optional)"><input style={{ ...inputStyle, width: 64 }} placeholder="🇳🇿" value={d.awayFlag} onChange={e => setDraft({ ...d, awayFlag: e.target.value })} /></Field>
      </div>
      <Field label="Date & time (UTC)"><input style={inputStyle} type="datetime-local" value={d.date} onChange={e => setDraft({ ...d, date: e.target.value })} /></Field>
      <Field label="Venue"><input style={inputStyle} value={d.venue} onChange={e => setDraft({ ...d, venue: e.target.value })} /></Field>
      <Field label="Result (e.g. W 32–17 ✓)"><input style={inputStyle} value={d.result} onChange={e => setDraft({ ...d, result: e.target.value })} /></Field>
      <Field label="Note"><input style={inputStyle} value={d.note} onChange={e => setDraft({ ...d, note: e.target.value })} /></Field>
      <div style={{ display: "flex", gap: 6 }}>
        <Field label="TV channel"><input style={inputStyle} value={d.channel} onChange={e => setDraft({ ...d, channel: e.target.value })} /></Field>
        <Field label="Watch URL"><input style={inputStyle} value={d.watchUrl} onChange={e => setDraft({ ...d, watchUrl: e.target.value })} /></Field>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: S.sub, margin: "4px 0 10px" }}>
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
        <div style={{
          fontFamily: S.display, fontSize: 18, fontWeight: 700, color: S.text,
          display: "flex", alignItems: "center", gap: 7,
        }}>
          <Settings size={16} strokeWidth={2} /> Manage events
        </div>
        <a href="#/" style={{ color: S.sub, fontSize: 12.5 }}>← app</a>
      </div>
      <div style={{ fontSize: 11, color: S.muted, marginBottom: 14 }}>
        F1 rows refresh daily from the official calendar — name/date/venue edits
        to them will be overwritten; results you type in are kept.
      </div>

      {/* categories manager */}
      <button
        onClick={() => setShowCats(v => !v)}
        style={{ ...inputStyle, cursor: "pointer", marginBottom: 10, textAlign: "left", color: S.sub }}>
        {showCats ? "▾" : "▸"} Sport categories ({categories.length})
      </button>
      {showCats && (
        <div style={{ background: S.surface, borderRadius: 10, padding: 10, marginBottom: 14 }}>
          {categories.map(c => (
            <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: `1px solid ${S.border}` }}>
              <span style={{ fontSize: 16 }}>{c.icon}</span>
              <span style={{ flex: 1, color: S.text, fontSize: 13 }}>
                {c.label} <span style={{ color: S.muted, fontSize: 11 }}>· live {c.liveMinutes / 60}h · <span style={{ color: c.color }}>■</span></span>
              </span>
              <button onClick={() => { setCatIsNew(false); setCatDraft({ key: c.key, label: c.label, icon: c.icon, color: c.color, bg: c.bg, liveHours: String(c.liveMinutes / 60) }); }}
                style={{ ...inputStyle, cursor: "pointer", width: "auto", padding: "5px 10px" }}>Edit</button>
              <button onClick={() => void removeCategory(c)} aria-label={`Remove ${c.label}`}
                style={{ ...inputStyle, cursor: "pointer", width: "auto", padding: "5px 8px", color: "#D44040", display: "flex", alignItems: "center" }}>
                <X size={14} />
              </button>
            </div>
          ))}
          {catDraft ? (
            <div style={{ background: S.bg, border: `1px solid ${S.border}`, borderRadius: 10, padding: 12, marginTop: 10 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <Field label="Key (short, no spaces)">
                  <input style={inputStyle} value={catDraft.key} disabled={!catIsNew}
                    onChange={e => setCatDraft({ ...catDraft, key: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} />
                </Field>
                <Field label="Label"><input style={inputStyle} value={catDraft.label} onChange={e => setCatDraft({ ...catDraft, label: e.target.value })} /></Field>
                <Field label="Icon"><input style={{ ...inputStyle, width: 56 }} value={catDraft.icon} onChange={e => setCatDraft({ ...catDraft, icon: e.target.value })} /></Field>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Field label="Accent colour"><input style={{ ...inputStyle, padding: 4, height: 38 }} type="color" value={catDraft.color} onChange={e => setCatDraft({ ...catDraft, color: e.target.value })} /></Field>
                <Field label="Card tint"><input style={{ ...inputStyle, padding: 4, height: 38 }} type="color" value={catDraft.bg} onChange={e => setCatDraft({ ...catDraft, bg: e.target.value })} /></Field>
                <Field label="Live window (hours)"><input style={inputStyle} type="number" min={0.5} step={0.5} value={catDraft.liveHours} onChange={e => setCatDraft({ ...catDraft, liveHours: e.target.value })} /></Field>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button onClick={() => { setCatDraft(null); setCatIsNew(false); }} style={{ ...inputStyle, cursor: "pointer", width: "auto" }}>Cancel</button>
                <button onClick={() => void saveCategory(catDraft)}
                  style={{ ...inputStyle, cursor: "pointer", width: "auto", border: "1px solid #3AA864", color: "#3AA864", fontWeight: 600 }}>Save</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setCatIsNew(true); setCatDraft({ key: "", label: "", icon: "🏅", color: "#3AA864", bg: "#0B130B", liveHours: "2" }); }}
              style={{ ...inputStyle, cursor: "pointer", marginTop: 10, border: "1px solid #3AA864", color: "#3AA864", fontWeight: 600 }}>
              + Add category
            </button>
          )}
        </div>
      )}

      {/* add event */}
      {adding && draft ? (
        <div style={{ marginBottom: 16 }}>
          <select value={addSport} onChange={e => setAddSport(e.target.value)} style={{ ...inputStyle, width: "auto", marginBottom: 4 }}>
            {categories.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
          </select>
          {editor(null, addSport, draft)}
        </div>
      ) : (
        <button
          onClick={() => { setAdding(true); setEditingId(null); setDraft({ competition: "", home: "", away: "", homeFlag: "", awayFlag: "", date: "", venue: "", result: "", note: "", channel: "", watchUrl: "", special: false }); }}
          style={{ ...inputStyle, cursor: "pointer", marginBottom: 16, border: "1px solid #3AA864", color: "#3AA864", fontWeight: 600 }}>
          + Add event
        </button>
      )}

      {/* event list */}
      {events.map(ev => (
        <div key={ev.id} style={{ background: S.surface, borderRadius: 10, padding: "10px 11px", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>{catOf(cats, ev.sport).icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: S.text, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {ev.home}{ev.away ? ` vs ${ev.away}` : ""}{ev.result ? ` · ${ev.result}` : ""}
              </div>
              <div style={{ color: S.sub, fontSize: 11 }}>
                {ev.date ? `${fmtDate(ev.date)} · ${fmtTime(ev.date)}` : "Date TBC"}
              </div>
            </div>
            <button onClick={() => { setEditingId(ev.id); setAdding(false); setDraft(toDraft(ev)); }}
              style={{ ...inputStyle, cursor: "pointer", width: "auto", padding: "6px 12px" }}>Edit</button>
            <button onClick={() => void remove(ev)} aria-label={`Remove ${ev.home}`}
              style={{ ...inputStyle, cursor: "pointer", width: "auto", padding: "6px 10px", color: "#D44040", display: "flex", alignItems: "center" }}>
              <X size={15} />
            </button>
          </div>
          {editingId === ev.id && draft && editor(ev.id, ev.sport, draft)}
        </div>
      ))}
    </div>
  );
}
