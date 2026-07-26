import { Bell, BellOff, Clapperboard, Pencil, Tv, X } from "lucide-react";
import { LEAD_DAYS, M, type Title } from "../lib/config";
import { fmtRelease, releaseLabel, type ReminderEntry } from "../lib/titles";

const leadShort = (days: number) => (days === 7 ? "1w" : `${days}d`);

/** Everything this device has a reminder on: retune the leads or drop the
 *  reminder outright, without hunting for the title in the list. */
export function RemindersModal({ entries, onEdit, onRemove, onClose }: {
  entries: ReminderEntry[];
  onEdit: (t: Title) => void;
  onRemove: (t: Title) => void;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(4,3,8,0.75)", display: "flex",
        alignItems: "center", justifyContent: "center", padding: 18,
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: M.surface, border: `1px solid ${M.border}`,
          borderRadius: 18, width: "100%", maxWidth: 440,
          maxHeight: "74vh", overflowY: "auto", padding: "18px 16px 14px",
        }}>
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "center", marginBottom: 10,
        }}>
          <div style={{
            fontFamily: M.display, fontSize: 21, color: M.text,
            letterSpacing: "0.03em",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <Bell size={16} strokeWidth={2.2} color={M.gold} /> YOUR REMINDERS
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              color: M.muted, lineHeight: 1, padding: 6,
              display: "flex", alignItems: "center",
            }}>
            <X size={18} />
          </button>
        </div>

        {entries.length === 0 ? (
          <div style={{ color: M.sub, fontFamily: M.body, fontSize: 13.5, padding: "10px 0 14px" }}>
            No reminders set — tap the bell on any title to add one.
          </div>
        ) : (
          entries.map(({ title: t, leads }) => (
            <div key={t.id} style={{
              display: "flex", alignItems: "center", gap: 11,
              padding: "12px 0", borderTop: `1px solid ${M.border}`,
            }}>
              <span style={{ flexShrink: 0, color: M.muted, display: "flex" }}>
                {t.mediaType === "movie"
                  ? <Clapperboard size={17} strokeWidth={1.9} />
                  : <Tv size={17} strokeWidth={1.9} />}
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: M.body, color: M.text, fontSize: 13.5, fontWeight: 600,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {t.title}
                </div>
                <div style={{ fontFamily: M.body, color: M.sub, fontSize: 12, margin: "2px 0 6px" }}>
                  {t.releaseDate ? `${releaseLabel(t.releaseDate)} · ${fmtRelease(t.releaseDate)}` : "Date TBA"}
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {LEAD_DAYS.filter(l => leads.includes(l.days)).map(l => (
                    <span key={l.days} style={{
                      border: `1px solid ${M.gold}55`, color: M.gold, background: `${M.gold}14`,
                      borderRadius: 8, padding: "2px 7px",
                      fontFamily: M.body, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em",
                    }}>
                      {leadShort(l.days)}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => onEdit(t)}
                  aria-label={`Change reminders for ${t.title}`}
                  style={{
                    background: "transparent", border: `1px solid ${M.border}`,
                    borderRadius: 16, cursor: "pointer", color: M.sub,
                    fontFamily: M.body, fontSize: 11.5, fontWeight: 600, padding: "7px 11px",
                    display: "inline-flex", alignItems: "center", gap: 5,
                  }}>
                  <Pencil size={12} strokeWidth={2.2} /> Change
                </button>
                <button
                  onClick={() => onRemove(t)}
                  aria-label={`Remove reminders for ${t.title}`}
                  style={{
                    background: "transparent", border: `1px solid ${M.border}`,
                    borderRadius: 16, cursor: "pointer", color: M.crimson,
                    fontFamily: M.body, fontSize: 11.5, fontWeight: 600, padding: "7px 11px",
                    display: "inline-flex", alignItems: "center", gap: 5,
                  }}>
                  <BellOff size={12} strokeWidth={2.2} /> Remove
                </button>
              </div>
            </div>
          ))
        )}

        <div style={{
          color: M.muted, fontFamily: M.body, fontSize: 11, paddingTop: 11,
          borderTop: `1px solid ${M.border}`, lineHeight: 1.6,
        }}>
          Pushes arrive at each lead you pick, even with the app closed.
        </div>
      </div>
    </div>
  );
}
