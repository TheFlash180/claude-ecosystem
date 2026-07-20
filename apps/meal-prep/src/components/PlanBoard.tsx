import { Moon, Recycle, Sun, X } from 'lucide-react';
import { DAY_NAMES, K, SLOTS, type PlanSlot, type Recipe, type Slot } from '../lib/config';
import { dayDate, fmtDay, sastDay } from '../lib/plan';

// The week board: 7 day cards, each with a lunch and dinner row. Tapping a
// row opens the recipe picker; the ✕ clears it.

export function PlanBoard({ weekStart, slots, recipes, onPick, onClear }: {
  weekStart: string;
  slots: PlanSlot[];
  recipes: Map<string, Recipe>;
  onPick: (day: number, slot: Slot) => void;
  onClear: (day: number, slot: Slot) => void;
}) {
  const today = sastDay();
  const byKey = new Map(slots.map(s => [`${s.day}|${s.slot}`, s]));

  return (
    <div>
      {DAY_NAMES.map((name, day) => {
        const date = dayDate(weekStart, day);
        const isToday = date === today;
        return (
          <div key={day} style={{
            background: K.surface, border: `1px solid ${isToday ? K.terra : K.border}`,
            borderRadius: 14, marginBottom: 10, overflow: 'hidden',
            boxShadow: isToday ? `0 2px 10px ${K.terra}22` : 'none',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              padding: '9px 14px 7px', borderBottom: `1px solid ${K.border}`,
              background: isToday ? `${K.terra}0E` : K.raised,
            }}>
              <span style={{
                fontFamily: K.display, fontSize: 16, fontWeight: 700,
                color: isToday ? K.terra : K.text,
              }}>
                {name}
              </span>
              <span style={{ fontSize: 11.5, color: isToday ? K.terra : K.muted, fontWeight: isToday ? 700 : 400 }}>
                {isToday ? 'today' : fmtDay(date)}
              </span>
            </div>

            {SLOTS.map(({ key, label }) => {
              const filled = byKey.get(`${day}|${key}`);
              const recipe = filled ? recipes.get(filled.recipeId) : undefined;
              const SlotIcon = key === 'lunch' ? Sun : Moon;
              return (
                <div key={key} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px',
                  borderTop: key === 'dinner' ? `1px dashed ${K.border}` : 'none',
                }}>
                  <span style={{
                    fontSize: 10, color: K.muted, width: 58, flexShrink: 0,
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    <SlotIcon size={11} strokeWidth={2.2} /> {label}
                  </span>
                  <button
                    onClick={() => onPick(day, key)}
                    style={{
                      flex: 1, textAlign: 'left', cursor: 'pointer', minWidth: 0,
                      background: 'transparent', border: 'none', padding: 0,
                      fontFamily: K.body, fontSize: 14,
                      color: recipe ? K.text : K.muted,
                      fontWeight: recipe ? 600 : 400,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                    {recipe
                      ? <>{recipe.emoji} {recipe.name}{filled?.isLeftover && (
                          <span style={{ color: K.sage, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {' · '}<Recycle size={11} strokeWidth={2.2} style={{ verticalAlign: '-1px' }} /> leftovers
                          </span>
                        )}</>
                      : '+ plan a meal'}
                  </button>
                  {filled && (
                    <button
                      onClick={() => onClear(day, key)}
                      aria-label={`Clear ${label.toLowerCase()}`}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: K.muted, padding: '2px 4px', flexShrink: 0,
                        display: 'flex', alignItems: 'center',
                      }}>
                      <X size={15} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
