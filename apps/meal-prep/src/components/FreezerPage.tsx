import { useMemo, useState } from 'react';
import { ChevronDown, PackagePlus, Snowflake } from 'lucide-react';
import { FREEZER_COURSES, K, type FreezerCourse, type Recipe } from '../lib/config';
import { FREEZER_GUIDE, freezerShelves, suppliesToAdd } from '../lib/freezer';
import { RecipeGrid } from './RecipeGrid';

/** Cook now, eat after the birth. The recipes are ordinary book recipes with
 *  freezing steps on them, so choosing one here uses the same sheet, serving
 *  size and shopping list as everywhere else. */
export function FreezerPage({ recipes, cookIds, extras, onOpen, onAddSupplies }: {
  recipes: Recipe[];
  cookIds: Set<string>;
  /** Labels of the hand-added extras already on the shopping list. */
  extras: string[];
  onOpen: (r: Recipe) => void;
  onAddSupplies: (labels: string[]) => void;
}) {
  const [course, setCourse] = useState<FreezerCourse | 'all'>('all');
  const [guideOpen, setGuideOpen] = useState(false);
  const shelves = useMemo(() => freezerShelves(recipes, course), [recipes, course]);
  const total = useMemo(() => freezerShelves(recipes).reduce((n, s) => n + s.recipes.length, 0), [recipes]);
  const missing = suppliesToAdd(extras);

  return (
    <>
      <section style={{
        background: `${K.sage}10`, border: `1px solid ${K.sage}44`,
        borderRadius: 16, padding: '14px 14px 12px', marginBottom: 12,
      }}>
        <p style={{ margin: '0 0 12px', fontSize: 14.5, color: K.sub, lineHeight: 1.55, display: 'flex', gap: 10 }}>
          <Snowflake size={20} color={K.sage} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Open a recipe, choose how many portions, and tap <strong>We're making this</strong> —
            the ingredients go on the shopping list. Every recipe says how to freeze it
            and how to reheat it.
          </span>
        </p>

        <button
          onClick={() => setGuideOpen(o => !o)}
          aria-expanded={guideOpen}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: K.surface, border: `1px solid ${K.border}`, borderRadius: 12,
            padding: '0 12px', minHeight: 46, cursor: 'pointer', fontFamily: K.body,
            fontSize: 14, fontWeight: 600, color: K.text,
          }}
        >
          How to freeze well · {FREEZER_GUIDE.length} rules
          <ChevronDown size={16} color={K.muted} style={{
            transform: guideOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s',
          }} />
        </button>
        {guideOpen && (
          <dl style={{ margin: '10px 2px 2px' }}>
            {FREEZER_GUIDE.map(g => (
              <div key={g.title} style={{ marginBottom: 10 }}>
                <dt style={{ fontSize: 14, fontWeight: 700, color: K.text }}>{g.title}</dt>
                <dd style={{ margin: '2px 0 0', fontSize: 14, color: K.sub, lineHeight: 1.55 }}>{g.body}</dd>
              </div>
            ))}
          </dl>
        )}

        <button
          onClick={() => onAddSupplies(missing)}
          disabled={missing.length === 0}
          style={{
            width: '100%', marginTop: 8, display: 'flex', alignItems: 'center', gap: 9,
            background: 'transparent', border: `1px dashed ${missing.length ? K.sage : K.border}`,
            borderRadius: 12, padding: '10px 12px', minHeight: 46, textAlign: 'left',
            cursor: missing.length ? 'pointer' : 'default',
            fontFamily: K.body, fontSize: 14, color: missing.length ? K.sage : K.muted, fontWeight: 600,
          }}
        >
          <PackagePlus size={16} style={{ flexShrink: 0 }} />
          {missing.length
            ? 'Add freezer bags, foil containers and labels to the shopping list'
            : 'Freezer bags, foil containers and labels are on the shopping list'}
        </button>
      </section>

      <div className="chips" style={{ marginBottom: 14 }}>
        {[{ key: 'all' as const, label: `All ${total}` }, ...FREEZER_COURSES].map(c => {
          const on = course === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setCourse(c.key)}
              style={{
                background: on ? `${K.sage}1c` : K.surface,
                color: on ? K.sage : K.sub,
                border: `1px solid ${on ? K.sage : K.border}`,
                borderRadius: 999, padding: '9px 15px', cursor: 'pointer', flexShrink: 0,
                fontSize: 14, fontWeight: 600, fontFamily: K.body,
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {shelves.map(s => (
        <section key={s.course} style={{ marginBottom: 18 }}>
          <h3 style={{
            margin: '0 0 8px', fontFamily: K.body, fontSize: 11.5, fontWeight: 700,
            letterSpacing: '0.09em', textTransform: 'uppercase', color: K.muted,
          }}>
            {s.label} · {s.recipes.length}
          </h3>
          <RecipeGrid recipes={s.recipes} cookIds={cookIds} onOpen={onOpen} />
        </section>
      ))}
      {shelves.length === 0 && (
        <p style={{ margin: '28px 4px', fontSize: 14, color: K.muted, textAlign: 'center' }}>
          No freezer recipes here yet.
        </p>
      )}
    </>
  );
}
