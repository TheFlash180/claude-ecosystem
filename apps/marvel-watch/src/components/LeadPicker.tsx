import { useState } from "react";
import { Bell, BellOff, Check } from "lucide-react";
import { LEAD_DAYS, M, type Title } from "../lib/config";
import { fmtRelease } from "../lib/titles";

// Bottom-sheet style picker: tick any combination of 1w / 3d / 1d.
export function LeadPicker({ title: t, current, onSave, onClose }: {
  title: Title;
  current: Set<number>;
  onSave: (t: Title, leads: number[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<Set<number>>(
    current.size > 0 ? new Set(current) : new Set([7, 3, 1]),
  );

  const toggle = (d: number) => {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  };

  return (
    <div
      onClick={onClose}
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
        {t.releaseDate && (
          <div style={{ fontFamily: M.body, fontSize: 12.5, color: M.sub, marginBottom: 14 }}>
            Releases {fmtRelease(t.releaseDate)} — when should we nudge you?
          </div>
        )}

        {LEAD_DAYS.map(l => {
          const on = picked.has(l.days);
          return (
            <button
              key={l.days}
              onClick={() => toggle(l.days)}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                width: "100%", textAlign: "left",
                background: on ? `${M.gold}14` : "transparent",
                border: `1px solid ${on ? M.gold : M.border}`,
                borderRadius: 12, padding: "13px 14px", marginBottom: 8,
                cursor: "pointer",
              }}>
              <span style={{
                width: 22, height: 22, borderRadius: 7, flexShrink: 0,
                border: `2px solid ${on ? M.gold : M.muted}`,
                background: on ? M.gold : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#1A1406",
              }}>
                {on && <Check size={15} strokeWidth={3} />}
              </span>
              <span style={{
                fontFamily: M.body, fontSize: 14, fontWeight: 600,
                color: on ? M.text : M.sub,
              }}>
                {l.label}
              </span>
            </button>
          );
        })}

        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          {current.size > 0 && (
            <button
              onClick={() => onSave(t, [])}
              style={{
                flex: 1, border: `1px solid ${M.border}`, background: "transparent",
                color: M.crimson, borderRadius: 12, padding: "13px 0",
                fontFamily: M.body, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
              <BellOff size={14} strokeWidth={2.2} /> Remove all
            </button>
          )}
          <button
            onClick={() => onSave(t, [...picked])}
            disabled={picked.size === 0 && current.size === 0}
            style={{
              flex: 2, border: "none",
              background: `linear-gradient(135deg, ${M.crimson} 0%, ${M.crimsonDark} 100%)`,
              color: "#fff", borderRadius: 12, padding: "13px 0",
              fontFamily: M.body, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
            {picked.size === 0
              ? <><BellOff size={14} strokeWidth={2.2} /> Remove reminders</>
              : <><Bell size={14} strokeWidth={2.2} /> Set {picked.size} reminder{picked.size > 1 ? "s" : ""}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
