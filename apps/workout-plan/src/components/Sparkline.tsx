import { W } from '../lib/config';

/** Minimal inline SVG line chart for a small series of numbers. */
export function Sparkline({ values, width = 220, height = 48, color = W.volt }: {
  values: number[]; width?: number; height?: number; color?: string;
}) {
  if (values.length < 2) {
    return <div style={{ height, display: 'flex', alignItems: 'center', color: W.muted, fontSize: 11 }}>Not enough data yet</div>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 4;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = pts[pts.length - 1].split(',');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={3} fill={color} />
    </svg>
  );
}
