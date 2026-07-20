import { useState } from 'react';
import { Lightbulb } from 'lucide-react';
import {
  CATEGORY_META, K, type Category, type Ingredient, type MealType, type Recipe,
} from '../lib/config';
import { adminCheck, deleteRecipe, upsertRecipe, type RecipeDraft } from '../lib/data';

// Recipe book: browse, add and edit are open to the household; deleting
// needs the shared admin password (checked in Postgres, kept for the session).

const PW_KEY = 'mealprep-admin-pw';

const inputStyle = {
  background: K.surface, color: K.text, border: `1px solid ${K.border}`,
  borderRadius: 10, fontFamily: K.body, fontSize: 13.5, padding: '9px 11px',
  width: '100%', boxSizing: 'border-box',
} as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 8, flex: 1 }}>
      <span style={{
        display: 'block', fontSize: 9.5, textTransform: 'uppercase',
        letterSpacing: '0.1em', color: K.muted, marginBottom: 3,
      }}>{label}</span>
      {children}
    </label>
  );
}

const emptyDraft = (): RecipeDraft => ({
  id: null, name: '', emoji: '🍽️', mealType: 'dinner', serves: 4,
  ingredients: [{ n: '', q: '', u: '', c: 'pantry' }], notes: '',
});

const toDraft = (r: Recipe): RecipeDraft => ({
  id: r.id, name: r.name, emoji: r.emoji, mealType: r.mealType, serves: r.serves,
  ingredients: r.ingredients.length ? r.ingredients.map(i => ({ ...i })) : [{ n: '', q: '', u: '', c: 'pantry' }],
  notes: r.notes ?? '',
});

export function RecipesPage({ recipes, onChanged, onToast }: {
  recipes: Recipe[];
  onChanged: () => void;
  onToast: (msg: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [askDelete, setAskDelete] = useState<Recipe | null>(null);
  const [password, setPassword] = useState(sessionStorage.getItem(PW_KEY) ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!draft || !draft.name.trim()) { onToast('Give the recipe a name first.'); return; }
    setBusy(true);
    const clean = {
      ...draft,
      ingredients: draft.ingredients
        .filter(i => i.n.trim())
        .map(i => ({
          n: i.n.trim(),
          q: i.q === '' || i.q === null ? '' : (Number.isFinite(Number(i.q)) ? Number(i.q) : String(i.q)),
          u: i.u.trim(),
          c: i.c,
        })),
    };
    const id = await upsertRecipe(clean);
    setBusy(false);
    if (!id) { onToast("Couldn't save — check the fields."); return; }
    onToast('Recipe saved.');
    setDraft(null);
    onChanged();
  };

  const doDelete = async (r: Recipe, pw: string) => {
    setBusy(true);
    const authed = await adminCheck(pw);
    if (!authed) { setBusy(false); onToast("That password isn't right."); return; }
    sessionStorage.setItem(PW_KEY, pw);
    const ok = await deleteRecipe(r.id, pw);
    setBusy(false);
    setAskDelete(null);
    if (!ok) { onToast("Couldn't delete that recipe."); return; }
    onToast('Recipe removed — its planned slots cleared too.');
    onChanged();
  };

  const setIng = (idx: number, patch: Partial<Ingredient>) => {
    if (!draft) return;
    const ingredients = draft.ingredients.map((ing, i) => (i === idx ? { ...ing, ...patch } : ing));
    setDraft({ ...draft, ingredients });
  };

  const editor = draft && (
    <div style={{
      background: K.surface, border: `1px solid ${K.terra}55`, borderRadius: 14,
      padding: 14, marginBottom: 14,
    }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Emoji">
          <input style={{ ...inputStyle, width: 58, textAlign: 'center' }} value={draft.emoji}
            onChange={e => setDraft({ ...draft, emoji: e.target.value })} />
        </Field>
        <Field label="Name">
          <input style={inputStyle} value={draft.name} placeholder="Ouma's chicken pie"
            onChange={e => setDraft({ ...draft, name: e.target.value })} />
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Meal">
          <select style={inputStyle} value={draft.mealType}
            onChange={e => setDraft({ ...draft, mealType: e.target.value as MealType })}>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="any">Any</option>
          </select>
        </Field>
        <Field label="Serves">
          <input style={inputStyle} type="number" min={1} max={20} value={draft.serves}
            onChange={e => setDraft({ ...draft, serves: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} />
        </Field>
      </div>

      <span style={{ display: 'block', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: K.muted, margin: '4px 0 5px' }}>
        Ingredients (qty · unit · aisle)
      </span>
      {draft.ingredients.map((ing, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input style={{ ...inputStyle, flex: 3, minWidth: 0 }} placeholder="Beef mince" value={ing.n}
            onChange={e => setIng(i, { n: e.target.value })} />
          <input style={{ ...inputStyle, flex: 1.2, minWidth: 0 }} placeholder="500" value={String(ing.q)}
            onChange={e => setIng(i, { q: e.target.value })} />
          <input style={{ ...inputStyle, flex: 1.2, minWidth: 0 }} placeholder="g" value={ing.u}
            onChange={e => setIng(i, { u: e.target.value })} />
          <select style={{ ...inputStyle, flex: 1.6, minWidth: 0, padding: '9px 6px' }} value={ing.c}
            onChange={e => setIng(i, { c: e.target.value as Category })}>
            {CATEGORY_META.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <button
            onClick={() => setDraft({ ...draft, ingredients: draft.ingredients.filter((_, j) => j !== i) })}
            aria-label="Remove ingredient"
            style={{ background: 'transparent', border: 'none', color: K.muted, cursor: 'pointer', flexShrink: 0 }}>
            ✕
          </button>
        </div>
      ))}
      <button
        onClick={() => setDraft({ ...draft, ingredients: [...draft.ingredients, { n: '', q: '', u: '', c: 'pantry' }] })}
        style={{ ...inputStyle, cursor: 'pointer', color: K.sage, fontWeight: 600, marginBottom: 8 }}>
        + ingredient
      </button>

      <Field label="Prep notes">
        <textarea style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }} value={draft.notes}
          placeholder="Freezes well — cook double on Sundays."
          onChange={e => setDraft({ ...draft, notes: e.target.value })} />
      </Field>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setDraft(null)}
          style={{ ...inputStyle, cursor: 'pointer', width: 'auto' }}>Cancel</button>
        <button onClick={() => void save()} disabled={busy}
          style={{
            ...inputStyle, cursor: 'pointer', width: 'auto', flex: 1, border: 'none',
            background: `linear-gradient(135deg, ${K.terra}, ${K.terraDark})`,
            color: '#fff', fontWeight: 700,
          }}>
          {busy ? 'Saving…' : 'Save recipe'}
        </button>
      </div>
    </div>
  );

  return (
    <div>
      {!draft && (
        <button
          onClick={() => setDraft(emptyDraft())}
          style={{
            ...inputStyle, cursor: 'pointer', marginBottom: 14,
            border: `1px solid ${K.terra}`, color: K.terra, fontWeight: 700,
          }}>
          + Add a recipe
        </button>
      )}
      {editor}

      {recipes.map(r => {
        const open = openId === r.id;
        return (
          <div key={r.id} style={{
            background: K.surface, border: `1px solid ${K.border}`, borderRadius: 13,
            marginBottom: 8, overflow: 'hidden',
          }}>
            <button
              onClick={() => setOpenId(open ? null : r.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                background: 'transparent', border: 'none', padding: '11px 13px',
                cursor: 'pointer', textAlign: 'left',
              }}>
              <span style={{ fontSize: 20 }}>{r.emoji}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: K.body, fontSize: 14, fontWeight: 600, color: K.text }}>
                  {r.name}
                </span>
                <span style={{ fontSize: 11, color: K.muted }}>
                  serves {r.serves} · {r.ingredients.length} ingredients
                  {r.mealType !== 'any' ? ` · ${r.mealType}` : ''}
                </span>
              </span>
              <span style={{ color: K.muted, fontSize: 12 }}>{open ? '▲' : '▼'}</span>
            </button>

            {open && (
              <div style={{ padding: '0 13px 12px', borderTop: `1px dashed ${K.border}` }}>
                <ul style={{ margin: '10px 0', paddingLeft: 18, color: K.sub, fontSize: 13, lineHeight: 1.7 }}>
                  {r.ingredients.map((ing, i) => (
                    <li key={i}>
                      {ing.n}{ing.q !== '' && ing.q != null ? ` — ${ing.q}${ing.u ? ` ${ing.u}` : ''}` : ''}
                    </li>
                  ))}
                </ul>
                {r.notes && (
                  <div style={{
                    background: K.raised, borderRadius: 10, padding: '9px 11px',
                    fontSize: 12.5, color: K.sub, lineHeight: 1.6, marginBottom: 10,
                    display: 'flex', gap: 7,
                  }}>
                    <Lightbulb size={14} strokeWidth={2} color={K.honey} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>{r.notes}</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setDraft(toDraft(r)); setOpenId(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    style={{ ...inputStyle, cursor: 'pointer', width: 'auto', padding: '7px 14px' }}>
                    Edit
                  </button>
                  <button onClick={() => setAskDelete(r)}
                    style={{ ...inputStyle, cursor: 'pointer', width: 'auto', padding: '7px 14px', color: K.terra }}>
                    Delete…
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {askDelete && (
        <div
          onClick={() => setAskDelete(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(59,46,32,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: K.bg, borderRadius: 16, padding: 18, width: '100%', maxWidth: 340,
            border: `1px solid ${K.border}`,
          }}>
            <div style={{ fontFamily: K.display, fontSize: 17, fontWeight: 700, color: K.text, marginBottom: 6 }}>
              Delete “{askDelete.name}”?
            </div>
            <div style={{ fontSize: 12.5, color: K.sub, lineHeight: 1.55, marginBottom: 12 }}>
              It disappears from every planned week too. Deleting needs the
              admin password.
            </div>
            <input
              type="password"
              placeholder="Admin password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !busy) void doDelete(askDelete, password); }}
              style={{ ...inputStyle, marginBottom: 10 }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setAskDelete(null)}
                style={{ ...inputStyle, cursor: 'pointer', width: 'auto', flex: 1 }}>Cancel</button>
              <button
                onClick={() => void doDelete(askDelete, password)}
                disabled={busy || !password}
                style={{
                  ...inputStyle, cursor: 'pointer', width: 'auto', flex: 1, border: 'none',
                  background: K.terra, color: '#fff', fontWeight: 700,
                }}>
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
