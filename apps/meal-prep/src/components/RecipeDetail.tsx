import { Check, Clock, Minus, Plus, Users, X } from 'lucide-react';
import { K, MAX_SERVES, MIN_SERVES, type Recipe } from '../lib/config';
import { timeLabel } from '../lib/recipes';
import { formatQty, scaleRecipe } from '../lib/scale';

function qtyLabel(q: number | string, u: string): string {
  const s = typeof q === 'number' ? formatQty(q) : q.trim();
  if (s === '' || s === '0') return u.trim();
  return u.trim() ? `${s} ${u.trim()}` : s;
}

export function RecipeDetail({
  recipe, onClose, onCook, onUncook, inList, servings, onServings,
}: {
  recipe: Recipe;
  onClose: () => void;
  onCook: () => void;
  onUncook: () => void;
  inList: boolean;
  servings: number;
  onServings: (n: number) => void;
}) {
  const time = timeLabel(recipe.totalMinutes);
  const scaled = scaleRecipe(recipe, servings);
  const isScaled = recipe.scalable && scaled.servings !== recipe.serves;

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
              display: 'flex', gap: 12, marginTop: 6, alignItems: 'center', flexWrap: 'wrap',
              fontSize: 12.5, color: K.sub, fontFamily: K.body,
            }}>
              {recipe.scalable ? (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 2,
                  border: `1px solid ${isScaled ? K.terra : K.border}`,
                  borderRadius: 20, padding: '1px 3px',
                }}>
                  <Step
                    label="One fewer serving"
                    disabled={servings <= MIN_SERVES}
                    onClick={() => onServings(servings - 1)}
                  >
                    <Minus size={13} />
                  </Step>
                  <span style={{
                    minWidth: 70, textAlign: 'center', fontWeight: 600,
                    color: isScaled ? K.terraDark : K.text,
                  }}>
                    Serves {servings}
                  </span>
                  <Step
                    label="One more serving"
                    disabled={servings >= MAX_SERVES}
                    onClick={() => onServings(servings + 1)}
                  >
                    <Plus size={13} />
                  </Step>
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Users size={13} /> Serves {recipe.serves}
                </span>
              )}
              {time && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={13} /> {time}
                </span>
              )}
              {isScaled && (
                <button
                  onClick={() => onServings(recipe.serves)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    color: K.muted, fontFamily: K.body, fontSize: 12,
                    textDecoration: 'underline',
                  }}
                >
                  reset to {recipe.serves}
                </button>
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

          {isScaled && (
            <p style={{
              margin: '0 0 14px', padding: '9px 11px', borderRadius: 10,
              background: `${K.honey}14`, border: `1px solid ${K.honey}44`,
              fontFamily: K.body, fontSize: 12.5, color: K.sub, lineHeight: 1.5,
            }}>
              Scaled for {servings} from {recipe.serves}. Cooking times, oven
              temperatures and dish sizes have <strong>not</strong> changed — go
              by how it looks rather than the clock.
            </p>
          )}

          <h3 style={sectionTitle}>Ingredients</h3>
          <ul style={{ margin: '0 0 20px', padding: 0, listStyle: 'none' }}>
            {scaled.ingredients.map((i, n) => (
              <li key={`${i.n}-${n}`} style={{
                display: 'flex', justifyContent: 'space-between', gap: 12,
                padding: '7px 0', borderBottom: `1px solid ${K.border}66`,
                fontFamily: K.body, fontSize: 14, color: K.text,
              }}>
                <span>{i.n}</span>
                <span style={{ color: K.sub, whiteSpace: 'nowrap' }}>{qtyLabel(i.q, i.u)}</span>
              </li>
            ))}
            {scaled.ingredients.length === 0 && (
              <li style={{ fontFamily: K.body, fontSize: 13.5, color: K.muted }}>
                No ingredients listed yet.
              </li>
            )}
          </ul>

          <h3 style={sectionTitle}>Method</h3>
          {scaled.steps.length > 0 ? (
            <ol style={{ margin: 0, padding: 0, listStyle: 'none', counterReset: 'step' }}>
              {scaled.steps.map((s, n) => (
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
                    : <><Plus size={16} /> We're making this{isScaled ? ` for ${servings}` : ''}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({ label, disabled, onClick, children }: {
  label: string; disabled: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        display: 'grid', placeItems: 'center', width: 26, height: 26,
        borderRadius: 13, border: 'none', background: 'transparent',
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? K.border : K.terraDark,
      }}
    >
      {children}
    </button>
  );
}

const sectionTitle: React.CSSProperties = {
  margin: '0 0 10px', fontFamily: K.body, fontSize: 11.5, fontWeight: 700,
  letterSpacing: '0.09em', textTransform: 'uppercase', color: K.muted,
};
