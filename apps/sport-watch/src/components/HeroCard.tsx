import { Tv } from "lucide-react";
import { catOf, flagName, S, type CatMap, type SportEvent } from "../lib/config";
import { fmtDate, fmtTime, getCountdown, isLive } from "../lib/time";

export function HeroCard({ event, cats, countdown }: {
  event: SportEvent | undefined;
  cats: CatMap;
  countdown: ReturnType<typeof getCountdown>;
}) {
  if (!event || !event.date) {
    return (
      <div style={{
        borderRadius: 16, background: S.surface, border: `1px solid ${S.border}`,
        padding: "20px 22px", marginBottom: 16, color: S.sub,
        fontFamily: S.body, fontSize: 13,
      }}>
        No upcoming events on the calendar.
      </div>
    );
  }

  const cat = catOf(cats, event.sport);
  const cd = countdown;
  const live = isLive(event.date, cat.liveMinutes * 60000);

  return (
    <div style={{
      borderRadius: 16,
      background: `linear-gradient(140deg, ${cat.bg} 0%, #090D0A 65%)`,
      border: `1px solid ${cat.color}26`,
      padding: "20px 22px", marginBottom: 16,
      position: "relative", overflow: "hidden",
    }}>
      {/* ambient glow */}
      <div style={{
        position: "absolute", top: -28, right: -28, width: 110, height: 110,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${cat.color}30 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />

      <div style={{
        fontFamily: S.body, fontSize: 10, fontWeight: 700,
        letterSpacing: "0.15em", textTransform: "uppercase",
        color: cat.color, marginBottom: 9,
      }}>
        {cat.icon} {live ? "Live Now" : "Next Up"} · {event.competition}
      </div>

      <div style={{
        fontFamily: S.display, fontSize: 23, fontWeight: 700,
        color: S.text, lineHeight: 1.2, marginBottom: 7,
      }}>
        {flagName(event.homeFlag, event.home)}
        {event.away ? ` vs ${flagName(event.awayFlag, event.away)}` : ""}
      </div>

      <div style={{
        fontFamily: S.body, fontSize: 12.5, fontWeight: 500,
        color: S.sub, marginBottom: 16,
      }}>
        {fmtDate(event.date)} · {fmtTime(event.date)}
        {event.venue && <span style={{ color: S.muted }}> · {event.venue}</span>}
        {event.channel && (
          <span style={{ color: S.muted }}>
            {" · "}<Tv size={11} strokeWidth={2} style={{ verticalAlign: "-1px" }} /> {event.channel}
          </span>
        )}
      </div>

      {live && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 10, height: 10, borderRadius: "50%",
            background: cat.color, animation: "sw-pulse 1.4s ease-in-out infinite",
          }} />
          <span style={{
            fontFamily: S.display, fontSize: 23, fontWeight: 700,
            color: cat.color, letterSpacing: "0.06em",
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
                fontFamily: S.display, fontSize: 31,
                fontWeight: 700, color: S.text, lineHeight: 1,
              }}>
                {String(v).padStart(2, "0")}
              </span>
              <span style={{
                fontFamily: S.body, fontSize: 9.5, color: S.muted,
                letterSpacing: "0.1em", textTransform: "uppercase",
              }}>
                {l}
              </span>
              {i < 3 && (
                <span style={{
                  fontFamily: S.display, fontSize: 22,
                  color: S.dim, margin: "0 3px",
                }}>:</span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
