import { P, type PricePoint } from '../lib/config';
import { sparkline } from '../lib/price';

interface Props {
  history: PricePoint[];
  width?: number;
  height?: number;
  color?: string;
}

/** A step chart, not a line chart. The price held flat between readings, and
 *  drawing a diagonal would invent a gradual slide that never happened. */
export function Sparkline({ history, width = 96, height = 32, color = P.violet }: Props) {
  const pts = sparkline(history);
  if (pts.length === 0) {
    return (
      <div
        style={{
          width, height, display: 'grid', placeItems: 'center',
          fontSize: 10, color: P.muted, fontFamily: P.body,
        }}
      >
        no history yet
      </div>
    );
  }

  const pad = 3;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const d = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(pad + p.x * w).toFixed(2)} ${(pad + p.y * h).toFixed(2)}`)
    .join(' ');

  // Fill under the line, closed along the bottom edge.
  const area = `${d} L ${pad + w} ${pad + h} L ${pad} ${pad + h} Z`;
  const last = pts[pts.length - 1];

  return (
    <svg width={width} height={height} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <path d={area} fill={color} opacity={0.13} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.75}
            strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pad + last.x * w} cy={pad + last.y * h} r={2.5} fill={color} />
    </svg>
  );
}
