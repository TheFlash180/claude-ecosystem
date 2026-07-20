import { useState } from 'react';
import { Recycle } from 'lucide-react';
import { DAY_NAMES, K, type PlanSlot, type Recipe, type Slot } from '../lib/config';
import { leftoverCandidates } from '../lib/plan';

// Bottom sheet: pick a recipe for a slot, then optionally "cook double" —
// the same recipe lands in a later empty slot marked as leftovers.

export function RecipePicker({ day, slot, recipes, slots, onSave, onClose }: {
  day: number;
  slot: Slot;
  recipes: Recipe[];
  slots: PlanSlot[];
  onSave: (recipe: Recipe, leftover: { day: number; slot: Slot } | null) => void;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<Recipe | null>(null);
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const matches = recipes.filter(r => !q || r.name.toLowerCase().includes(q));
  // Recipes tagged for this slot first, 'any' next, the rest after.
  const rank = (r: Recipe) => (r.mealType === slot ? 0 : r.mealType === 'any' ? 1 : 2);
  const sorted = [...matches].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

  const candidates = leftoverCandidates(slots, day, slot).slice(0, 6);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(59,46,32,0.45)', display: 'flex', alignItems: 'flex-end',
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: K.bg, width: '100%', maxWidth: 520, margin: '0 auto',
          borderRadius: '18px 18px 0 0', padding: '16px 16px calc(20px + env(safe-area-inset-bottom))',
          maxHeight: '78vh', overflowY: 'auto', border: `1px solid ${K.border}`, borderBottom: 'none',
        }}>
        <div style={{ fontFamily: K.display, fontSize: 19, fontWeight: 700, color: K.text, marginBottom: 2 }}>
          {chosen ? 'Cook double?' : `${DAY_NAMES[day]} ${slot}`}
        </div>

        {!chosen ? (
          <>
            <div style={{ fontSize: 12, color: K.sub, marginBottom: 10 }}>
              Pick a recipe — {slot} favourites first.
            </div>
            <input
              placeholder="Search recipes…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box', marginBottom: 10,
                background: K.surface, border: `1px solid ${K.border}`, borderRadius: 10,
                padding: '10px 12px', fontFamily: K.body, fontSize: 14, color: K.text,
              }}
            />
            {sorted.map(r => (
              <button
                key={r.id}
                onClick={() => setChosen(r)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  background: K.surface, border: `1px solid ${K.border}`, borderRadius: 12,
                  padding: '11px 13px', marginBottom: 7, cursor: 'pointer', textAlign: 'left',
                }}>
                <span style={{ fontSize: 20 }}>{r.emoji}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: K.body, fontSize: 14, fontWeight: 600, color: K.text }}>
                    {r.name}
                  </span>
                  <span style={{ fontSize: 11, color: K.muted }}>
                    serves {r.serves}{r.mealType !== 'any' ? ` · ${r.mealType}` : ''}
                  </span>
                </span>
              </button>
            ))}
            {sorted.length === 0 && (
              <div style={{ color: K.muted, fontSize: 13, textAlign: 'center', padding: 18 }}>
                No recipes match — add it on the Recipes tab first.
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: K.sub, margin: '2px 0 12px', lineHeight: 1.5 }}>
              {chosen.emoji} <b>{chosen.name}</b> it is. Cook a double batch and
              the leftovers fill another slot — the shopping list doubles the
              ingredients automatically.
            </div>
            {candidates.map(c => (
              <button
                key={`${c.day}|${c.slot}`}
                onClick={() => onSave(chosen, c)}
                style={{
                  width: '100%', textAlign: 'left', cursor: 'pointer',
                  background: K.surface, border: `1px solid ${K.sage}66`, borderRadius: 12,
                  padding: '11px 13px', marginBottom: 7,
                  fontFamily: K.body, fontSize: 13.5, fontWeight: 600, color: K.sage,
                  display: 'flex', alignItems: 'center', gap: 7,
                }}>
                <Recycle size={14} strokeWidth={2.2} /> Leftovers → {DAY_NAMES[c.day]} {c.slot}
              </button>
            ))}
            <button
              onClick={() => onSave(chosen, null)}
              style={{
                display: 'block', width: '100%', cursor: 'pointer',
                background: `linear-gradient(135deg, ${K.terra}, ${K.terraDark})`,
                border: 'none', borderRadius: 12, padding: '12px 13px', marginTop: 4,
                fontFamily: K.body, fontSize: 14, fontWeight: 700, color: '#fff',
              }}>
              Just this meal
            </button>
            <button
              onClick={() => setChosen(null)}
              style={{
                display: 'block', width: '100%', cursor: 'pointer', marginTop: 8,
                background: 'transparent', border: 'none',
                fontFamily: K.body, fontSize: 12.5, color: K.sub,
              }}>
              ← pick a different recipe
            </button>
          </>
        )}
      </div>
    </div>
  );
}
