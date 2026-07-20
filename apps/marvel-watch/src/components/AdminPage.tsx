import { useEffect, useState } from "react";
import { Clapperboard, Settings, Tv, X } from "lucide-react";
import { M, type MediaType, type Title, type Universe } from "../lib/config";
import { sb } from "../lib/supabase";
import { fmtRelease } from "../lib/titles";

// Owner page (#/admin): add, edit and remove titles when TMDB doesn't have
// them (or before it does). Password verified in Postgres via definer RPCs.
// Rows saved here become manual=true — the nightly TMDB sync never
// overwrites them.

const PW_KEY = "marvel-admin-pw";

interface Draft {
  mediaType: MediaType;
  title: string;
  date: string; // yyyy-mm-dd or ''
  tbc: boolean;
  universe: Universe;
  overview: string;
  posterUrl: string;
  watchOn: string;
  special: boolean;
}

function toDraft(t: Title): Draft {
  return {
    mediaType: t.mediaType,
    title: t.title,
    date: t.releaseDate ?? "",
    tbc: t.dateTbc && !t.releaseDate,
    universe: t.universe,
    overview: t.overview ?? "",
    posterUrl: t.posterUrl ?? "",
    watchOn: t.watchOn ?? "",
    special: t.isSpecial,
  };
}

const inputStyle = {
  background: M.bg, color: M.text, border: `1px solid ${M.border}`,
  borderRadius: 9, fontFamily: M.body, fontSize: 13, padding: "9px 11px",
  width: "100%",
} as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 8 }}>
      <span style={{
        display: "block", fontSize: 9.5, textTransform: "uppercase",
        letterSpacing: "0.1em", color: M.muted, marginBottom: 3,
      }}>{label}</span>
      {children}
    </label>
  );
}

export default function AdminPage({ titles, onChanged, onToast }: {
  titles: Title[];
  onChanged: () => void;
  onToast: (msg: string) => void;
}) {
  const [password, setPassword] = useState(sessionStorage.getItem(PW_KEY) ?? "");
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [adding, setAdding] = useState(false);

  const unlock = async (pw: string) => {
    const client = sb();
    if (!client) { onToast("No connection — try again."); return; }
    setChecking(true);
    const { data, error } = await client.rpc("marvel_admin_check", { p_password: pw });
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

  const save = async (id: string | null, d: Draft) => {
    const client = sb();
    if (!client) { onToast("No connection."); return; }
    const { data, error } = await client.rpc("marvel_admin_upsert_title", {
      p_id: id,
      p_media_type: d.mediaType,
      p_title: d.title,
      p_date: d.date || null,
      p_tbc: d.tbc || !d.date,
      p_universe: d.universe,
      p_overview: d.overview || null,
      p_poster_url: d.posterUrl || null,
      p_watch_on: d.watchOn || null,
      p_special: d.special,
      p_password: password,
    });
    if (error || !data) onToast("Couldn't save — check the fields.");
    else {
      onToast("Saved.");
      setEditingId(null);
      setDraft(null);
      setAdding(false);
      onChanged();
    }
  };

  const remove = async (t: Title) => {
    if (!window.confirm(`Remove "${t.title}"? Reminders on it disappear too.`)) return;
    const client = sb();
    if (!client) { onToast("No connection."); return; }
    const { data, error } = await client.rpc("marvel_admin_delete_title", {
      p_id: t.id,
      p_password: password,
    });
    if (error || data !== true) onToast("Couldn't remove that title.");
    else {
      onToast("Removed.");
      onChanged();
    }
  };

  if (!unlocked) {
    return (
      <div style={{ padding: "60px 24px", maxWidth: 360, margin: "0 auto", textAlign: "center" }}>
        <div style={{
          fontFamily: M.display, fontSize: 26, color: M.text, marginBottom: 12,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <Settings size={22} strokeWidth={2} /> Owner page
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
            ...inputStyle, cursor: "pointer",
            background: `linear-gradient(135deg, ${M.crimson}, ${M.crimsonDark})`,
            border: "none", color: "#fff", fontWeight: 700,
          }}>
          {checking ? "Checking…" : "Unlock"}
        </button>
        <div style={{ marginTop: 16 }}>
          <a href="#/" style={{ color: M.sub, fontSize: 12.5 }}>← back to the app</a>
        </div>
      </div>
    );
  }

  const editor = (id: string | null, d: Draft) => (
    <div style={{ background: M.bg, border: `1px solid ${M.border}`, borderRadius: 12, padding: 13, marginTop: 8 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <Field label="Type">
          <select style={inputStyle} value={d.mediaType} onChange={e => setDraft({ ...d, mediaType: e.target.value as MediaType })}>
            <option value="movie">Movie</option>
            <option value="show">Series</option>
          </select>
        </Field>
        <Field label="Universe">
          <select style={inputStyle} value={d.universe} onChange={e => setDraft({ ...d, universe: e.target.value as Universe })}>
            <option value="mcu">MCU</option>
            <option value="sony">Sony</option>
            <option value="other">Other Marvel</option>
          </select>
        </Field>
      </div>
      <Field label="Title"><input style={inputStyle} value={d.title} onChange={e => setDraft({ ...d, title: e.target.value })} /></Field>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <Field label="Release date"><input style={inputStyle} type="date" value={d.date} onChange={e => setDraft({ ...d, date: e.target.value, tbc: e.target.value ? false : d.tbc })} /></Field>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: M.sub, paddingBottom: 14, whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={d.tbc} onChange={e => setDraft({ ...d, tbc: e.target.checked, date: e.target.checked ? "" : d.date })} />
          Date TBA
        </label>
      </div>
      <Field label="Where to watch (Cinemas / Disney+)"><input style={inputStyle} value={d.watchOn} onChange={e => setDraft({ ...d, watchOn: e.target.value })} /></Field>
      <Field label="Poster URL (optional)"><input style={inputStyle} value={d.posterUrl} onChange={e => setDraft({ ...d, posterUrl: e.target.value })} /></Field>
      <Field label="Overview">
        <textarea style={{ ...inputStyle, minHeight: 64, resize: "vertical" }} value={d.overview} onChange={e => setDraft({ ...d, overview: e.target.value })} />
      </Field>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: M.sub, margin: "2px 0 12px" }}>
        <input type="checkbox" checked={d.special} onChange={e => setDraft({ ...d, special: e.target.checked })} />
        ★ Event title (gold accent — Avengers-level)
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => { setEditingId(null); setDraft(null); setAdding(false); }}
          style={{ ...inputStyle, cursor: "pointer", width: "auto" }}>Cancel</button>
        <button onClick={() => void save(id, d)}
          style={{ ...inputStyle, cursor: "pointer", width: "auto", border: `1px solid ${M.gold}`, color: M.gold, fontWeight: 700 }}>
          Save
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ padding: "20px 14px 48px", maxWidth: 520, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{
          fontFamily: M.display, fontSize: 24, color: M.text,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <Settings size={20} strokeWidth={2} /> Manage titles
        </div>
        <a href="#/" style={{ color: M.sub, fontSize: 12.5 }}>← app</a>
      </div>
      <div style={{ fontSize: 11, color: M.muted, marginBottom: 14, lineHeight: 1.6 }}>
        Titles you add or edit here are yours — the nightly TMDB sync never
        overwrites them. Everything else refreshes automatically.
      </div>

      {adding && draft ? (
        <div style={{ marginBottom: 16 }}>{editor(null, draft)}</div>
      ) : (
        <button
          onClick={() => { setAdding(true); setEditingId(null); setDraft({ mediaType: "movie", title: "", date: "", tbc: false, universe: "mcu", overview: "", posterUrl: "", watchOn: "", special: false }); }}
          style={{ ...inputStyle, cursor: "pointer", marginBottom: 16, border: `1px solid ${M.gold}`, color: M.gold, fontWeight: 700 }}>
          + Add title
        </button>
      )}

      {titles.map(t => (
        <div key={t.id} style={{ background: M.surface, borderRadius: 12, padding: "10px 12px", marginBottom: 7 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            {t.mediaType === "movie"
              ? <Clapperboard size={16} strokeWidth={2} color={M.sub} style={{ flexShrink: 0 }} />
              : <Tv size={16} strokeWidth={2} color={M.sub} style={{ flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: M.text, fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.title}{t.manual && <span style={{ color: M.gold, fontSize: 10 }}> · manual</span>}
              </div>
              <div style={{ color: M.sub, fontSize: 11.5 }}>
                {t.releaseDate ? fmtRelease(t.releaseDate) : "Date TBA"}
              </div>
            </div>
            <button onClick={() => { setEditingId(t.id); setAdding(false); setDraft(toDraft(t)); }}
              style={{ ...inputStyle, cursor: "pointer", width: "auto", padding: "6px 12px" }}>Edit</button>
            <button onClick={() => void remove(t)} aria-label={`Remove ${t.title}`}
              style={{ ...inputStyle, cursor: "pointer", width: "auto", padding: "6px 10px", color: M.crimson, display: "flex", alignItems: "center" }}>
              <X size={15} />
            </button>
          </div>
          {editingId === t.id && draft && editor(t.id, draft)}
        </div>
      ))}
    </div>
  );
}
