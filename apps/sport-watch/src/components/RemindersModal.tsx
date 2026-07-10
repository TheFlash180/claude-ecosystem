import { S, SPORT, type SportEvent } from "../lib/config";
import { fmtDate, fmtTime } from "../lib/time";

export const LEAD_OPTIONS = [
  { minutes: 15, label: "15 min before" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 180, label: "3 hours before" },
  { minutes: 1440, label: "1 day before" },
];

// Popup listing every fixture with a reminder set: change how far in
// advance the push fires, or remove the bell entirely.
export function RemindersModal({
  events,
  leadFor,
  onLeadChange,
  onRemove,
  onClose,
}: {
  events: SportEvent[];
  leadFor: (id: string) => number;
  onLeadChange: (ev: SportEvent, minutes: number) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.7)", display: "flex",
        alignItems: "center", justifyContent: "center", padding: 20,
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: S.surface, border: `1px solid ${S.border}`,
          borderRadius: 16, width: "100%", maxWidth: 420,
          maxHeight: "70vh", overflowY: "auto", padding: "16px 16px 12px",
        }}>
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "center", marginBottom: 10,
        }}>
          <div style={{
            fontFamily: S.display, fontSize: 16, fontWeight: 700,
            color: S.text, letterSpacing: "-0.01em",
          }}>
            🔔 Your reminders
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: S.muted, fontSize: 18, lineHeight: 1, padding: 4,
            }}>
            ✕
          </button>
        </div>

        {events.length === 0 ? (
          <div style={{ color: S.muted, fontSize: 13, padding: "12px 0 16px" }}>
            No reminders set — tap the bell on any fixture to add one.
          </div>
        ) : (
          events.map(ev => {
            const sp = SPORT[ev.sport];
            return (
              <div key={ev.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 0", borderTop: `1px solid ${S.border}`,
              }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{sp.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    color: S.text, fontSize: 13, fontWeight: 600,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {ev.home}{ev.away ? ` vs ${ev.away}` : ""}
                  </div>
                  <div style={{ color: S.muted, fontSize: 11, margin: "1px 0 4px" }}>
                    {ev.date ? `${fmtDate(ev.date)} · ${fmtTime(ev.date)}` : "Date TBC"}
                  </div>
                  <select
                    value={leadFor(ev.id)}
                    onChange={e => onLeadChange(ev, Number(e.target.value))}
                    aria-label={`Reminder lead time for ${ev.home}`}
                    style={{
                      background: S.bg, color: S.text, border: `1px solid ${S.border}`,
                      borderRadius: 6, fontFamily: S.body, fontSize: 11,
                      padding: "3px 6px",
                    }}>
                    {LEAD_OPTIONS.map(o => (
                      <option key={o.minutes} value={o.minutes}>🔔 {o.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => onRemove(ev.id)}
                  aria-label={`Remove reminder for ${ev.home}${ev.away ? ` vs ${ev.away}` : ""}`}
                  style={{
                    background: "transparent", border: `1px solid ${S.border}`,
                    borderRadius: 16, cursor: "pointer", flexShrink: 0,
                    color: sp.color, fontFamily: S.body, fontSize: 11,
                    fontWeight: 600, padding: "5px 10px",
                  }}>
                  🔕 Remove
                </button>
              </div>
            );
          })
        )}

        <div style={{
          color: S.dim, fontSize: 10.5, paddingTop: 10,
          borderTop: `1px solid ${S.border}`,
        }}>
          Pushes arrive at the lead time you pick, even with the app closed.
        </div>
      </div>
    </div>
  );
}
