import { useState } from 'react';
import { Bell, ExternalLink, Package, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { P, type TrackedProduct } from '../lib/config';
import { assess, formatRand, lastChange, latest, stats } from '../lib/price';
import { Sparkline } from './Sparkline';

const VERDICT_COLOR: Record<string, string> = {
  lowest: P.green,
  good: P.green,
  typical: P.sub,
  high: P.amber,
  unknown: P.muted,
};

interface Props {
  item: TrackedProduct;
  onSetTarget: (trackId: string, target: number | null) => void;
  onRemove: (trackId: string) => void;
}

export function ProductCard({ item, onSetTarget, onRemove }: Props) {
  const { product, track, history } = item;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(track.targetPrice === null ? '' : String(track.targetPrice));

  const st = stats(history);
  const a = assess(history);
  const move = lastChange(history);
  const now = latest(history);
  const verdictColor = VERDICT_COLOR[a.verdict] ?? P.sub;

  const saveTarget = () => {
    const raw = draft.trim().replace(/[^\d.]/g, '');
    onSetTarget(track.id, raw === '' ? null : Number(raw));
    setEditing(false);
  };

  return (
    <article style={{
      background: P.surface,
      border: `1px solid ${P.border}`,
      borderRadius: 16,
      padding: 14,
      display: 'grid',
      gap: 12,
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt=""
            loading="lazy"
            style={{
              width: 56, height: 56, objectFit: 'contain', borderRadius: 10,
              background: '#fff', flexShrink: 0,
            }}
          />
        ) : (
          <div style={{
            width: 56, height: 56, borderRadius: 10, background: P.raised,
            display: 'grid', placeItems: 'center', flexShrink: 0,
          }}>
            <Package size={20} color={P.muted} />
          </div>
        )}

        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{
            margin: 0, fontFamily: P.body, fontSize: 14, fontWeight: 600,
            color: P.text, lineHeight: 1.3,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {product.title}
          </h3>
          <div style={{ marginTop: 4, fontSize: 11, color: P.muted, fontFamily: P.body }}>
            {product.brand ? `${product.brand} · ` : ''}Takealot
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            {/* "from" matters: for a variant parent this is the cheapest
                option, and reading it as the price of the item you want is
                exactly the mistake this label prevents. */}
            {product.hasVariants && (
              <span style={{ fontSize: 11, color: P.muted, fontFamily: P.body }}>from</span>
            )}
            <span style={{
              fontFamily: P.display, fontSize: 26, fontWeight: 700, color: P.text,
              letterSpacing: '-0.02em',
            }}>
              {formatRand(st.current)}
            </span>
            {move && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 12, fontWeight: 600, fontFamily: P.body,
                color: move.direction === 'down' ? P.green : P.red,
              }}>
                {move.direction === 'down' ? <TrendingDown size={13} /> : <TrendingUp size={13} />}
                {Math.abs(Math.round(move.pct))}%
              </span>
            )}
          </div>

          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 11, fontWeight: 600, fontFamily: P.body, color: verdictColor,
              border: `1px solid ${verdictColor}44`, background: `${verdictColor}18`,
              borderRadius: 999, padding: '2px 8px',
            }}>
              {a.label}
            </span>
            {now && !now.inStock && (
              <span style={{
                fontSize: 11, fontWeight: 600, fontFamily: P.body, color: P.amber,
                border: `1px solid ${P.amber}44`, background: `${P.amber}18`,
                borderRadius: 999, padding: '2px 8px',
              }}>
                Out of stock
              </span>
            )}
            {product.delistedAt && (
              <span style={{
                fontSize: 11, fontWeight: 600, fontFamily: P.body, color: P.red,
                border: `1px solid ${P.red}44`, background: `${P.red}18`,
                borderRadius: 999, padding: '2px 8px',
              }}>
                No longer listed
              </span>
            )}
          </div>
        </div>

        <Sparkline history={history} color={a.verdict === 'high' ? P.amber : P.violet} />
      </div>

      <p style={{ margin: 0, fontSize: 12, color: P.sub, fontFamily: P.body, lineHeight: 1.45 }}>
        {a.detail}
        {a.fakeDiscount && (
          <>
            {' '}
            <span style={{ color: P.amber }}>
              Takealot shows a saving here, but this is what it has normally cost.
            </span>
          </>
        )}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {editing ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1 }}>
            <input
              autoFocus
              inputMode="decimal"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveTarget(); }}
              placeholder="Alert me under…"
              style={{
                flex: 1, minWidth: 0, background: P.raised, color: P.text,
                border: `1px solid ${P.border}`, borderRadius: 10,
                padding: '8px 10px', fontSize: 13, fontFamily: P.body,
              }}
            />
            <button onClick={saveTarget} style={btn(P.violet, true)}>Save</button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} style={btn(P.violet, false)}>
            <Bell size={13} />
            {track.targetPrice === null ? 'Set target' : `Under ${formatRand(track.targetPrice)}`}
          </button>
        )}

        {product.url && (
          <a href={product.url} target="_blank" rel="noopener noreferrer" style={{ ...btn(P.sub, false), textDecoration: 'none' }}>
            <ExternalLink size={13} />
            Open
          </a>
        )}

        <button
          onClick={() => onRemove(track.id)}
          aria-label={`Stop tracking ${product.title}`}
          style={{ ...btn(P.muted, false), marginLeft: 'auto' }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </article>
  );
}

function btn(color: string, filled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: filled ? color : 'transparent',
    color: filled ? P.bg : color,
    border: `1px solid ${filled ? color : P.border}`,
    borderRadius: 10, padding: '7px 11px',
    fontSize: 12, fontWeight: 600, fontFamily: P.body,
    cursor: 'pointer',
  };
}
