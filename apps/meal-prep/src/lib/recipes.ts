// Pure recipe + shopping-list logic. No React, no Supabase, so it runs under
// node in tests.
import {
  CATEGORY_META, QUICK_MINUTES,
  type Category, type Ingredient, type MealType, type Recipe, type ShoppingRow,
} from './config';

// ---- browsing ----

export interface RecipeFilter {
  meal: MealType | 'all';
  quickOnly: boolean;
  search: string;
}

export const EMPTY_FILTER: RecipeFilter = { meal: 'all', quickOnly: false, search: '' };

function matchesSearch(r: Recipe, needle: string): boolean {
  const q = needle.trim().toLowerCase();
  if (q === '') return true;
  if (r.name.toLowerCase().includes(q)) return true;
  // Searching by what is in the fridge is the main way this gets used —
  // "mince", "chicken" — so ingredients count as much as the title.
  return r.ingredients.some(i => (i.n ?? '').toLowerCase().includes(q));
}

/** A recipe marked "any" belongs in both the lunch and dinner lists — it is
 *  not a third category to filter to. */
function matchesMeal(r: Recipe, meal: MealType | 'all'): boolean {
  if (meal === 'all') return true;
  return r.mealType === meal || r.mealType === 'any';
}

export function filterRecipes(recipes: Recipe[], f: RecipeFilter): Recipe[] {
  return recipes.filter(r =>
    matchesMeal(r, f.meal)
    // An unknown time is not "quick" — claiming a 2-hour stew is a weeknight
    // meal is worse than leaving it out of the filter.
    && (!f.quickOnly || (r.totalMinutes !== null && r.totalMinutes <= QUICK_MINUTES))
    && matchesSearch(r, f.search));
}

export function timeLabel(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return '';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/** Deterministic pick for "surprise me", so the same day gives the same
 *  suggestion rather than reshuffling on every render. */
export function pickOfTheDay(recipes: Recipe[], seed: string): Recipe | null {
  if (recipes.length === 0) return null;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return recipes[h % recipes.length];
}

// ---- shopping list ----

export interface ShoppingItem {
  key: string;        // norm(name)|unit, or the x-... key for extras
  label: string;      // "Beef mince · 1 kg"
  checked: boolean;
  custom: boolean;
  category: Category;
}

export interface ShoppingSection {
  category: Category;
  label: string;
  items: ShoppingItem[];
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function itemKeyOf(ing: Ingredient): string {
  return `${norm(ing.n)}|${(ing.u ?? '').trim().toLowerCase()}`;
}

function fmtQty(q: number, u: string): string {
  // 1500 g reads better as 1.5 kg; same for ml -> l.
  if (u === 'g' && q >= 1000) return `${+(q / 1000).toFixed(2)} kg`;
  if (u === 'ml' && q >= 1000) return `${+(q / 1000).toFixed(2)} l`;
  const qs = Number.isInteger(q) ? String(q) : String(+q.toFixed(2));
  return u ? `${qs} ${u}` : `×${qs}`;
}

/**
 * Consolidate the chosen recipes into one list, grouped by aisle.
 *
 * The same recipe chosen twice counts twice — cooking it two nights means
 * buying for two nights. Quantities that are not numbers ("a handful") make
 * the whole line uncountable rather than silently reading as zero.
 */
export function buildShoppingList(
  recipeIds: string[],
  recipes: Map<string, Recipe>,
  state: ShoppingRow[],
): ShoppingSection[] {
  interface Agg { name: string; unit: string; qty: number; countable: boolean; category: Category }
  const agg = new Map<string, Agg>();

  for (const id of recipeIds) {
    const r = recipes.get(id);
    if (!r) continue;
    for (const ing of r.ingredients) {
      if (!ing?.n) continue;
      const key = itemKeyOf(ing);
      const q = typeof ing.q === 'number' ? ing.q : parseFloat(ing.q);
      const cur = agg.get(key) ?? {
        name: ing.n.trim(), unit: (ing.u ?? '').trim(),
        qty: 0, countable: true, category: ing.c ?? 'other',
      };
      if (Number.isFinite(q)) cur.qty += q;
      else cur.countable = false;
      agg.set(key, cur);
    }
  }

  const ticked = new Map(state.filter(s => !s.custom).map(s => [s.itemKey, s.checked]));
  const bySection = new Map<Category, ShoppingItem[]>();

  for (const [key, a] of agg) {
    const label = a.countable && a.qty > 0
      ? `${a.name} · ${fmtQty(a.qty, a.unit)}`
      : a.name;
    const cat: Category = CATEGORY_META.some(c => c.key === a.category) ? a.category : 'other';
    const list = bySection.get(cat) ?? [];
    list.push({ key, label, checked: ticked.get(key) ?? false, custom: false, category: cat });
    bySection.set(cat, list);
  }

  for (const row of state) {
    if (!row.custom) continue;
    const list = bySection.get('other') ?? [];
    list.push({ key: row.itemKey, label: row.label, checked: row.checked, custom: true, category: 'other' });
    bySection.set('other', list);
  }

  const sections: ShoppingSection[] = [];
  for (const meta of CATEGORY_META) {
    const items = bySection.get(meta.key);
    if (!items || items.length === 0) continue;
    items.sort((a, b) => Number(a.custom) - Number(b.custom) || a.label.localeCompare(b.label));
    sections.push({ category: meta.key, label: meta.label, items });
  }
  return sections;
}

export function shoppingProgress(sections: ShoppingSection[]): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const s of sections) {
    for (const i of s.items) { total++; if (i.checked) done++; }
  }
  return { done, total };
}
