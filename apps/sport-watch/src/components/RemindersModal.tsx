import { Bell, BellOff, X } from "lucide-react";
import { catOf, matchTitle, S, type CatMap, type SportEvent } from "../lib/config";
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
  cats,
  leadFor,
  onLeadChange,
  onRemove,
  onClose,
}: {
  events: SportEvent[];
  cats: CatMap;
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
        background: "rgba(0,0,0,0.72)", display: "flex",
        alignItems: "center", justifyContent: "center", padding: 20,
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: S.surface, border: `1px solid ${S.border}`,
          borderRadius: 18, width: "100%", maxWidth: 430,
          maxHeight: "72vh", overflowY: "auto", padding: "18px 16px 12px",
        }}>
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "center", marginBottom: 10,
        }}>
          <div style={{
            fontFamily: S.display, fontSize: 17, fontWeight: 700,
            color: S.text, letterSpacing: "-0.01em",
            display: "flex", alignItems: "center", gap: 7,
          }}>
            <Bell size={16} strokeWidth={2.2} /> Your reminders
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: S.muted, lineHeight: 1, padding: 6,
              display: "flex", alignItems: "center",
            }}>
            <X size={18} />
          </button>
        </div>

        {events.length === 0 ? (
          <div style={{ color: S.sub, fontSize: 13.5, padding: "12px 0 16px" }}>
            No reminders set — tap the bell on any fixture to add one.
          </div>
        ) : (
          events.map(ev => {
            const cat = catOf(cats, ev.sport);
            return (
              <div key={ev.id} style={{
                display: "flex", alignItems: "center", gap: 11,
                padding: "11px 0", borderTop: `1px solid ${S.border}`,
              }}>
                <span style={{ fontSize: 17, flexShrink: 0 }}>{cat.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    color: S.text, fontSize: 13.5, fontWeight: 600,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {matchTitle({ ...ev, homeFlag: "", awayFlag: "" })}
                  </div>
                  <div style={{ color: S.sub, fontSize: 12, margin: "2px 0 5px" }}>
                    {ev.date ? `${fmtDate(ev.date)} · ${fmtTime(ev.date)}` : "Date TBC"}
                  </div>
                  <select
                    value={leadFor(ev.id)}
                    onChange={e => onLeadChange(ev, Number(e.target.value))}
                    aria-label={`Reminder lead time for ${ev.home}`}
                    style={{
                      background: S.bg, color: S.text, border: `1px solid ${S.border}`,
                      borderRadius: 8, fontFamily: S.body, fontSize: 12,
                      padding: "5px 8px",
                    }}>
                    {LEAD_OPTIONS.map(o => (
                      <option key={o.minutes} value={o.minutes}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => onRemove(ev.id)}
                  aria-label={`Remove reminder for ${ev.home}${ev.away ? ` vs ${ev.away}` : ""}`}
                  style={{
                    background: "transparent", border: `1px solid ${S.border}`,
                    borderRadius: 18, cursor: "pointer", flexShrink: 0,
                    color: cat.color, fontFamily: S.body, fontSize: 12,
                    fontWeight: 600, padding: "8px 12px",
                    display: "inline-flex", alignItems: "center", gap: 5,
                  }}>
                  <BellOff size={13} strokeWidth={2.2} /> Remove
                </button>
              </div>
            );
          })
        )}

        <div style={{
          color: S.muted, fontSize: 11, paddingTop: 10,
          borderTop: `1px solid ${S.border}`,
        }}>
          Pushes arrive at the lead time you pick, even with the app closed.
        </div>
      </div>
    </div>
  );
}
