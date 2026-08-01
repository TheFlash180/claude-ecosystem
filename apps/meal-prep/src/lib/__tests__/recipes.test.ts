import { describe, expect, it } from 'vitest';
import {
  buildShoppingList, filterRecipes, itemKeyOf, pickOfTheDay,
  shoppingProgress, timeLabel, EMPTY_FILTER,
} from '../recipes';
import type { Recipe, ShoppingRow } from '../config';

function recipe(p: Partial<Recipe> & { id: string; name: string }): Recipe {
  return {
    emoji: '🍽', mealType: 'dinner', serves: 4, ingredients: [], steps: [],
    totalMinutes: 45, ...p,
  };
}

const BOLO = recipe({
  id: 'bolo', name: 'Spaghetti bolognese', totalMinutes: 45,
  ingredients: [
    { n: 'Beef mince', q: 500, u: 'g', c: 'meat' },
    { n: 'Onion', q: 1, u: '', c: 'veg' },
    { n: 'Parsley', q: 'a handful', u: '', c: 'veg' },
  ],
});
const COTTAGE = recipe({
  id: 'cottage', name: 'Cottage pie', totalMinutes: 60,
  ingredients: [
    { n: 'Beef mince', q: 600, u: 'g', c: 'meat' },
    { n: 'Potatoes', q: 1, u: 'kg', c: 'veg' },
  ],
});
const WRAPS = recipe({
  id: 'wraps', name: 'Tuna & sweetcorn wraps', mealType: 'lunch', totalMinutes: 10,
  ingredients: [{ n: 'Tuna', q: 2, u: 'tins', c: 'pantry' }],
});
const EGGS = recipe({ id: 'eggs', name: 'Baked eggs', mealType: 'any', totalMinutes: 30 });
const MYSTERY = recipe({ id: 'mystery', name: 'Ouma se sop', totalMinutes: null });

const ALL = [BOLO, COTTAGE, WRAPS, EGGS, MYSTERY];

describe('filterRecipes', () => {
  it('returns everything by default', () => {
    expect(filterRecipes(ALL, EMPTY_FILTER)).toHaveLength(5);
  });

  it('includes "any" recipes in both lunch and dinner', () => {
    // "Any" is not a third bucket to filter to — baked eggs belong in both.
    const lunch = filterRecipes(ALL, { ...EMPTY_FILTER, meal: 'lunch' }).map(r => r.id);
    const dinner = filterRecipes(ALL, { ...EMPTY_FILTER, meal: 'dinner' }).map(r => r.id);
    expect(lunch).toContain('eggs');
    expect(dinner).toContain('eggs');
    expect(lunch).toContain('wraps');
    expect(lunch).not.toContain('bolo');
  });

  it('treats an unknown time as not quick', () => {
    // Better to leave a recipe out of "quick" than to promise a 2-hour stew
    // is a weeknight meal.
    const quick = filterRecipes(ALL, { ...EMPTY_FILTER, quickOnly: true }).map(r => r.id);
    expect(quick).toEqual(['wraps', 'eggs']);
    expect(quick).not.toContain('mystery');
  });

  it('searches ingredients, not just the name', () => {
    // The real use is "what can we do with the mince in the fridge".
    const hits = filterRecipes(ALL, { ...EMPTY_FILTER, search: 'mince' }).map(r => r.id);
    expect(hits).toEqual(['bolo', 'cottage']);
  });

  it('ignores case and surrounding space in the search', () => {
    expect(filterRecipes(ALL, { ...EMPTY_FILTER, search: '  BOLOGNESE ' })).toHaveLength(1);
  });

  it('combines filters', () => {
    const hits = filterRecipes(ALL, { meal: 'lunch', quickOnly: true, search: 'tuna' });
    expect(hits.map(r => r.id)).toEqual(['wraps']);
  });
});

describe('timeLabel', () => {
  it('reads minutes under an hour', () => {
    expect(timeLabel(45)).toBe('45 min');
  });

  it('reads hours above one', () => {
    expect(timeLabel(150)).toBe('2 hr 30 min');
    expect(timeLabel(120)).toBe('2 hr');
  });

  it('says nothing when the time is unknown', () => {
    expect(timeLabel(null)).toBe('');
  });
});

describe('pickOfTheDay', () => {
  it('gives the same answer for the same day', () => {
    // Otherwise the suggestion reshuffles on every render and stops being a
    // suggestion.
    expect(pickOfTheDay(ALL, '2026-08-01')?.id).toBe(pickOfTheDay(ALL, '2026-08-01')?.id);
  });

  it('moves on a different day', () => {
    const days = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05'];
    const picks = new Set(days.map(d => pickOfTheDay(ALL, d)?.id));
    expect(picks.size).toBeGreaterThan(1);
  });

  it('handles an empty book', () => {
    expect(pickOfTheDay([], '2026-08-01')).toBeNull();
  });
});

describe('buildShoppingList', () => {
  const byId = new Map(ALL.map(r => [r.id, r]));

  it('merges the same ingredient across recipes and formats the unit up', () => {
    const s = buildShoppingList(['bolo', 'cottage'], byId, []);
    const meat = s.find(x => x.category === 'meat')!;
    // 500 g + 600 g reads better as 1.1 kg than as 1100 g.
    expect(meat.items[0].label).toBe('Beef mince · 1.1 kg');
  });

  it('counts the same recipe twice when it is chosen twice', () => {
    const s = buildShoppingList(['bolo', 'bolo'], byId, []);
    const meat = s.find(x => x.category === 'meat')!;
    expect(meat.items[0].label).toBe('Beef mince · 1 kg');
  });

  it('leaves an unmeasurable quantity unquantified rather than calling it zero', () => {
    const s = buildShoppingList(['bolo'], byId, []);
    const veg = s.find(x => x.category === 'veg')!;
    expect(veg.items.map(i => i.label)).toContain('Parsley');
  });

  it('applies tick state and puts custom extras under Other', () => {
    const state: ShoppingRow[] = [
      { itemKey: itemKeyOf({ n: 'Beef mince', q: 0, u: 'g', c: 'meat' }), label: '', checked: true, custom: false },
      { itemKey: 'x-1', label: 'Dishwasher tablets', checked: false, custom: true },
    ];
    const s = buildShoppingList(['bolo'], byId, state);
    expect(s.find(x => x.category === 'meat')!.items[0].checked).toBe(true);
    expect(s.find(x => x.category === 'other')!.items[0].label).toBe('Dishwasher tablets');
  });

  it('skips a recipe that has since been deleted', () => {
    const s = buildShoppingList(['bolo', 'gone-forever'], byId, []);
    expect(s.some(x => x.category === 'meat')).toBe(true);
  });

  it('produces nothing from an empty selection', () => {
    expect(buildShoppingList([], byId, [])).toEqual([]);
  });
});

describe('shoppingProgress', () => {
  it('counts ticked against total across sections', () => {
    const byId = new Map(ALL.map(r => [r.id, r]));
    const state: ShoppingRow[] = [
      { itemKey: itemKeyOf({ n: 'Onion', q: 1, u: '', c: 'veg' }), label: '', checked: true, custom: false },
    ];
    const s = buildShoppingList(['bolo'], byId, state);
    expect(shoppingProgress(s)).toEqual({ done: 1, total: 3 });
  });

  it('is zero of zero for an empty list', () => {
    expect(shoppingProgress([])).toEqual({ done: 0, total: 0 });
  });
});
