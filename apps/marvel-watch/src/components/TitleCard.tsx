import { LEAD_DAYS, M, UNIVERSE_LABEL, type Title } from "../lib/config";
import { daysUntil, fmtRelease, releaseLabel } from "../lib/titles";

function Poster({ t, width = 92 }: { t: Title; width?: number }) {
  const height = Math.round(width * 1.5);
  if (t.posterUrl) {
    return (
      <img
        src={t.posterUrl}
        alt={`${t.title} poster`}
        loading="lazy"
        style={{
          width, height, objectFit: "cover", borderRadius: 10,
          flexShrink: 0, background: M.raised,
        }}
      />
    );
  }
  return (
    <div style={{
      width, height, borderRadius: 10, flexShrink: 0,
      background: `linear-gradient(160deg, ${M.crimsonDark} 0%, #1A0808 90%)`,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 6,
    }}>
      <span style={{ fontSize: 26 }}>{t.mediaType === "movie" ? "🎬" : "📺"}</span>
      <span style={{
        fontFamily: M.display, fontSize: 15, color: M.gold,
        letterSpacing: "0.06em",
      }}>
        {t.title.slice(0, 1)}
      </span>
    </div>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      border: `1px solid ${color}55`, color, background: `${color}14`,
      padding: "2px 8px", borderRadius: 9, fontSize: 9.5, fontWeight: 700,
      letterSpacing: "0.08em", textTransform: "uppercase", flexShrink: 0,
    }}>
      {text}
    </span>
  );
}

export function TitleCard({ title: t, leads, onBell }: {
  title: Title;
  /** Lead days set on this device for this title (empty = no reminders). */
  leads: Set<number>;
  onBell: (t: Title) => void;
}) {
  const released = t.releaseDate !== null && daysUntil(t.releaseDate) < 0;
  const belled = leads.size > 0;
  const soon = t.releaseDate !== null && !released && daysUntil(t.releaseDate) <= 31;

  return (
    <div style={{
      display: "flex", gap: 13, alignItems: "stretch",
      background: M.surface, borderRadius: 14, padding: 11,
      marginBottom: 10,
      border: `1px solid ${t.isSpecial && !released ? `${M.gold}45` : M.border}`,
    }}>
      <Poster t={t} />

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
          <Badge text={t.mediaType === "movie" ? "🎬 Movie" : "📺 Series"} color={M.sub} />
          <Badge text={UNIVERSE_LABEL[t.universe]} color={t.universe === "sony" ? M.blue : M.crimson} />
          {t.isSpecial && !released && <Badge text="★ Event" color={M.gold} />}
        </div>

        <div style={{
          fontFamily: M.display, fontSize: 21, lineHeight: 1.05,
          color: M.text, letterSpacing: "0.02em", marginBottom: 3,
        }}>
          {t.title}
        </div>

        <div style={{ fontFamily: M.body, fontSize: 12.5, fontWeight: 600, color: released ? M.muted : soon ? M.gold : M.sub }}>
          {t.releaseDate ? (
            <>
              {releaseLabel(t.releaseDate)}
              <span style={{ color: M.muted, fontWeight: 500 }}> · {fmtRelease(t.releaseDate)}</span>
            </>
          ) : "Date to be announced"}
          {t.watchOn && <span style={{ color: M.muted, fontWeight: 500 }}> · {t.watchOn}</span>}
        </div>

        {t.overview && (
          <div style={{
            fontFamily: M.body, fontSize: 11.5, color: M.muted, lineHeight: 1.45,
            marginTop: 4,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}>
            {t.overview}
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Bell — shows which leads are active */}
        {!released && (
          <button
            onClick={() => onBell(t)}
            disabled={!t.releaseDate}
            aria-label={belled ? `Edit reminders for ${t.title}` : `Remind me about ${t.title}`}
            style={{
              alignSelf: "flex-start", marginTop: 6,
              display: "flex", alignItems: "center", gap: 6,
              border: `1px solid ${belled ? M.gold : M.border}`,
              background: belled ? `${M.gold}18` : "transparent",
              color: belled ? M.gold : t.releaseDate ? M.sub : M.muted,
              borderRadius: 18, padding: "7px 13px", cursor: t.releaseDate ? "pointer" : "default",
              fontFamily: M.body, fontSize: 12, fontWeight: 600,
              opacity: t.releaseDate ? 1 : 0.55,
            }}>
            {belled
              ? `🔔 ${LEAD_DAYS.filter(l => leads.has(l.days)).map(l => l.days === 7 ? "1w" : `${l.days}d`).join(" · ")}`
              : t.releaseDate ? "🔔 Remind me" : "🔕 Awaiting date"}
          </button>
        )}
      </div>
    </div>
  );
}
