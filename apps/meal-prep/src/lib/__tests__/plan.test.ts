import { describe, expect, it } from 'vitest';
import {
  addDays, buildShoppingList, dayDate, leftoverCandidates, weekStartOf,
} from '../plan';
import type { PlanSlot, Recipe, ShoppingRow } from '../config';

describe('week math', () => {
  it('weekStartOf finds the Monday', () => {
    expect(weekStartOf('2026-07-20')).toBe('2026-07-20'); // a Monday
    expect(weekStartOf('2026-07-23')).toBe('2026-07-20'); // Thursday
    expect(weekStartOf('2026-07-26')).toBe('2026-07-20'); // Sunday belongs to the week it ends
    expect(weekStartOf('2026-07-27')).toBe('2026-07-27'); // next Monday
  });

  it('addDays crosses month boundaries', () => {
    expect(addDays('2026-07-30', 3)).toBe('2026-08-02');
    expect(addDays('2026-08-02', -3)).toBe('2026-07-30');
  });

  it('dayDate maps day index onto the week', () => {
    expect(dayDate('2026-07-20', 0)).toBe('2026-07-20');
    expect(dayDate('2026-07-20', 6)).toBe('2026-07-26');
  });
});

const r = (id: string, ingredients: Recipe['ingredients']): Recipe => ({
  id, name: id, emoji: '🍽️', mealType: 'any', serves: 4, ingredients,
});

const slot = (day: number, s: 'lunch' | 'dinner', recipeId: string, leftover = false): PlanSlot => ({
  day, slot: s, recipeId, isLeftover: leftover,
});

describe('buildShoppingList', () => {
  const recipes = new Map<string, Recipe>([
    ['bolognese', r('bolognese', [
      { n: 'Beef mince', q: 500, u: 'g', c: 'meat' },
      { n: 'Onion', q: 1, u: '', c: 'veg' },
    ])],
    ['cottage', r('cottage', [
      { n: 'Beef mince', q: 500, u: 'g', c: 'meat' },
      { n: 'Milk', q: 100, u: 'ml', c: 'dairy' },
    ])],
  ]);

  it('merges the same ingredient+unit across recipes and formats units', () => {
    const sections = buildShoppingList(
      [slot(0, 'dinner', 'bolognese'), slot(1, 'dinner', 'cottage')],
      recipes, [],
    );
    const meat = sections.find(s => s.category === 'meat')!;
    expect(meat.items).toHaveLength(1);
    expect(meat.items[0].label).toBe('Beef mince · 1 kg'); // 1000 g reads as kg
    const veg = sections.find(s => s.category === 'veg')!;
    expect(veg.items[0].label).toBe('Onion · ×1');
  });

  it('counts leftover slots too — cook double means buy double', () => {
    const sections = buildShoppingList(
      [slot(0, 'dinner', 'bolognese'), slot(2, 'lunch', 'bolognese', true)],
      recipes, [],
    );
    const meat = sections.find(s => s.category === 'meat')!;
    expect(meat.items[0].label).toBe('Beef mince · 1 kg');
  });

  it('applies tick state and appends custom extras under Other', () => {
    const state: ShoppingRow[] = [
      { itemKey: 'beef mince|g', label: '', checked: true, custom: false },
      { itemKey: 'x-abc123', label: 'Braai charcoal', checked: false, custom: true },
    ];
    const sections = buildShoppingList([slot(0, 'dinner', 'bolognese')], recipes, state);
    expect(sections.find(s => s.category === 'meat')!.items[0].checked).toBe(true);
    const other = sections.find(s => s.category === 'other')!;
    expect(other.items.map(i => i.label)).toEqual(['Braai charcoal']);
  });

  it('skips slots whose recipe was deleted and empty weeks produce no sections', () => {
    expect(buildShoppingList([slot(0, 'dinner', 'gone')], recipes, [])).toEqual([]);
    expect(buildShoppingList([], recipes, [])).toEqual([]);
  });
});

describe('leftoverCandidates', () => {
  it('offers only empty slots strictly after the cooked one', () => {
    const taken = [slot(0, 'dinner', 'bolognese'), slot(1, 'lunch', 'cottage')];
    const cands = leftoverCandidates(taken, 0, 'dinner');
    expect(cands[0]).toEqual({ day: 1, slot: 'dinner' }); // 1|lunch is taken
    expect(cands.some(c => c.day === 0)).toBe(false);
  });

  it('same-day dinner follows a lunch cook', () => {
    const cands = leftoverCandidates([], 3, 'lunch');
    expect(cands[0]).toEqual({ day: 3, slot: 'dinner' });
  });
});
