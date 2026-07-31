import { useState } from 'react';
import { MapPin, Trash2, Type, X } from 'lucide-react';
import { F, MONTECASINO, RADIUS_OPTIONS, type Watch, type WatchKind } from '../lib/config';

export type WatchDraft = Omit<Watch, 'id'> & { id: string | null };

export function emptyWatch(): WatchDraft {
  return {
    id: null, label: '', kind: 'geo',
    lat: MONTECASINO.lat, lng: MONTECASINO.lng, radiusKm: 15,
    term: null, enabled: true,
  };
}

const inputStyle = {
  width: '100%', background: F.bg, color: F.text,
  border: `1px solid ${F.border}`, borderRadius: 9,
  fontFamily: F.body, fontSize: 14, padding: '10px 11px',
  WebkitAppearance: 'none' as const,
};

export function WatchSheet({ initial, onSave, onDelete, onClose }: {
  initial: WatchDraft;
  onSave: (w: WatchDraft) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [d, setD] = useState<WatchDraft>(initial);
  const set = (patch: Partial<WatchDraft>) => setD(prev => ({ ...prev, ...patch }));
  const valid = d.label.trim() !== ''
    && (d.kind === 'geo' ? d.radiusKm !== null : (d.term ?? '').trim() !== '');

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(4,3,8,0.78)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: F.surface, border: `1px solid ${F.border}`,
          borderRadius: '18px 18px 0 0', width: '100%', maxWidth: 520,
          maxHeight: '90vh', overflowY: 'auto',
          padding: '16px 16px calc(16px + env(safe-area-inset-bottom))',
        }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14,
        }}>
          <span style={{
            fontFamily: F.display, fontSize: 19, fontWeight: 700, color: F.text,
          }}>
            {initial.id ? 'Edit watch' : 'Add a watch'}
          </span>
          <button onClick={onClose} aria-label="Close" style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: F.muted, padding: 6, display: 'flex',
          }}>
            <X size={19} />
          </button>
        </div>

        {/* Kind */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {([
            { k: 'geo' as WatchKind, label: 'Near a place', Icon: MapPin },
            { k: 'keyword' as WatchKind, label: 'Keyword', Icon: Type },
          ]).map(({ k, label, Icon }) => {
            const on = d.kind === k;
            return (
              <button key={k} type="button" onClick={() => set({ kind: k })} style={{
                flex: 1, cursor: 'pointer', borderRadius: 11, padding: '10px 0',
                border: `1px solid ${on ? F.pink : F.border}`,
                background: on ? `${F.pink}1A` : 'transparent',
                color: on ? F.pink : F.sub,
                fontFamily: F.body, fontSize: 13, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <Icon size={14} strokeWidth={2.2} /> {label}
              </button>
            );
          })}
        </div>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: F.sub, marginBottom: 5 }}>
            Name it
          </span>
          <input style={inputStyle} value={d.label} placeholder="Montecasino"
            onChange={e => set({ label: e.target.value })} />
        </label>

        {d.kind === 'geo' ? (
          <>
            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: F.sub, marginBottom: 5 }}>
                How far
              </span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {RADIUS_OPTIONS.map(r => {
                  const on = Number(d.radiusKm) === r;
                  return (
                    <button key={r} type="button" onClick={() => set({ radiusKm: r })} style={{
                      cursor: 'pointer', borderRadius: 999, padding: '6px 13px',
                      border: `1px solid ${on ? F.pink : F.border}`,
                      background: on ? `${F.pink}1F` : 'transparent',
                      color: on ? F.pink : F.sub,
                      fontFamily: F.body, fontSize: 12.5, fontWeight: 600,
                    }}>
                      {r} km
                    </button>
                  );
                })}
              </div>
            </label>

            <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
              <label style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: F.sub, marginBottom: 5 }}>
                  Latitude
                </span>
                <input style={inputStyle} inputMode="decimal" value={d.lat ?? ''}
                  onChange={e => set({ lat: e.target.value === '' ? null : Number(e.target.value) })} />
              </label>
              <label style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: F.sub, marginBottom: 5 }}>
                  Longitude
                </span>
                <input style={inputStyle} inputMode="decimal" value={d.lng ?? ''}
                  onChange={e => set({ lng: e.target.value === '' ? null : Number(e.target.value) })} />
              </label>
            </div>
            <button
              type="button"
              onClick={() => set({ lat: MONTECASINO.lat, lng: MONTECASINO.lng })}
              style={{
                background: 'transparent', border: `1px dashed ${F.border}`, color: F.sub,
                borderRadius: 9, padding: '8px 12px', cursor: 'pointer',
                fontFamily: F.body, fontSize: 12, marginBottom: 4,
              }}>
              Use Montecasino
            </button>
          </>
        ) : (
          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: F.sub, marginBottom: 5 }}>
              Word to look for
              <span style={{ color: F.muted, fontWeight: 400 }}> · matches title, venue and blurb</span>
            </span>
            <input style={inputStyle} value={d.term ?? ''} placeholder="Spider-Man"
              onChange={e => set({ term: e.target.value })} />
          </label>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          {onDelete && (
            <button onClick={onDelete} aria-label="Delete watch" style={{
              border: `1px solid ${F.border}`, background: 'transparent', color: F.red,
              borderRadius: 11, padding: '13px 15px', cursor: 'pointer', display: 'flex',
            }}>
              <Trash2 size={15} strokeWidth={2.2} />
            </button>
          )}
          <button onClick={() => onSave(d)} disabled={!valid} style={{
            flex: 1, border: 'none', borderRadius: 11, padding: '13px 0',
            cursor: valid ? 'pointer' : 'not-allowed', opacity: valid ? 1 : 0.5,
            background: F.pink, color: '#1B0713',
            fontFamily: F.body, fontSize: 14, fontWeight: 700,
          }}>
            Save watch
          </button>
        </div>
      </div>
    </div>
  );
}
