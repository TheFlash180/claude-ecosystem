import { useEffect, useRef, useState } from 'react';
import { Loader2, Package, Search, X } from 'lucide-react';
import { P } from '../lib/config';
import { formatRand } from '../lib/price';
import { searchProducts, type SearchHit } from '../lib/store';

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (hit: SearchHit) => void;
  /** Already-tracked external ids, so the sheet can say so instead of letting
   *  someone add the same thing twice and wonder why nothing happened. */
  tracked: Set<string>;
}

export function AddSheet({ open, onClose, onAdd, tracked }: Props) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  // Guards against an earlier, slower response overwriting a later one.
  const runRef = useRef(0);

  useEffect(() => {
    if (!open) {
      setQuery(''); setHits([]); setError(null); setSearched(false);
    }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setHits([]); setSearched(false); setError(null); return; }

    const run = ++runRef.current;
    setBusy(true);
    const timer = setTimeout(async () => {
      const out = await searchProducts(q);
      if (run !== runRef.current) return; // a newer search has started
      setHits(out.results);
      setError(out.error);
      setSearched(true);
      setBusy(false);
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add a product"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: '#000A', zIndex: 50,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: P.surface, borderTop: `1px solid ${P.border}`,
          borderRadius: '18px 18px 0 0', width: '100%', maxWidth: 560,
          maxHeight: '88vh', display: 'flex', flexDirection: 'column',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <header style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px 10px', borderBottom: `1px solid ${P.border}`,
        }}>
          <h2 style={{
            margin: 0, flex: 1, fontFamily: P.display, fontSize: 16,
            fontWeight: 700, color: P.text,
          }}>
            Track a product
          </h2>
          <button onClick={onClose} aria-label="Close" style={{
            background: 'transparent', border: 'none', color: P.sub, cursor: 'pointer', padding: 4,
          }}>
            <X size={18} />
          </button>
        </header>

        <div style={{ padding: '12px 16px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} color={P.muted} style={{
              position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
            }} />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search Takealot, or paste a product link"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: P.raised, color: P.text,
                border: `1px solid ${P.border}`, borderRadius: 12,
                padding: '11px 12px 11px 32px', fontSize: 14, fontFamily: P.body,
              }}
            />
            {busy && (
              <Loader2 size={15} color={P.muted} style={{
                position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)',
                animation: 'pw-spin 1s linear infinite',
              }} />
            )}
          </div>
          <p style={{ margin: '8px 2px 0', fontSize: 11, color: P.muted, fontFamily: P.body }}>
            Pasting a link is the reliable way to get one exact product.
          </p>
        </div>

        <div style={{ overflowY: 'auto', padding: '0 10px 14px', display: 'grid', gap: 6 }}>
          {error && (
            <p style={{
              margin: '4px 6px', fontSize: 13, color: P.amber, fontFamily: P.body,
            }}>
              {error}. Nothing was added — try again in a moment.
            </p>
          )}

          {!error && searched && hits.length === 0 && (
            <p style={{ margin: '4px 6px', fontSize: 13, color: P.sub, fontFamily: P.body }}>
              Nothing found for “{query.trim()}”.
            </p>
          )}

          {hits.map(hit => {
            const already = tracked.has(`${hit.retailer}:${hit.externalId}`);
            return (
              <button
                key={hit.externalId}
                onClick={() => { if (!already) onAdd(hit); }}
                disabled={already}
                style={{
                  display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left',
                  background: 'transparent', border: `1px solid ${P.border}`,
                  borderRadius: 12, padding: 9,
                  cursor: already ? 'default' : 'pointer',
                  opacity: already ? 0.5 : 1,
                  width: '100%',
                }}
              >
                {hit.imageUrl ? (
                  <img src={hit.imageUrl} alt="" loading="lazy" style={{
                    width: 42, height: 42, objectFit: 'contain',
                    borderRadius: 8, background: '#fff', flexShrink: 0,
                  }} />
                ) : (
                  <div style={{
                    width: 42, height: 42, borderRadius: 8, background: P.raised,
                    display: 'grid', placeItems: 'center', flexShrink: 0,
                  }}>
                    <Package size={16} color={P.muted} />
                  </div>
                )}

                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    fontSize: 13, color: P.text, fontFamily: P.body, lineHeight: 1.3,
                  }}>
                    {hit.title}
                  </span>
                  <span style={{
                    display: 'block', marginTop: 3, fontSize: 12,
                    color: P.violet, fontWeight: 600, fontFamily: P.body,
                  }}>
                    {hit.hasVariants ? 'from ' : ''}{formatRand(hit.price)}
                    {already && <span style={{ color: P.muted, fontWeight: 400 }}> · already tracked</span>}
                    {!already && !hit.inStock && (
                      <span style={{ color: P.amber, fontWeight: 400 }}> · out of stock</span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
