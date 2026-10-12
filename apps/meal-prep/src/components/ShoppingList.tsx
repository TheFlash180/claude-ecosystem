import { useState } from 'react';
import { Check, ChevronDown, PartyPopper, Plus, ShoppingBasket, X } from 'lucide-react';
import { K } from '../lib/config';
import { splitTrolley, type ShoppingItem, type ShoppingSection } from '../lib/recipes';
import { CATEGORY_ICON } from './icons';

// The consolidated shopping list for whatever is on the cook list, grouped by
// aisle. Ticks sync to the cloud so both phones see the same list in the shop.
//
// Built for one hand in a shop: the whole row is the tap target, the amount
// sits on the right where the eye can run down it, and a ticked item leaves
// its aisle for the trolley at the bottom, so the list only ever shows what
// is still to find.

export function ShoppingList({ sections, onTick, onAddExtra, onRemoveExtra, onBrowse }: {
  sections: ShoppingSection[];
  onTick: (key: string, label: string, checked: boolean) => void;
  onAddExtra: (label: string) => void;
  onRemoveExtra: (key: string) => void;
  onBrowse: () => void;
}) {
  const [extra, setExtra] = useState('');
  const [trolleyOpen, setTrolleyOpen] = useState(false);

  const { toBuy, inTrolley } = splitTrolley(sections);
  const total = toBuy.reduce((n, s) => n + s.items.length, 0) + inTrolley.length;
  const left = total - inTrolley.length;

  const submitExtra = () => {
    const label = extra.trim();
    if (!label) return;
    setExtra('');
    onAddExtra(label);
  };

  return (
    <div>
      {total > 0 && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 5, margin: '0 -14px 14px', padding: '8px 14px',
          background: `${K.bg}f2`, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: K.surface, border: `1px solid ${K.border}`, borderRadius: 14,
            padding: '11px 14px',
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: left ? K.text : K.sage, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {left
                ? <>{left} left to buy</>
                : <><PartyPopper size={16} /> All in the trolley</>}
            </span>
            <div style={{ flex: 1, height: 6, background: K.raised, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                width: `${(inTrolley.length / total) * 100}%`, height: '100%',
                background: left ? K.terra : K.sage, transition: 'width 0.25s',
              }} />
            </div>
          </div>
        </div>
      )}

      {total === 0 && (
        <div style={{ color: K.sub, fontSize: 14, textAlign: 'center', padding: '40px 20px 28px', lineHeight: 1.6 }}>
          <ShoppingBasket size={34} strokeWidth={1.5} color={K.muted} />
          <p style={{ margin: '10px 0 16px' }}>
            Nothing to buy yet. Open a recipe, tap <strong>We're making this</strong>,
            and its ingredients gather here — added up and sorted by aisle.
          </p>
          <button className="press" onClick={onBrowse} style={{
            background: K.terra, color: '#fff', border: 'none', borderRadius: 12,
            padding: '12px 20px', fontFamily: K.body, fontSize: 15, fontWeight: 600, cursor: 'pointer',
          }}>
            Choose recipes
          </button>
        </div>
      )}

      {toBuy.map(sec => {
        const SecIcon = CATEGORY_ICON[sec.category];
        return (
          <section key={sec.category} style={{ marginBottom: 18 }}>
            <h3 style={{
              fontFamily: K.display, fontSize: 15, fontWeight: 700, color: K.sub,
              margin: '0 2px 8px', display: 'flex', alignItems: 'center', gap: 7,
            }}>
              <SecIcon size={16} strokeWidth={2} /> {sec.label}
            </h3>
            <div style={{ background: K.surface, border: `1px solid ${K.border}`, borderRadius: 14, overflow: 'hidden' }}>
              {sec.items.map((item, n) => (
                <Row key={item.key} item={item} first={n === 0}
                     onTick={onTick} onRemoveExtra={onRemoveExtra} />
              ))}
            </div>
          </section>
        );
      })}

      {inTrolley.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <button
            onClick={() => setTrolleyOpen(o => !o)}
            aria-expanded={trolleyOpen}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8, minHeight: 44,
              background: 'transparent', border: 'none', padding: '0 2px', cursor: 'pointer',
              fontFamily: K.display, fontSize: 15, fontWeight: 700, color: K.sage,
            }}
          >
            <Check size={16} strokeWidth={2.5} /> In the trolley · {inTrolley.length}
            <ChevronDown size={16} style={{
              marginLeft: 'auto', color: K.muted,
              transform: trolleyOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s',
            }} />
          </button>
          {trolleyOpen && (
            <div style={{ background: K.surface, border: `1px solid ${K.border}`, borderRadius: 14, overflow: 'hidden', marginTop: 4 }}>
              {inTrolley.map((item, n) => (
                <Row key={item.key} item={item} first={n === 0}
                     onTick={onTick} onRemoveExtra={onRemoveExtra} />
              ))}
            </div>
          )}
        </section>
      )}

      <form
        onSubmit={e => { e.preventDefault(); submitExtra(); }}
        style={{ display: 'flex', gap: 8, marginTop: 6 }}
      >
        <input
          placeholder="Add something else… (koeksisters?)"
          value={extra}
          onChange={e => setExtra(e.target.value)}
          enterKeyHint="done"
          style={{
            flex: 1, background: K.surface, border: `1px solid ${K.border}`, borderRadius: 12,
            padding: '12px 13px', fontFamily: K.body, fontSize: 16, color: K.text, minWidth: 0,
          }}
        />
        <button
          type="submit"
          disabled={!extra.trim()}
          aria-label="Add to the list"
          className="press"
          style={{
            background: extra.trim() ? K.terra : K.raised, color: extra.trim() ? '#fff' : K.muted,
            border: 'none', borderRadius: 12, width: 48, flexShrink: 0, cursor: 'pointer',
            display: 'grid', placeItems: 'center',
          }}>
          <Plus size={20} />
        </button>
      </form>
    </div>
  );
}

function Row({ item, first, onTick, onRemoveExtra }: {
  item: ShoppingItem;
  first: boolean;
  onTick: (key: string, label: string, checked: boolean) => void;
  onRemoveExtra: (key: string) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', borderTop: first ? 'none' : `1px solid ${K.border}88` }}>
      <button
        role="checkbox"
        aria-checked={item.checked}
        onClick={() => onTick(item.key, item.label, !item.checked)}
        style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, minHeight: 52,
          background: 'transparent', border: 'none', padding: '10px 14px', cursor: 'pointer',
          textAlign: 'left', fontFamily: K.body,
        }}
      >
        <span style={{
          width: 24, height: 24, borderRadius: 12, flexShrink: 0,
          border: `2px solid ${item.checked ? K.sage : K.border}`,
          background: item.checked ? K.sage : 'transparent',
          display: 'grid', placeItems: 'center', transition: 'background 0.15s, border-color 0.15s',
        }}>
          {item.checked && <Check size={14} color="#fff" strokeWidth={3} />}
        </span>
        <span style={{
          flex: 1, minWidth: 0, fontSize: 15.5, color: item.checked ? K.muted : K.text,
          textDecoration: item.checked ? 'line-through' : 'none',
        }}>
          {item.name}
        </span>
        {item.qty && (
          <span style={{ fontSize: 14, color: K.sub, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            {item.qty}
          </span>
        )}
      </button>
      {item.custom && (
        <button
          onClick={() => onRemoveExtra(item.key)}
          aria-label={`Remove ${item.name}`}
          style={{
            width: 48, flexShrink: 0, background: 'transparent', border: 'none',
            color: K.muted, cursor: 'pointer', display: 'grid', placeItems: 'center',
          }}>
          <X size={17} />
        </button>
      )}
    </div>
  );
}
