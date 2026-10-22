import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { ArrowDownToLine, PackageCheck, PackageX, TrendingDown, TrendingUp, X } from 'lucide-react';
import { P, shopName, type TrackedProduct } from '../lib/config';
import { seriesFor } from '../lib/compare';
import {
  dayLabel, formatRand, heldLabel, historyChart, historyEntries, scrubAt, stats,
} from '../lib/price';

interface Props {
  item: TrackedProduct;
  onClose: () => void;
}

// The chart's own coordinate space. The SVG scales to the sheet's width with
// its aspect kept, so these are proportions, not pixels.
const W = 340;
const H = 170;
const PAD = { top: 10, right: 8, bottom: 22, left: 8 };
const PW = W - PAD.left - PAD.right;
const PH = H - PAD.top - PAD.bottom;

/** Everything Price Watch knows about one product's price, behind a tap on the
 *  card's chart: the whole history drawn large, a finger to read any day off
 *  it, and every change as a line you can read. */
export function HistorySheet({ item, onClose }: Props) {
  const { product, track } = item;
  // The best price across the product's shops, each point carrying its shop:
  // the same series the card's verdicts are judged on.
  const history = useMemo(() => seriesFor(item), [item]);
  const shops = item.offers.filter(o => o.status !== 'suggested').length > 1;
  // One clock for the whole sheet, so the chart, the scrub and the "held for"
  // figures all agree about when "now" is.
  const now = useMemo(() => new Date(), []);
  const st = useMemo(() => stats(history, now), [history, now]);
  const chart = useMemo(() => historyChart(history, now, track.targetPrice), [history, now, track.targetPrice]);
  const entries = useMemo(() => historyEntries(history, now), [history, now]);
  const [scrub, setScrub] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Escape closes, as any dialog should.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const read = scrub === null ? null : scrubAt(history, scrub, now);

  const fractionAt = (e: PointerEvent<SVGSVGElement>) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    // Client pixels → the plot area's 0..1, through the same scale the SVG uses.
    const x = ((e.clientX - r.left) / r.width) * W;
    return Math.min(1, Math.max(0, (x - PAD.left) / PW));
  };

  const trackedDays = Math.floor(st.spanDays);
  const startLabel = chart ? dayLabel(chart.startAt, now) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Price history: ${product.title}`}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: '#000A', zIndex: 60,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto',
          background: P.surface, borderTop: `1px solid ${P.border}`,
          borderRadius: '20px 20px 0 0',
          padding: '14px 16px calc(20px + env(safe-area-inset-bottom))',
          fontFamily: P.body, color: P.text,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: P.muted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Price history
            </div>
            <h2 style={{
              margin: '3px 0 0', fontFamily: P.display, fontSize: 16, fontWeight: 700,
              lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {product.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 40, height: 40, flexShrink: 0, borderRadius: 20,
              background: P.raised, border: `1px solid ${P.border}`, color: P.sub,
              display: 'grid', placeItems: 'center', cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* What the finger is on, or today when it is not on anything. */}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'baseline', gap: 8, minHeight: 34 }}>
          <span style={{ fontFamily: P.display, fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>
            {product.hasVariants && (
              <span style={{ fontSize: 12, color: P.muted, fontFamily: P.body, fontWeight: 400, marginRight: 4 }}>from</span>
            )}
            {formatRand(read ? read.price : st.current)}
          </span>
          <span style={{ fontSize: 12.5, color: P.sub }}>
            {read ? dayLabel(read.at, now) : 'today'}
            {read && !read.inStock && <span style={{ color: P.amber }}> · out of stock</span>}
          </span>
        </div>

        {chart ? (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Price since ${startLabel}: lowest ${formatRand(st.lowest)}, highest ${formatRand(st.highest)}, now ${formatRand(st.current)}`}
            onPointerDown={e => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setScrub(fractionAt(e));
            }}
            onPointerMove={e => { if (scrub !== null || e.pointerType === 'mouse') setScrub(fractionAt(e)); }}
            onPointerUp={() => setScrub(null)}
            onPointerCancel={() => setScrub(null)}
            onPointerLeave={e => { if (e.pointerType === 'mouse') setScrub(null); }}
            style={{
              display: 'block', width: '100%', height: 'auto', marginTop: 4,
              // Vertical swipes still scroll the sheet; sideways drags read the chart.
              touchAction: 'pan-y', cursor: 'crosshair', userSelect: 'none',
            }}
          >
            {/* Top and bottom of the scale, as faint rules with their prices. */}
            <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top} y2={PAD.top} stroke={P.border} strokeWidth={0.75} />
            <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + PH} y2={PAD.top + PH} stroke={P.border} strokeWidth={0.75} />
            {/* When the target is the top or bottom of the scale, its own label
                already says that price; a second one beside it is noise. */}
            {!(chart.targetY !== null && chart.targetY < 0.001) && (
              <text x={W - PAD.right} y={PAD.top - 2} textAnchor="end" fontSize={8} fill={P.muted}>{formatRand(Math.round(chart.hi))}</text>
            )}
            {!(chart.targetY !== null && chart.targetY > 0.999) && (
              <text x={W - PAD.right} y={PAD.top + PH - 3} textAnchor="end" fontSize={8} fill={P.muted}>{formatRand(Math.round(chart.lo))}</text>
            )}

            {chart.targetY !== null && (
              <>
                <line
                  x1={PAD.left} x2={W - PAD.right}
                  y1={PAD.top + chart.targetY * PH} y2={PAD.top + chart.targetY * PH}
                  stroke={P.violet} strokeWidth={1} strokeDasharray="4 3" opacity={0.8}
                />
                <text x={PAD.left + 2} y={PAD.top + chart.targetY * PH - 3} fontSize={8} fill={P.violet}>
                  target {formatRand(track.targetPrice)}
                </text>
              </>
            )}

            <path
              d={`${linePath(chart.line)} L ${PAD.left + PW} ${PAD.top + PH} L ${PAD.left} ${PAD.top + PH} Z`}
              fill={P.violet} opacity={0.12}
            />
            <path d={linePath(chart.line)} fill="none" stroke={P.violet} strokeWidth={2} strokeLinejoin="round" />

            {chart.low && (
              <circle
                cx={PAD.left + chart.low.x * PW} cy={PAD.top + chart.low.y * PH} r={3.5}
                fill={P.surface} stroke={P.green} strokeWidth={1.75}
              />
            )}

            {scrub !== null && (
              <line
                x1={PAD.left + scrub * PW} x2={PAD.left + scrub * PW}
                y1={PAD.top} y2={PAD.top + PH}
                stroke={P.text} strokeWidth={1} opacity={0.6}
              />
            )}

            <text x={PAD.left} y={H - 6} fontSize={8.5} fill={P.muted}>{startLabel}</text>
            <text x={W - PAD.right} y={H - 6} textAnchor="end" fontSize={8.5} fill={P.muted}>today</text>
          </svg>
        ) : (
          <p style={{ fontSize: 13, color: P.muted, margin: '18px 0' }}>No history yet — the first price arrives with the next check.</p>
        )}

        {chart && (
          <p style={{ margin: '2px 0 0', fontSize: 11, color: P.muted, textAlign: 'center' }}>
            Slide along the chart to read any day.
          </p>
        )}

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14,
        }}>
          {/* A low needs two different prices; until then it is just today's. */}
          <Stat label="Lowest" value={chart?.low ? formatRand(st.lowest) : '—'}
                sub={chart?.low && st.lowestAt ? dayLabel(st.lowestAt, now) : 'no change yet'}
                color={P.green} />
          <Stat label="Usual" value={st.observations > 1 ? formatRand(st.typical) : formatRand(st.current)}
                sub="most days" />
          <Stat label="Tracked" value={trackedDays < 1 ? 'today' : `${trackedDays} day${trackedDays === 1 ? '' : 's'}`}
                sub={startLabel ? `since ${startLabel}` : ''} />
        </div>

        <h3 style={{
          margin: '18px 0 8px', fontSize: 11, fontWeight: 700, color: P.muted,
          letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          Every change · {entries.length}
        </h3>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, border: `1px solid ${P.border}`, borderRadius: 14, overflow: 'hidden' }}>
          {entries.map((e, n) => (
            <li key={e.at} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px',
              borderTop: n === 0 ? 'none' : `1px solid ${P.border}`,
              background: e.current ? P.raised : 'transparent',
            }}>
              <span style={{ width: 22, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                {e.stock === 'out' ? <PackageX size={16} color={P.amber} />
                  : e.stock === 'back' ? <PackageCheck size={16} color={P.green} />
                  : e.change && e.change.delta < 0 ? <TrendingDown size={16} color={P.green} />
                  : e.change && e.change.delta > 0 ? <TrendingUp size={16} color={P.red} />
                  : <ArrowDownToLine size={16} color={P.muted} />}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>
                  {formatRand(e.price)}
                  {e.change && (
                    <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 600, color: e.change.delta < 0 ? P.green : P.red }}>
                      {e.change.delta < 0 ? '▼' : '▲'} {formatRand(Math.abs(e.change.delta))} ({Math.abs(Math.round(e.change.pct))}%)
                    </span>
                  )}
                  {e.isLow && (
                    <span style={{
                      marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: P.green,
                      border: `1px solid ${P.green}55`, borderRadius: 999, padding: '1px 6px',
                    }}>
                      lowest
                    </span>
                  )}
                </span>
                <span style={{ display: 'block', fontSize: 11.5, color: P.muted, marginTop: 2 }}>
                  {shops && e.retailer ? `${shopName(e.retailer)} · ` : ''}
                  {e.stock === 'out' ? 'Went out of stock · '
                    : e.stock === 'back' ? 'Back in stock · '
                    : !e.change ? 'First price recorded · ' : ''}
                  {e.current ? `${heldLabel(e.heldDays)} so far` : `held ${heldLabel(e.heldDays)}`}
                </span>
              </span>
              <span style={{ fontSize: 12, color: P.sub, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                {e.current && e.heldDays < 1 ? 'today' : dayLabel(e.at, now)}
              </span>
            </li>
          ))}
        </ol>

        <p style={{ margin: '12px 2px 0', fontSize: 11, color: P.muted, lineHeight: 1.5 }}>
          Checked every morning. A line appears only when the price or the stock changes,
          so a price that held for weeks is one line, not one per day.
        </p>
      </div>
    </div>
  );
}

function linePath(line: { x: number; y: number }[]): string {
  return line
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(PAD.left + p.x * PW).toFixed(2)} ${(PAD.top + p.y * PH).toFixed(2)}`)
    .join(' ');
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div style={{
      background: P.raised, border: `1px solid ${P.border}`, borderRadius: 12, padding: '9px 10px',
    }}>
      <div style={{ fontSize: 10.5, color: P.muted, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: color ?? P.text, marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 10.5, color: P.muted, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
    </div>
  );
}
