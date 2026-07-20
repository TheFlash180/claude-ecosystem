import { useState } from 'react';
import { PartyPopper, ShoppingBasket, X } from 'lucide-react';
import { K } from '../lib/config';
import type { ShoppingSection } from '../lib/plan';
import { CATEGORY_ICON } from './icons';

// The week's consolidated shopping list, grouped by aisle. Ticks sync to the
// cloud so both phones see the same list in the shop.

export function ShoppingList({ sections, onTick, onAddExtra, onRemoveExtra }: {
  sections: ShoppingSection[];
  onTick: (key: string, label: string, checked: boolean) => void;
  onAddExtra: (label: string) => void;
  onRemoveExtra: (key: string) => void;
}) {
  const [extra, setExtra] = useState('');

  const all = sections.flatMap(s => s.items);
  const done = all.filter(i => i.checked).length;

  const submitExtra = () => {
    const label = extra.trim();
    if (!label) return;
    setExtra('');
    onAddExtra(label);
  };

  return (
    <div>
      {all.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
          background: K.surface, border: `1px solid ${K.border}`, borderRadius: 12,
          padding: '10px 14px',
        }}>
          <div style={{ flex: 1, height: 6, background: K.raised, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              width: `${all.length ? (done / all.length) * 100 : 0}%`, height: '100%',
              background: done === all.length ? K.sage : K.terra, transition: 'width 0.2s',
            }} />
          </div>
          <span style={{ fontSize: 12, color: K.sub, fontWeight: 600, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {done}/{all.length}
            {done === all.length && all.length > 0 && <PartyPopper size={13} color={K.sage} />}
          </span>
        </div>
      )}

      {all.length === 0 && (
        <div style={{ color: K.muted, fontSize: 13.5, textAlign: 'center', padding: '36px 20px', lineHeight: 1.6 }}>
          <ShoppingBasket size={26} strokeWidth={1.6} style={{ marginBottom: 8 }} />
          <br />
          Nothing to buy yet — plan some meals on the Plan tab and the
          ingredients gather here automatically.
        </div>
      )}

      {sections.map(sec => {
        const SecIcon = CATEGORY_ICON[sec.category];
        return (
        <div key={sec.category} style={{ marginBottom: 16 }}>
          <div style={{
            fontFamily: K.display, fontSize: 14.5, fontWeight: 700, color: K.sub,
            margin: '0 2px 7px', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <SecIcon size={15} strokeWidth={2} /> {sec.label}
          </div>
          {sec.items.map(item => (
            <div key={item.key} style={{
              display: 'flex', alignItems: 'center', gap: 11,
              background: K.surface, border: `1px solid ${K.border}`, borderRadius: 11,
              padding: '9px 12px', marginBottom: 6,
              opacity: item.checked ? 0.55 : 1,
            }}>
              <input
                type="checkbox"
                checked={item.checked}
                onChange={e => onTick(item.key, item.label, e.target.checked)}
                style={{ width: 19, height: 19, accentColor: K.sage, flexShrink: 0, cursor: 'pointer' }}
              />
              <span style={{
                flex: 1, fontSize: 13.5, color: K.text,
                textDecoration: item.checked ? 'line-through' : 'none',
              }}>
                {item.label}
              </span>
              {item.custom && (
                <button
                  onClick={() => onRemoveExtra(item.key)}
                  aria-label="Remove item"
                  style={{ background: 'transparent', border: 'none', color: K.muted, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <X size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
        );
      })}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <input
          placeholder="Add something extra… (koeksisters?)"
          value={extra}
          onChange={e => setExtra(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submitExtra(); }}
          style={{
            flex: 1, background: K.surface, border: `1px solid ${K.border}`, borderRadius: 11,
            padding: '10px 12px', fontFamily: K.body, fontSize: 13.5, color: K.text, minWidth: 0,
          }}
        />
        <button
          onClick={submitExtra}
          disabled={!extra.trim()}
          style={{
            background: extra.trim() ? K.terra : K.raised, color: extra.trim() ? '#fff' : K.muted,
            border: 'none', borderRadius: 11, padding: '10px 16px', cursor: 'pointer',
            fontFamily: K.body, fontSize: 13.5, fontWeight: 700, flexShrink: 0,
          }}>
          Add
        </button>
      </div>
    </div>
  );
}
