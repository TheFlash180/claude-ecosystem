import { Check, Clock } from 'lucide-react';
import { K, type Recipe } from '../lib/config';
import { timeLabel } from '../lib/recipes';

export function RecipeGrid({ recipes, cookIds, onOpen }: {
  recipes: Recipe[];
  cookIds: Set<string>;
  onOpen: (r: Recipe) => void;
}) {
  if (recipes.length === 0) {
    return (
      <p style={{
        margin: '28px 4px', fontFamily: K.body, fontSize: 14,
        color: K.muted, textAlign: 'center',
      }}>
        Nothing matches. Try clearing the filters.
      </p>
    );
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10,
    }}>
      {recipes.map(r => {
        const chosen = cookIds.has(r.id);
        const time = timeLabel(r.totalMinutes);
        return (
          <button
            key={r.id}
            onClick={() => onOpen(r)}
            style={{
              position: 'relative', textAlign: 'left', cursor: 'pointer',
              background: K.surface,
              border: `1.5px solid ${chosen ? K.terra : K.border}`,
              borderRadius: 14, padding: '13px 12px',
              display: 'flex', flexDirection: 'column', gap: 8, minHeight: 108,
            }}
          >
            {chosen && (
              <span
                aria-label="On the cook list"
                style={{
                  position: 'absolute', top: 8, right: 8,
                  width: 20, height: 20, borderRadius: 10, background: K.terra,
                  display: 'grid', placeItems: 'center',
                }}
              >
                <Check size={13} color="#fff" />
              </span>
            )}
            <span style={{ fontSize: 26, lineHeight: 1 }} aria-hidden="true">{r.emoji}</span>
            <span style={{
              flex: 1, fontFamily: K.display, fontSize: 14.5, fontWeight: 600,
              color: K.text, lineHeight: 1.25,
            }}>
              {r.name}
            </span>
            {time && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontFamily: K.body, fontSize: 11.5, color: K.muted,
              }}>
                <Clock size={11} /> {time}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
