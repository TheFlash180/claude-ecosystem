import { Eye, X } from "lucide-react";
import { M, type Title } from "../lib/config";
import { fmtRelease } from "../lib/titles";

/** Confirmation before a title disappears off the page.
 *
 *  Hiding something is the one action here with no visible trace afterwards —
 *  the card is simply gone — so it asks first, and the toast that follows
 *  offers an undo. Two chances to get it right, because the recovery path
 *  (the owner page) is not where anyone would think to look. */
export function ConfirmWatched({ title: t, onConfirm, onClose }: {
  title: Title;
  onConfirm: (t: Title) => void;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Mark ${t.title} as watched`}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(4,3,8,0.75)", display: "flex",
        alignItems: "flex-end", justifyContent: "center",
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: M.raised, borderTop: `1px solid ${M.border}`,
          borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480,
          padding: "18px 18px calc(18px + env(safe-area-inset-bottom))",
        }}>
        <div style={{
          fontFamily: M.display, fontSize: 22, color: M.text,
          letterSpacing: "0.02em", marginBottom: 2,
        }}>
          {t.title}
        </div>
        <div style={{
          fontFamily: M.body, fontSize: 12.5, color: M.sub,
          marginBottom: 16, lineHeight: 1.5,
        }}>
          {t.releaseDate && <>Released {fmtRelease(t.releaseDate)}. </>}
          Marking it watched removes it from Out Now on this device only — the
          other phone keeps its own list.
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, border: `1px solid ${M.border}`, background: "transparent",
              color: M.sub, borderRadius: 12, padding: "13px 0",
              fontFamily: M.body, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
            <X size={14} strokeWidth={2.2} /> Cancel
          </button>
          <button
            onClick={() => onConfirm(t)}
            style={{
              flex: 2, border: "none",
              background: `linear-gradient(135deg, ${M.crimson} 0%, ${M.crimsonDark} 100%)`,
              color: "#fff", borderRadius: 12, padding: "13px 0",
              fontFamily: M.body, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
            <Eye size={14} strokeWidth={2.2} /> Mark as watched
          </button>
        </div>
      </div>
    </div>
  );
}
