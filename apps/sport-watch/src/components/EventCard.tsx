import { catOf, flagName, S, type CatMap, type SportEvent } from "../lib/config";
import { fmtDate, fmtTime, isPast, isLive, relativeLabel } from "../lib/time";

function BellIcon({ on, color }: { on: boolean; color: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24"
      fill={on ? color : "none"}
      stroke={on ? color : S.muted}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

export function EventCard({ event, cats, notified, onToggle, onCalendar }: {
  event: SportEvent;
  cats: CatMap;
  notified: boolean;
  onToggle: (id: string) => void;
  onCalendar: (ev: SportEvent) => void;
}) {
  const cat = catOf(cats, event.sport);
  const liveMs = cat.liveMinutes * 60000;
  const past = isPast(event.date) && !isLive(event.date, liveMs);
  const live = isLive(event.date, liveMs);
  const rel = !past && !live ? relativeLabel(event.date) : null;
  const soon = rel === "Today" || rel === "Tomorrow";

  return (
    <div style={{
      background: live ? cat.bg : S.surface,
      borderRadius: 12,
      padding: "13px 14px",
      marginBottom: 8,
      borderLeft: `3px solid ${live ? cat.color : past ? S.dim : event.isSpecial ? "#D4A035" : cat.color + "70"}`,
      display: "flex", alignItems: "center", gap: 12,
      opacity: past ? 0.55 : 1,
      outline: live ? `1px solid ${cat.color}30` : event.isSpecial && !past ? `1px solid #D4A03535` : "none",
      outlineOffset: -1,
    }}>
      <div style={{ fontSize: 20, flexShrink: 0 }}>{cat.icon}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Competition label + badges */}
        <div style={{
          fontFamily: S.body, fontSize: 10, fontWeight: 600,
          letterSpacing: "0.1em", textTransform: "uppercase",
          color: past ? S.muted : cat.color,
          marginBottom: 3, display: "flex", alignItems: "center", gap: 6,
          overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
        }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{event.competition}</span>
          {live && (
            <span style={{
              background: cat.color, color: "#000",
              padding: "2px 6px", borderRadius: 4, flexShrink: 0,
              fontSize: 8, fontWeight: 800, letterSpacing: "0.1em",
            }}>LIVE</span>
          )}
          {rel && (
            <span style={{
              border: `1px solid ${soon ? cat.color : S.border}`,
              color: soon ? cat.color : S.sub,
              background: soon ? `${cat.color}14` : "transparent",
              padding: "1.5px 7px", borderRadius: 9, flexShrink: 0,
              fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
              textTransform: "none",
            }}>{rel}</span>
          )}
        </div>

        {/* Result line (own row — used to hide inside the label) */}
        {event.result && (
          <div style={{
            fontFamily: S.body, fontSize: 12, fontWeight: 600,
            color: past ? S.sub : S.text, marginBottom: 2,
          }}>
            {event.result}
          </div>
        )}

        {/* Teams — never renders "null" when a flag was left out */}
        <div style={{
          fontFamily: S.display, fontSize: 16.5, fontWeight: 600,
          color: past ? S.muted : S.text,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          lineHeight: 1.25,
        }}>
          {flagName(event.homeFlag, event.home)}
          {event.away ? ` vs ${flagName(event.awayFlag, event.away)}` : ""}
        </div>

        {/* Date / time — the line you check daily, now actually readable */}
        <div style={{
          fontFamily: S.body, fontSize: 12.5, fontWeight: 500,
          color: past ? S.muted : S.sub,
          marginTop: 3,
        }}>
          {event.dateTBC || !event.date
            ? "Date to be announced"
            : `${fmtDate(event.date)} · ${fmtTime(event.date)}`}
        </div>

        {/* Venue + where to watch */}
        {(event.venue || (!past && event.channel)) && (
          <div style={{
            fontFamily: S.body, fontSize: 11, color: S.muted,
            marginTop: 2, display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center",
          }}>
            {event.venue && (
              <span style={{
                maxWidth: 200, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                📍 {event.venue}
              </span>
            )}
            {!past && event.channel && (
              <span>
                📺 {event.watchUrl ? (
                  <a href={event.watchUrl} target="_blank" rel="noopener noreferrer"
                     style={{ color: S.muted }}>
                    {event.channel}
                  </a>
                ) : event.channel}
              </span>
            )}
          </div>
        )}

        {/* Conditional note */}
        {(event.isConditional || event.note) && !event.result && (
          <div style={{
            fontFamily: S.body, fontSize: 10.5, color: "#B08A45",
            marginTop: 3, fontStyle: "italic",
          }}>
            ⚡ {event.note}
          </div>
        )}
      </div>

      {/* Calendar + bell buttons (44px targets) */}
      {!past && (
        <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
          {event.date && (
            <button
              onClick={() => onCalendar(event)}
              title="Add to calendar"
              aria-label={`Add ${event.home} to calendar`}
              style={{
                border: `1px solid ${S.border}`, background: "transparent",
                borderRadius: 10, width: 42, height: 42, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, lineHeight: 1,
              }}
            >
              📅
            </button>
          )}
          <button
            onClick={() => onToggle(event.id)}
            title={notified ? "Remove reminder" : "Remind me"}
            aria-label={notified ? `Remove reminder for ${event.home}` : `Remind me about ${event.home}`}
            style={{
              border: `1px solid ${notified ? cat.color : S.border}`,
              background: notified ? `${cat.color}1C` : "transparent",
              borderRadius: 10, width: 42, height: 42, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.12s",
            }}
          >
            <BellIcon on={notified} color={cat.color} />
          </button>
        </div>
      )}
    </div>
  );
}
