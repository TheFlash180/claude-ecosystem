import { S, SPORT, type SportEvent } from "../lib/config";
import { fmtDate, fmtTime, getCountdown, isLive } from "../lib/time";

export function HeroCard({ event, countdown }: {
  event: SportEvent | undefined;
  countdown: ReturnType<typeof getCountdown>;
}) {
  if (!event || !event.date) {
    return (
      <div style={{
        borderRadius: 14, background: S.surface, border: `1px solid ${S.border}`,
        padding: "18px 20px", marginBottom: 14, color: S.muted,
        fontFamily: S.body, fontSize: 12,
      }}>
        No upcoming events on the calendar.
      </div>
    );
  }

  const sp = SPORT[event.sport];
  const cd = countdown;
  const live = isLive(event.date, sp.liveDuration);

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
        {event.channel && <> · 📺 {event.channel}</>}
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
