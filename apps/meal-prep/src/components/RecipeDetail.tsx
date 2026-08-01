import { Check, Clock, Plus, Users, X } from 'lucide-react';
import { K, type Recipe } from '../lib/config';
import { timeLabel } from '../lib/recipes';

function qtyLabel(q: number | string, u: string): string {
  const s = typeof q === 'number' ? String(q) : q.trim();
  if (s === '' || s === '0') return u.trim();
  return u.trim() ? `${s} ${u.trim()}` : s;
}

export function RecipeDetail({ recipe, onClose, onCook, onUncook, inList }: {
  recipe: Recipe;
  onClose: () => void;
  onCook: () => void;
  onUncook: () => void;
  inList: boolean;
}) {
  const time = timeLabel(recipe.totalMinutes);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={recipe.name}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: '#2A1F1499', zIndex: 60,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: K.surface, width: '100%', maxWidth: 560,
          maxHeight: '92vh', borderRadius: '20px 20px 0 0',
          display: 'flex', flexDirection: 'column',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <header style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '16px 16px 12px', borderBottom: `1px solid ${K.border}`,
        }}>
          <span style={{ fontSize: 30, lineHeight: 1 }} aria-hidden="true">{recipe.emoji}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{
              margin: 0, fontFamily: K.display, fontSize: 20, fontWeight: 600,
              color: K.text, lineHeight: 1.2,
            }}>
              {recipe.name}
            </h2>
            <div style={{
              display: 'flex', gap: 12, marginTop: 6,
              fontSize: 12.5, color: K.sub, fontFamily: K.body,
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Users size={13} /> Serves {recipe.serves}
              </span>
              {time && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={13} /> {time}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{
            background: 'transparent', border: 'none', color: K.muted,
            cursor: 'pointer', padding: 4,
          }}>
            <X size={20} />
          </button>
        </header>

        <div style={{ overflowY: 'auto', padding: '14px 16px 18px' }}>
          {recipe.notes && (
            <p style={{
              margin: '0 0 16px', fontFamily: K.body, fontSize: 13.5,
              color: K.sub, lineHeight: 1.5, fontStyle: 'italic',
            }}>
              {recipe.notes}
            </p>
          )}

          <h3 style={sectionTitle}>Ingredients</h3>
          <ul style={{ margin: '0 0 20px', padding: 0, listStyle: 'none' }}>
            {recipe.ingredients.map((i, n) => (
              <li key={`${i.n}-${n}`} style={{
                display: 'flex', justifyContent: 'space-between', gap: 12,
                padding: '7px 0', borderBottom: `1px solid ${K.border}66`,
                fontFamily: K.body, fontSize: 14, color: K.text,
              }}>
                <span>{i.n}</span>
                <span style={{ color: K.sub, whiteSpace: 'nowrap' }}>{qtyLabel(i.q, i.u)}</span>
              </li>
            ))}
            {recipe.ingredients.length === 0 && (
              <li style={{ fontFamily: K.body, fontSize: 13.5, color: K.muted }}>
                No ingredients listed yet.
              </li>
            )}
          </ul>

          <h3 style={sectionTitle}>Method</h3>
          {recipe.steps.length > 0 ? (
            <ol style={{ margin: 0, padding: 0, listStyle: 'none', counterReset: 'step' }}>
              {recipe.steps.map((s, n) => (
                <li key={n} style={{ display: 'flex', gap: 11, marginBottom: 14 }}>
                  <span style={{
                    flexShrink: 0, width: 24, height: 24, borderRadius: 12,
                    background: K.raised, color: K.terraDark,
                    display: 'grid', placeItems: 'center',
                    fontFamily: K.body, fontSize: 12.5, fontWeight: 700,
                  }}>
                    {n + 1}
                  </span>
                  <span style={{
                    fontFamily: K.body, fontSize: 14.5, color: K.text, lineHeight: 1.5,
                  }}>
                    {s}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p style={{ margin: 0, fontFamily: K.body, fontSize: 13.5, color: K.muted }}>
              No method written for this one yet.
            </p>
          )}
        </div>

        <div style={{ padding: '12px 16px 16px', borderTop: `1px solid ${K.border}` }}>
          <button
            onClick={inList ? onUncook : onCook}
            style={{
              width: '100%', display: 'inline-flex', alignItems: 'center',
              justifyContent: 'center', gap: 7,
              background: inList ? 'transparent' : K.terra,
              color: inList ? K.terraDark : '#fff',
              border: `1.5px solid ${inList ? K.terra : K.terra}`,
              borderRadius: 12, padding: '12px 16px', cursor: 'pointer',
              fontFamily: K.body, fontSize: 14.5, fontWeight: 600,
            }}
          >
            {inList ? <><Check size={16} /> On the list — tap to remove</>
                    : <><Plus size={16} /> We're making this</>}
          </button>
        </div>
      </div>
    </div>
  );
}

const sectionTitle: React.CSSProperties = {
  margin: '0 0 10px', fontFamily: K.body, fontSize: 11.5, fontWeight: 700,
  letterSpacing: '0.09em', textTransform: 'uppercase', color: K.muted,
};
