import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AlertTriangle, Bell, BellOff, Plus, Tag } from 'lucide-react';
import { P, type SourceHealth, type TrackedProduct } from './lib/config';
import { assess, formatRand, stats } from './lib/price';
import {
  fetchSources, fetchTracked, registerPush, setTarget, trackProduct, untrack,
  type SearchHit,
} from './lib/store';
import { AddSheet } from './components/AddSheet';
import { ProductCard } from './components/ProductCard';

/** A source that has not reported in this long is treated as broken. Silence
 *  and "nothing changed" look identical otherwise, and the whole point of the
 *  app is that something is watching on your behalf. */
const STALE_HOURS = 30;

function isStale(sources: SourceHealth[]): boolean {
  if (sources.length === 0) return false;
  return sources.some(s =>
    s.enabled && (
      s.lastOkAt === null ||
      Date.now() - Date.parse(s.lastOkAt) > STALE_HOURS * 3600000
    ));
}

export default function App() {
  const [items, setItems] = useState<TrackedProduct[]>([]);
  const [sources, setSources] = useState<SourceHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const say = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(t => (t === msg ? null : t)), 2600);
  }, []);

  const load = useCallback(async () => {
    const [tracked, health] = await Promise.all([fetchTracked(), fetchSources()]);
    setItems(tracked);
    setSources(health);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      setPushOn(true);
    }
  }, []);

  const trackedKeys = useMemo(
    () => new Set(items.map(i => `${i.product.retailer}:${i.product.externalId}`)),
    [items],
  );

  // Anything under target or at its lowest deserves to be seen first — that is
  // the moment the app exists to catch.
  const ordered = useMemo(() => {
    const rank = (i: TrackedProduct) => {
      const cur = stats(i.history).current;
      if (i.track.targetPrice !== null && cur !== null && cur <= i.track.targetPrice) return 0;
      const v = assess(i.history).verdict;
      if (v === 'lowest') return 1;
      if (v === 'good') return 2;
      return 3;
    };
    return [...items].sort((a, b) => rank(a) - rank(b));
  }, [items]);

  const savings = useMemo(() => {
    // What the tracked basket costs now versus what it typically costs. Only
    // products with enough history to have a real "typical" are counted.
    let total = 0;
    for (const i of items) {
      const st = stats(i.history);
      if (assess(i.history).verdict === 'unknown') continue;
      if (st.current !== null && st.typical !== null && st.typical > st.current) {
        total += st.typical - st.current;
      }
    }
    return total;
  }, [items]);

  const onAdd = async (hit: SearchHit) => {
    setAdding(false);
    const ok = await trackProduct(hit, null);
    say(ok ? 'Tracking started' : 'Could not add that product');
    if (ok) await load();
  };

  const onSetTarget = async (trackId: string, target: number | null) => {
    const ok = await setTarget(trackId, target);
    if (!ok) { say('Could not save that target'); return; }
    say(target === null ? 'Target cleared' : `Alerting under ${formatRand(target)}`);
    await load();
  };

  const onRemove = async (trackId: string) => {
    const ok = await untrack(trackId);
    if (!ok) { say('Could not stop tracking'); return; }
    setItems(prev => prev.filter(i => i.track.id !== trackId));
    say('Stopped tracking');
  };

  const onPush = async () => {
    const ok = await registerPush();
    setPushOn(ok);
    say(ok ? 'Price alerts on' : 'Notifications were not allowed');
  };

  return (
    <div style={{
      background: P.bg, minHeight: '100vh', fontFamily: P.body,
      maxWidth: 560, margin: '0 auto', color: P.text,
    }}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: ${P.bg}; }
        button:focus-visible, input:focus-visible, a:focus-visible {
          outline: 2px solid ${P.violet}; outline-offset: 2px;
        }
        @keyframes pw-spin { to { transform: translateY(-50%) rotate(360deg) } }
      `}</style>

      {toast && (
        <div role="status" style={{
          position: 'fixed', top: 'calc(14px + env(safe-area-inset-top))', left: '50%',
          transform: 'translateX(-50%)', zIndex: 200,
          background: '#1A1526', border: `1px solid ${P.violet}`, color: P.text,
          padding: '11px 20px', borderRadius: 24, fontSize: 13.5, fontWeight: 500,
          boxShadow: '0 4px 24px rgba(0,0,0,0.6)', whiteSpace: 'nowrap', pointerEvents: 'none',
        } as CSSProperties}>
          {toast}
        </div>
      )}

      <header style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: 'calc(16px + env(safe-area-inset-top)) 16px 12px',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{
            margin: 0, fontFamily: P.display, fontSize: 21, fontWeight: 700,
            letterSpacing: '-0.02em',
          }}>
            Price Watch
          </h1>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: P.muted }}>
            {items.length === 0
              ? 'Nothing tracked yet'
              : `${items.length} product${items.length === 1 ? '' : 's'}`}
            {savings > 0 && (
              <> · <span style={{ color: P.green }}>{formatRand(savings)} below usual</span></>
            )}
          </p>
        </div>

        <button
          onClick={() => void onPush()}
          aria-label={pushOn ? 'Price alerts are on' : 'Turn on price alerts'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: pushOn ? `${P.violet}1F` : 'transparent',
            color: pushOn ? P.violet : P.muted,
            border: `1px solid ${pushOn ? P.violet : P.border}`,
            borderRadius: 999, padding: '7px 12px', cursor: 'pointer',
            fontSize: 12.5, fontWeight: 600, fontFamily: P.body,
          }}
        >
          {pushOn ? <Bell size={14} /> : <BellOff size={14} />}
          {pushOn ? 'Alerts on' : 'Alerts off'}
        </button>
      </header>

      <main style={{ padding: '0 14px 100px' }}>
        {isStale(sources) && (
          <div style={{
            display: 'flex', gap: 9, alignItems: 'flex-start',
            background: `${P.amber}14`, border: `1px solid ${P.amber}40`,
            borderRadius: 12, padding: '10px 12px', marginBottom: 12,
          }}>
            <AlertTriangle size={15} color={P.amber} style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ margin: 0, fontSize: 12, color: P.sub, lineHeight: 1.45 }}>
              Prices have not refreshed in over a day, so what you see below may be out of date.
            </p>
          </div>
        )}

        {loading ? (
          <p style={{ color: P.muted, fontSize: 13, padding: '30px 4px' }}>Loading…</p>
        ) : items.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '52px 22px',
            border: `1px dashed ${P.border}`, borderRadius: 16,
          }}>
            <Tag size={26} color={P.violet} />
            <h2 style={{
              margin: '12px 0 6px', fontFamily: P.display, fontSize: 17, fontWeight: 700,
            }}>
              Watch a price
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: P.sub, lineHeight: 1.5 }}>
              Add something from Takealot and Price Watch records what it really costs,
              day by day — so when a sale turns up you can tell whether it is one.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {ordered.map(item => (
              <ProductCard
                key={item.track.id}
                item={item}
                onSetTarget={(id, t) => void onSetTarget(id, t)}
                onRemove={id => void onRemove(id)}
              />
            ))}
          </div>
        )}
      </main>

      <button
        onClick={() => setAdding(true)}
        aria-label="Add a product"
        style={{
          position: 'fixed', right: 18,
          bottom: 'calc(18px + env(safe-area-inset-bottom))',
          width: 52, height: 52, borderRadius: 26,
          background: P.violet, color: P.bg, border: 'none',
          display: 'grid', placeItems: 'center', cursor: 'pointer',
          boxShadow: '0 8px 24px #0007', zIndex: 30,
        }}
      >
        <Plus size={24} />
      </button>

      <AddSheet
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={hit => void onAdd(hit)}
        tracked={trackedKeys}
      />
    </div>
  );
}
