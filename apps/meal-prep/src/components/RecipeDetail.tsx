import { useEffect, useState } from 'react';
import { Check, Clock, Minus, Plus, Snowflake, Tag, Users, X } from 'lucide-react';
import { K, MAX_SERVES, MIN_SERVES, type Recipe } from '../lib/config';
import { timeLabel } from '../lib/recipes';
import { bagLabel } from '../lib/freezer';
import { formatQty, scaleRecipe } from '../lib/scale';

function qtyLabel(q: number | string, u: string): string {
  const s = typeof q === 'number' ? formatQty(q) : q.trim();
  if (s === '' || s === '0') return u.trim();
  return u.trim() ? `${s} ${u.trim()}` : s;
}

/** Keeps the phone's screen on while a recipe is open. A screen that locks
 *  mid-method with floury hands is the most annoying thing about cooking from
 *  a phone. The lock is dropped whenever the page is hidden, so it is taken
 *  again on coming back. Returns whether the browser supports it at all. */
function useWakeLock(): boolean {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  useEffect(() => {
    if (!supported) return;
    let lock: { release: () => Promise<void> } | null = null;
    let gone = false;
    const take = async () => {
      try {
        if (document.visibilityState === 'visible' && !gone) {
          lock = await (navigator as any).wakeLock.request('screen');
        }
      } catch { /* refused (battery saver, no gesture yet) — nothing to do */ }
    };
    void take();
    const onVisible = () => { if (document.visibilityState === 'visible') void take(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => {});
    };
  }, [supported]);
  return supported;
}

/** Tap-to-tick for a list: which rows are done. Lives only as long as the
 *  sheet is open — it is "where am I in this recipe", not a record. */
function useTicks() {
  const [done, setDone] = useState<Set<number>>(new Set());
  const toggle = (n: number) => setDone(prev => {
    const next = new Set(prev);
    if (next.has(n)) next.delete(n); else next.add(n);
    return next;
  });
  return [done, toggle] as const;
}

export function RecipeDetail({
  recipe, onClose, onCook, onUncook, inList, servings, onServings, today,
}: {
  recipe: Recipe;
  /** SAST day, for the date on the freezer label. */
  today: string;
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
  const awake = useWakeLock();
  const [gotIng, tickIng] = useTicks();
  const [doneSteps, tickStep] = useTicks();
  const [doneFreeze, tickFreeze] = useTicks();
  const [doneReheat, tickReheat] = useTicks();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={recipe.name}
      onClick={onClose}
      className="backdrop"
      style={{
        position: 'fixed', inset: 0, background: '#2A1F1499', zIndex: 60,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="sheet"
        style={{
          background: K.surface, width: '100%', maxWidth: 560,
          maxHeight: '94dvh', borderRadius: '22px 22px 0 0',
          display: 'flex', flexDirection: 'column',
          paddingBottom: 'env(safe-area-inset-bottom)',
          boxShadow: '0 -8px 30px rgba(42,31,20,0.18)',
        }}
      >
        <div aria-hidden="true" style={{
          width: 40, height: 5, borderRadius: 3, background: K.border,
          margin: '8px auto 0', flexShrink: 0,
        }} />
        <header style={{
          display: 'flex', alignItems: 'flex-start', gap: 11,
          padding: '10px 14px 12px 16px', borderBottom: `1px solid ${K.border}`,
        }}>
          <span style={{ fontSize: 34, lineHeight: 1, marginTop: 2 }} aria-hidden="true">{recipe.emoji}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{
              margin: 0, fontFamily: K.display, fontSize: 21, fontWeight: 600,
              color: K.text, lineHeight: 1.2,
            }}>
              {recipe.name}
            </h2>
            <div style={{
              display: 'flex', gap: '6px 12px', marginTop: 8, alignItems: 'center', flexWrap: 'wrap',
              fontSize: 13, color: K.sub, fontFamily: K.body,
            }}>
              {recipe.scalable ? (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 2,
                  border: `1.5px solid ${isScaled ? K.terra : K.border}`,
                  borderRadius: 22, padding: 2, background: K.bg,
                }}>
                  <Step
                    label="One fewer serving"
                    disabled={servings <= MIN_SERVES}
                    onClick={() => onServings(servings - 1)}
                  >
                    <Minus size={16} />
                  </Step>
                  <span style={{
                    minWidth: 78, textAlign: 'center', fontWeight: 700, fontSize: 14,
                    color: isScaled ? K.terraDark : K.text,
                  }}>
                    Serves {servings}
                  </span>
                  <Step
                    label="One more serving"
                    disabled={servings >= MAX_SERVES}
                    onClick={() => onServings(servings + 1)}
                  >
                    <Plus size={16} />
                  </Step>
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Users size={14} /> Serves {recipe.serves}
                </span>
              )}
              {time && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={14} /> {time}
                </span>
              )}
              {recipe.freezer && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: K.sage }}>
                  <Snowflake size={14} /> Keeps {recipe.freezer.months} months
                </span>
              )}
              {isScaled && (
                <button
                  onClick={() => onServings(recipe.serves)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
                    color: K.muted, fontFamily: K.body, fontSize: 13,
                    textDecoration: 'underline',
                  }}
                >
                  reset to {recipe.serves}
                </button>
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="press" style={{
            width: 40, height: 40, borderRadius: 20, flexShrink: 0,
            background: K.raised, border: 'none', color: K.sub,
            cursor: 'pointer', display: 'grid', placeItems: 'center',
          }}>
            <X size={20} />
          </button>
        </header>

        <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', padding: '16px 16px 20px' }}>
          {recipe.notes && (
            <p style={{
              margin: '0 0 16px', fontFamily: K.body, fontSize: 14.5,
              color: K.sub, lineHeight: 1.55, fontStyle: 'italic',
            }}>
              {recipe.notes}
            </p>
          )}

          {isScaled && (
            <p style={{
              margin: '0 0 16px', padding: '10px 12px', borderRadius: 12,
              background: `${K.honey}14`, border: `1px solid ${K.honey}44`,
              fontFamily: K.body, fontSize: 13.5, color: K.sub, lineHeight: 1.5,
            }}>
              Scaled for {servings} from {recipe.serves}. Cooking times, oven
              temperatures and dish sizes have <strong>not</strong> changed — go
              by how it looks rather than the clock.
            </p>
          )}

          <h3 style={sectionTitle}>Ingredients</h3>
          <ul style={{ margin: '0 0 22px', padding: 0, listStyle: 'none' }}>
            {scaled.ingredients.map((i, n) => {
              const got = gotIng.has(n);
              return (
                <li key={`${i.n}-${n}`} style={{ borderBottom: `1px solid ${K.border}66` }}>
                  <button
                    role="checkbox"
                    aria-checked={got}
                    onClick={() => tickIng(n)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 11, minHeight: 46,
                      background: 'transparent', border: 'none', padding: '8px 0', cursor: 'pointer',
                      textAlign: 'left', fontFamily: K.body,
                    }}
                  >
                    <Tick on={got} />
                    <span style={{
                      flex: 1, fontSize: 15.5, color: got ? K.muted : K.text,
                      textDecoration: got ? 'line-through' : 'none',
                    }}>
                      {i.n}
                    </span>
                    <span style={{ fontSize: 15, color: got ? K.muted : K.sub, whiteSpace: 'nowrap' }}>
                      {qtyLabel(i.q, i.u)}
                    </span>
                  </button>
                </li>
              );
            })}
            {scaled.ingredients.length === 0 && (
              <li style={{ fontFamily: K.body, fontSize: 14, color: K.muted }}>
                No ingredients listed yet.
              </li>
            )}
          </ul>

          <h3 style={{ ...sectionTitle, marginBottom: 4 }}>Method</h3>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: K.muted }}>
            Tap a step when it is done{awake ? ' · the screen stays on while this is open' : ''}.
          </p>
          {scaled.steps.length > 0 ? (
            <StepList steps={scaled.steps} done={doneSteps} onTick={tickStep} />
          ) : (
            <p style={{ margin: 0, fontFamily: K.body, fontSize: 14, color: K.muted }}>
              No method written for this one yet.
            </p>
          )}

          {scaled.freezer && (
            <>
              <h3 style={{ ...sectionTitle, marginTop: 24, color: K.sage, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Snowflake size={13} /> Freeze it
              </h3>
              <StepList steps={scaled.freezer.freeze} done={doneFreeze} onTick={tickFreeze} accent={K.sage} />
              <div style={{
                display: 'flex', gap: 9, alignItems: 'flex-start',
                margin: '2px 0 22px', padding: '11px 12px', borderRadius: 12,
                background: `${K.sage}12`, border: `1px dashed ${K.sage}88`,
              }}>
                <Tag size={16} color={K.sage} style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontFamily: K.body, fontSize: 14, color: K.sub, lineHeight: 1.5 }}>
                  Write on the bag:{' '}
                  <strong style={{ color: K.text }}>
                    {bagLabel(recipe.name, today, scaled.freezer.months)}
                  </strong>
                </span>
              </div>

              <h3 style={{ ...sectionTitle, color: K.sage }}>From the freezer</h3>
              <StepList steps={scaled.freezer.reheat} done={doneReheat} onTick={tickReheat} accent={K.sage} />
            </>
          )}
        </div>

        <div style={{ padding: '10px 16px 14px', borderTop: `1px solid ${K.border}` }}>
          <button
            onClick={inList ? onUncook : onCook}
            className="press"
            style={{
              width: '100%', minHeight: 52, display: 'inline-flex', alignItems: 'center',
              justifyContent: 'center', gap: 8,
              background: inList ? `${K.sage}14` : K.terra,
              color: inList ? K.sage : '#fff',
              border: `1.5px solid ${inList ? K.sage : K.terra}`,
              borderRadius: 14, padding: '12px 16px', cursor: 'pointer',
              fontFamily: K.body, fontSize: 16, fontWeight: 600,
            }}
          >
            {inList ? <><Check size={18} /> On the shopping list · tap to remove</>
                    : <><Plus size={18} /> We're making this{isScaled ? ` for ${servings}` : ''}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function Tick({ on, accent = K.sage }: { on: boolean; accent?: string }) {
  return (
    <span aria-hidden="true" style={{
      width: 22, height: 22, borderRadius: 11, flexShrink: 0,
      border: `2px solid ${on ? accent : K.border}`, background: on ? accent : 'transparent',
      display: 'grid', placeItems: 'center', transition: 'background 0.15s, border-color 0.15s',
    }}>
      {on && <Check size={13} color="#fff" strokeWidth={3} />}
    </span>
  );
}

function StepList({ steps, done, onTick, accent = K.terraDark }: {
  steps: string[];
  done: Set<number>;
  onTick: (n: number) => void;
  accent?: string;
}) {
  return (
    <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {steps.map((s, n) => {
        const on = done.has(n);
        return (
          <li key={n} style={{ marginBottom: 6 }}>
            <button
              role="checkbox"
              aria-checked={on}
              onClick={() => onTick(n)}
              style={{
                width: '100%', display: 'flex', gap: 12, alignItems: 'flex-start',
                background: 'transparent', border: 'none', borderRadius: 12,
                padding: '8px 4px 8px 0', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{
                flexShrink: 0, width: 28, height: 28, borderRadius: 14,
                background: on ? K.sage : K.raised, color: on ? '#fff' : accent,
                display: 'grid', placeItems: 'center', marginTop: 1,
                fontFamily: K.body, fontSize: 13, fontWeight: 700,
                transition: 'background 0.15s',
              }}>
                {on ? <Check size={15} strokeWidth={3} /> : n + 1}
              </span>
              <span style={{
                fontFamily: K.body, fontSize: 16, lineHeight: 1.55,
                color: on ? K.muted : K.text,
              }}>
                {s}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
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
      className="press"
      style={{
        display: 'grid', placeItems: 'center', width: 36, height: 36,
        borderRadius: 18, border: 'none', background: 'transparent',
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? K.border : K.terraDark,
      }}
    >
      {children}
    </button>
  );
}

const sectionTitle: React.CSSProperties = {
  margin: '0 0 10px', fontFamily: K.body, fontSize: 12, fontWeight: 700,
  letterSpacing: '0.09em', textTransform: 'uppercase', color: K.muted,
};
