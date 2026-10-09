import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { WeightEvent } from '../types';

interface Props {
  weights: WeightEvent[];
  onClose: () => void;
}

export default function GrowthChart({ weights, onClose }: Props) {
  // Colours are the CSS variables, never literals: night mode swaps the
  // variables, and a hardcoded hue here would stay day-bright at 3am.
  const data = [...weights]
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at))
    .map((w) => ({
      date: new Date(w.measured_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      kg: +(w.weight_g / 1000).toFixed(2),
    }));

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <h3 style={styles.title}>Growth</h3>

        {data.length < 2 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', textAlign: 'center' }}>
            Log at least 2 weights to see the chart.
          </p>
        ) : (
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'var(--muted)', fontSize: 11 }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'var(--muted)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  unit=" kg"
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    color: 'var(--text)',
                    fontSize: '0.85rem',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="kg"
                  stroke="var(--weight)"
                  strokeWidth={2}
                  dot={{ fill: 'var(--weight)', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <button onClick={onClose} style={styles.close}>Close</button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'var(--overlay)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    padding: 16,
  },
  sheet: {
    background: 'var(--surface)',
    borderRadius: 16,
    padding: '24px 16px',
    width: '100%',
    maxWidth: 500,
  },
  title: {
    fontFamily: 'var(--font-display)',
    color: 'var(--weight)',
    fontSize: '1.1rem',
    margin: '0 0 16px',
    fontWeight: 700,
    textAlign: 'center',
  },
  close: {
    display: 'block',
    margin: '16px auto 0',
    background: 'none',
    border: 'none',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: '0.85rem',
    fontFamily: 'var(--font-body)',
  },
};
