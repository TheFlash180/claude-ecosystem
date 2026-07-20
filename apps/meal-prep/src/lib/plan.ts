// Pure week/date + shopping-list logic (unit-tested).
import {
  CATEGORY_META, type Category, type Ingredient, type PlanSlot,
  type Recipe, type ShoppingRow, type Slot,
} from './config';

// ---- SAST calendar days ----

export function sastDay(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
}

export function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing ymd. */
export function weekStartOf(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  return addDays(ymd, -dow);
}

/** The date of day N (0 = Monday) in the week starting weekStart. */
export function dayDate(weekStart: string, day: number): string {
  return addDays(weekStart, day);
}

export function fmtDay(ymd: string): string {
  return new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-ZA', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

export function fmtWeekRange(weekStart: string): string {
  const opts = { day: 'numeric', month: 'short' } as const;
  const a = new Date(weekStart + 'T12:00:00Z').toLocaleDateString('en-ZA', opts);
  const b = new Date(addDays(weekStart, 6) + 'T12:00:00Z').toLocaleDateString('en-ZA', opts);
  return `${a} – ${b}`;
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
  emoji: string;
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
 * Consolidate the week's planned recipes into one list. Every slot counts —
 * a leftover slot means you cooked double, so you also bought double.
 * Ticks (from mealprep_shopping) mark items checked; custom extras append
 * to the "other" section.
 */
export function buildShoppingList(
  slots: PlanSlot[],
  recipes: Map<string, Recipe>,
  state: ShoppingRow[],
): ShoppingSection[] {
  interface Agg { name: string; unit: string; qty: number; countable: boolean; category: Category }
  const agg = new Map<string, Agg>();

  for (const s of slots) {
    const r = recipes.get(s.recipeId);
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
    sections.push({ category: meta.key, label: meta.label, emoji: meta.emoji, items });
  }
  return sections;
}

/** Empty slots strictly after (day, slot) in the same week — "cook double"
 *  leftover candidates, nearest first. */
export function leftoverCandidates(
  slots: PlanSlot[], day: number, slot: Slot,
): { day: number; slot: Slot }[] {
  const taken = new Set(slots.map(s => `${s.day}|${s.slot}`));
  const out: { day: number; slot: Slot }[] = [];
  for (let d = 0; d < 7; d++) {
    for (const sl of ['lunch', 'dinner'] as Slot[]) {
      const after = d > day || (d === day && slot === 'lunch' && sl === 'dinner');
      if (after && !taken.has(`${d}|${sl}`)) out.push({ day: d, slot: sl });
    }
  }
  return out;
}
