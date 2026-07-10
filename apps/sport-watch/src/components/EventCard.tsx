import { S, SPORT, type SportEvent } from "../lib/config";
import { fmtDate, fmtTime, isPast, isLive } from "../lib/time";
import { downloadEventIcs } from "../lib/ics";

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

export function EventCard({ event, notified, onToggle, onCalendar }: {
  event: SportEvent;
  notified: boolean;
  onToggle: (id: string) => void;
  onCalendar?: (ev: SportEvent) => void;
}) {
  const sp = SPORT[event.sport];
  const past = isPast(event.date) && !isLive(event.date, sp.liveDuration);
  const live = isLive(event.date, sp.liveDuration);

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

        {/* Date / venue / channel */}
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

        {/* Where to watch */}
        {!past && event.channel && (
          <div style={{
            fontFamily: S.body, fontSize: 9.5, color: "#5A625A", marginTop: 2,
          }}>
            📺 {event.watchUrl ? (
              <a href={event.watchUrl} target="_blank" rel="noopener noreferrer"
                 style={{ color: "#6A726A" }}>
                {event.channel}
              </a>
            ) : event.channel}
          </div>
        )}

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

      {/* Calendar + bell buttons */}
      {!past && (
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {event.date && (
            <button
              onClick={() => (onCalendar ? onCalendar(event) : downloadEventIcs(event))}
              title="Add to calendar"
              aria-label={`Add ${event.home} to calendar`}
              style={{
                border: `1px solid ${S.border}`, background: "transparent",
                borderRadius: 7, padding: 7, cursor: "pointer",
                display: "flex", alignItems: "center", fontSize: 13, lineHeight: 1,
              }}
            >
              📅
            </button>
          )}
          <button
            onClick={() => onToggle(event.id)}
            title={notified ? "Remove reminder" : "Remind me"}
            style={{
              border: `1px solid ${notified ? sp.color : S.border}`,
              background: notified ? `${sp.color}18` : "transparent",
              borderRadius: 7, padding: 7, cursor: "pointer",
              display: "flex", alignItems: "center",
              transition: "all 0.12s",
            }}
          >
            <BellIcon on={notified} color={sp.color} />
          </button>
        </div>
      )}
    </div>
  );
}
