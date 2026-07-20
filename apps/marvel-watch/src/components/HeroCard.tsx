import { Bell } from "lucide-react";
import { M, UNIVERSE_LABEL, type Title } from "../lib/config";
import { daysUntil, fmtRelease } from "../lib/titles";

// The next dated release, poster-forward with a big day countdown.
export function HeroCard({ title: t, onBell, belled }: {
  title: Title | null;
  belled: boolean;
  onBell: (t: Title) => void;
}) {
  if (!t || !t.releaseDate) {
    return (
      <div style={{
        borderRadius: 18, background: M.surface, border: `1px solid ${M.border}`,
        padding: "22px", marginBottom: 18, color: M.sub,
        fontFamily: M.body, fontSize: 13.5,
      }}>
        No dated releases on the calendar — check the horizon section below.
      </div>
    );
  }

  const d = daysUntil(t.releaseDate);
  const bgImage = t.backdropUrl ?? t.posterUrl;

  return (
    <div style={{
      borderRadius: 18, overflow: "hidden", position: "relative",
      marginBottom: 18, border: `1px solid ${t.isSpecial ? `${M.gold}50` : M.border}`,
      background: M.surface, minHeight: 210,
    }}>
      {bgImage && (
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `url(${bgImage})`,
          backgroundSize: "cover", backgroundPosition: "center 25%",
          opacity: 0.5,
        }} />
      )}
      <div style={{
        position: "absolute", inset: 0,
        background: `linear-gradient(180deg, rgba(10,9,16,0.15) 0%, rgba(10,9,16,0.86) 68%, ${M.bg} 100%)`,
      }} />

      <div style={{ position: "relative", padding: "70px 18px 16px" }}>
        <div style={{
          fontFamily: M.body, fontSize: 10.5, fontWeight: 700,
          letterSpacing: "0.16em", textTransform: "uppercase",
          color: M.gold, marginBottom: 6,
        }}>
          {d === 0 ? "Releasing today" : "Next release"} · {t.mediaType === "movie" ? "In cinemas" : "On Disney+"} · {UNIVERSE_LABEL[t.universe]}
        </div>

        <div style={{
          fontFamily: M.display, fontSize: 34, lineHeight: 1,
          color: M.text, letterSpacing: "0.02em", marginBottom: 8,
          textShadow: "0 2px 12px rgba(0,0,0,0.7)",
        }}>
          {t.title}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
            <span style={{
              fontFamily: M.display, fontSize: 46, lineHeight: 1,
              color: M.crimson, textShadow: "0 2px 14px rgba(226,54,54,0.45)",
            }}>
              {d}
            </span>
            <span style={{
              fontFamily: M.body, fontSize: 11, fontWeight: 700,
              letterSpacing: "0.14em", textTransform: "uppercase", color: M.sub,
            }}>
              day{d === 1 ? "" : "s"} to go
            </span>
          </div>

          <div style={{ fontFamily: M.body, fontSize: 12.5, fontWeight: 600, color: M.sub }}>
            {fmtRelease(t.releaseDate)}
          </div>

          <div style={{ flex: 1 }} />

          <button
            onClick={() => onBell(t)}
            aria-label={belled ? `Edit reminders for ${t.title}` : `Remind me about ${t.title}`}
            style={{
              border: `1px solid ${belled ? M.gold : "rgba(244,241,234,0.4)"}`,
              background: belled ? `${M.gold}22` : "rgba(10,9,16,0.55)",
              color: belled ? M.gold : M.text,
              borderRadius: 20, padding: "9px 16px", cursor: "pointer",
              fontFamily: M.body, fontSize: 12.5, fontWeight: 700,
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
            <Bell size={14} strokeWidth={2.2} /> {belled ? "Reminders on" : "Remind me"}
          </button>
        </div>
      </div>
    </div>
  );
}
