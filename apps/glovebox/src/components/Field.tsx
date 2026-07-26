import type { CSSProperties, ReactNode } from 'react';
import { G } from '../lib/config';

export const inputStyle: CSSProperties = {
  width: '100%', background: G.bg, color: G.text,
  border: `1px solid ${G.border}`, borderRadius: 9,
  fontFamily: G.body, fontSize: 14, padding: '10px 11px',
  // Without this iOS Safari zooms the whole page in on focus.
  WebkitAppearance: 'none',
};

export function Field({ label, hint, children }: {
  label: string; hint?: string; children: ReactNode;
}) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{
        display: 'block', fontFamily: G.body, fontSize: 11.5, fontWeight: 600,
        color: G.sub, marginBottom: 5, letterSpacing: '0.02em',
      }}>
        {label}
        {hint && <span style={{ color: G.muted, fontWeight: 400 }}> · {hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', gap: 10 }}>{children}</div>;
}

export function LeadPicker({ value, onChange, options }: {
  value: number[];
  onChange: (next: number[]) => void;
  options: { days: number; label: string }[];
}) {
  const toggle = (d: number) =>
    onChange(value.includes(d) ? value.filter(x => x !== d) : [...value, d].sort((a, b) => b - a));

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(o => {
        const on = value.includes(o.days);
        return (
          <button
            key={o.days}
            type="button"
            onClick={() => toggle(o.days)}
            aria-pressed={on}
            style={{
              cursor: 'pointer', borderRadius: 999, padding: '6px 12px',
              fontFamily: G.body, fontSize: 12, fontWeight: 600,
              border: `1px solid ${on ? G.blue : G.border}`,
              background: on ? `${G.blue}1F` : 'transparent',
              color: on ? G.blue : G.sub,
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
