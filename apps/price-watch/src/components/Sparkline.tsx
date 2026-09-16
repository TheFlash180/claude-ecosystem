import { P, type PricePoint } from '../lib/config';
import { lowestMarker, sparkline } from '../lib/price';

interface Props {
  history: PricePoint[];
  width?: number;
  height?: number;
  color?: string;
}

/** A step chart, not a line chart. The price held flat between readings, and
 *  drawing a diagonal would invent a gradual slide that never happened.
 *
 *  The lowest price is the bottom of the scale by construction, so the record
 *  is marked two ways: a dashed rule along that floor, and a dot where it was
 *  set. Together they answer "how far above its best is this right now, and
 *  was that recent or months ago" without leaving the chart. */
export function Sparkline({ history, width = 108, height = 38, color = P.violet }: Props) {
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
  const low = lowestMarker(history);

  return (
    <svg width={width} height={height} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <path d={area} fill={color} opacity={0.13} />

      {low && (
        <line
          x1={pad} y1={pad + low.y * h} x2={pad + w} y2={pad + low.y * h}
          stroke={P.green} strokeWidth={1} strokeDasharray="2 3" opacity={0.55}
        />
      )}

      <path d={d} fill="none" stroke={color} strokeWidth={1.75}
            strokeLinejoin="round" strokeLinecap="round" />

      {/* Hollow, so it reads as a marker on the record rather than another
          reading in the series. */}
      {low && (
        <circle
          cx={pad + low.x * w} cy={pad + low.y * h} r={2.75}
          fill={P.bg} stroke={P.green} strokeWidth={1.5}
        />
      )}

      <circle cx={pad + last.x * w} cy={pad + last.y * h} r={2.5} fill={color} />
    </svg>
  );
}
