import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AlertTriangle, BellRing, Eye, Plus, RefreshCw } from 'lucide-react';
import { F, type FrontRowEvent, type SourceHealth, type Watch } from './lib/config';
import { matchesWatch, matchingEvents } from './lib/match';
import {
  deleteWatch, fetchEvents, fetchSources, fetchWatches, registerPush,
  saveWatch, seedDefaultWatch,
} from './lib/store';
import { EventCard } from './components/EventCard';
import { WatchSheet, emptyWatch, type WatchDraft } from './components/WatchSheet';

const STALE_HOURS = 36;

export default function App() {
  const [events, setEvents] = useState<FrontRowEvent[]>([]);
  const [watches, setWatches] = useState<Watch[]>([]);
  const [sources, setSources] = useState<SourceHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null); // watch id, null = all
  const [draft, setDraft] = useState<WatchDraft | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const refresh = useCallback(async () => {
    // A fresh device gets the Montecasino watch before its first render, so the
    // app opens with something on screen rather than an empty state.
    let mine = await fetchWatches();
    if (mine.length === 0) {
      await seedDefaultWatch();
      mine = await fetchWatches();
    }
    const [evs, srcs] = await Promise.all([fetchEvents(), fetchSources()]);
    setWatches(mine);
    setEvents(evs);
    setSources(srcs);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const visible = useMemo(() => {
    const active = selected ? watches.filter(w => w.id === selected) : watches;
    return matchingEvents(events, active);
  }, [events, watches, selected]);

  const countFor = useCallback(
    (w: Watch) => events.filter(e => matchesWatch(e, { ...w, enabled: true })).length,
    [events],
  );

  const stale = sources.filter(s => {
    if (!s.enabled) return false;
    if (s.lastError) return true;
    if (!s.lastOkAt) return true;
    return Date.parse(s.lastOkAt) < Date.now() - STALE_HOURS * 3600000;
  });

  const onSave = async (w: WatchDraft) => {
    setDraft(null);
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
    } catch { /* unsupported */ }
    await registerPush();
    if (!(await saveWatch(w))) return showToast("Couldn't save — try again.");
    await refresh();
    showToast(w.id ? 'Watch updated' : 'Watch added');
  };

  const onDelete = async (id: string) => {
    setDraft(null);
    if (!(await deleteWatch(id))) return showToast("Couldn't delete — try again.");
    if (selected === id) setSelected(null);
    await refresh();
    showToast('Watch removed');
  };

  return (
    <div style={{
      background: F.bg, minHeight: '100vh', fontFamily: F.body,
      maxWidth: 560, margin: '0 auto', color: F.text,
    }}>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: ${F.bg}; }
        button:focus-visible, input:focus-visible, a:focus-visible {
          outline: 2px solid ${F.pink}; outline-offset: 2px;
        }
      `}</style>

      {toast && (
        <div style={{
          position: 'fixed', top: 'calc(14px + env(safe-area-inset-top))', left: '50%',
          transform: 'translateX(-50%)', zIndex: 200,
          background: '#1B1027', border: `1px solid ${F.pink}`, color: F.text,
          padding: '11px 20px', borderRadius: 24, fontSize: 13.5, fontWeight: 500,
          boxShadow: '0 4px 24px rgba(0,0,0,0.6)', whiteSpace: 'nowrap', pointerEvents: 'none',
        } as CSSProperties}>
          {toast}
        </div>
      )}

      {draft && (
        <WatchSheet
          initial={draft}
          onSave={w => void onSave(w)}
          onDelete={draft.id ? () => void onDelete(draft.id!) : undefined}
          onClose={() => setDraft(null)}
        />
      )}

      <header style={{
        padding: 'calc(18px + env(safe-area-inset-top)) 16px 12px',
        borderBottom: `1px solid ${F.border}`,
        position: 'sticky', top: 0, zIndex: 10,
        background: `${F.bg}F2`, backdropFilter: 'blur(9px)', WebkitBackdropFilter: 'blur(9px)',
      }}>
        <div style={{
          fontFamily: F.display, fontSize: 25, fontWeight: 700, letterSpacing: '-0.02em',
          background: `linear-gradient(100deg, ${F.pink} 0%, ${F.gold} 130%)`,
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        }}>
          Front Row
        </div>
        <div style={{ fontSize: 11.5, color: F.muted, marginTop: 3 }}>
          Events near you, before they sell out
        </div>

        {/* Watch filters */}
        <div style={{ display: 'flex', gap: 7, marginTop: 12, overflowX: 'auto', paddingBottom: 2 }}>
          <Chip label="All" count={matchingEvents(events, watches).length}
            on={selected === null} onClick={() => setSelected(null)} />
          {watches.map(w => (
            <Chip key={w.id} label={w.label} count={countFor(w)}
              on={selected === w.id} onClick={() => setSelected(w.id)}
              onLong={() => setDraft({ ...w, id: w.id })} />
          ))}
          <button
            onClick={() => setDraft(emptyWatch())}
            aria-label="Add a watch"
            style={{
              flexShrink: 0, cursor: 'pointer', borderRadius: 999, padding: '7px 12px',
              border: `1px dashed ${F.border}`, background: 'transparent', color: F.sub,
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontFamily: F.body, fontSize: 12.5, fontWeight: 600,
            }}>
            <Plus size={13} strokeWidth={2.4} /> Watch
          </button>
        </div>
      </header>

      <main style={{ padding: '14px 14px 44px' }}>
        {/* A source that has stopped working says so, rather than going quiet. */}
        {stale.length > 0 && (
          <div style={{
            display: 'flex', gap: 9, alignItems: 'flex-start',
            background: `${F.red}12`, border: `1px solid ${F.red}44`,
            borderRadius: 12, padding: '11px 12px', marginBottom: 12,
            fontSize: 12, color: F.sub, lineHeight: 1.5,
          }}>
            <AlertTriangle size={15} strokeWidth={2.2} color={F.red} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              <strong style={{ color: F.text }}>
                {stale.map(s => s.label).join(', ')} {stale.length > 1 ? 'are' : 'is'} not updating.
              </strong>{' '}
              Listings from {stale.length > 1 ? 'these sources' : 'this source'} may be missing.
            </span>
          </div>
        )}

        {loading ? (
          <p style={{ color: F.sub, fontSize: 13, textAlign: 'center', padding: 40 }}>
            Checking what's on…
          </p>
        ) : visible.length === 0 ? (
          <EmptyState hasWatches={watches.length > 0} onAdd={() => setDraft(emptyWatch())} />
        ) : (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 10, fontSize: 11.5, color: F.muted,
            }}>
              <span>{visible.length} event{visible.length === 1 ? '' : 's'}</span>
              <button onClick={() => void refresh()} aria-label="Refresh" style={{
                background: 'transparent', border: 'none', color: F.muted,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
                fontFamily: F.body, fontSize: 11.5,
              }}>
                <RefreshCw size={12} strokeWidth={2.2} /> Refresh
              </button>
            </div>
            {visible.map(e => <EventCard key={e.id} event={e} />)}
          </>
        )}

        <footer style={{
          marginTop: 24, paddingTop: 14, borderTop: `1px solid ${F.border}`,
          fontSize: 11, color: F.muted, lineHeight: 1.75,
        }}>
          <BellRing size={11} style={{ verticalAlign: -1 }} /> New listings matching a
          watch push to this device once a day. Sources refresh each morning
          {sources.length > 0 && (
            <> — {sources.map(s => `${s.label} (${s.lastCount ?? 0})`).join(', ')}</>
          )}.
          <br />
          Tap a watch chip to filter; tap and hold to edit it.
        </footer>
      </main>
    </div>
  );
}

function Chip({ label, count, on, onClick, onLong }: {
  label: string; count: number; on: boolean;
  onClick: () => void; onLong?: () => void;
}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const start = () => { if (onLong) timer = setTimeout(onLong, 550); };
  const stop = () => { if (timer) clearTimeout(timer); };

  return (
    <button
      onClick={onClick}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onContextMenu={e => { if (onLong) { e.preventDefault(); onLong(); } }}
      style={{
        flexShrink: 0, cursor: 'pointer', borderRadius: 999, padding: '7px 13px',
        border: `1px solid ${on ? F.pink : F.border}`,
        background: on ? `${F.pink}1F` : 'transparent',
        color: on ? F.pink : F.sub,
        fontFamily: F.body, fontSize: 12.5, fontWeight: 600,
        display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
      }}>
      {label}
      <span style={{ color: on ? F.pink : F.muted, fontWeight: 700, fontSize: 11 }}>{count}</span>
    </button>
  );
}

function EmptyState({ hasWatches, onAdd }: { hasWatches: boolean; onAdd: () => void }) {
  return (
    <div style={{
      background: F.surface, border: `1px dashed ${F.border}`, borderRadius: 14,
      padding: '22px 18px', textAlign: 'center', color: F.sub, fontSize: 13, lineHeight: 1.6,
    }}>
      <Eye size={22} strokeWidth={1.8} color={F.muted} style={{ marginBottom: 8 }} />
      <div>
        {hasWatches
          ? 'Nothing matches your watches yet. Widen a radius, or add a keyword watch.'
          : 'Add a watch to start seeing what is on near you.'}
      </div>
      <button onClick={onAdd} style={{
        marginTop: 14, cursor: 'pointer', border: 'none', borderRadius: 11,
        padding: '11px 18px', background: F.pink, color: '#1B0713',
        fontFamily: F.body, fontSize: 13.5, fontWeight: 700,
      }}>
        Add a watch
      </button>
    </div>
  );
}
