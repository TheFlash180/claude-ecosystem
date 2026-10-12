import { describe, expect, it } from 'vitest';
import {
  addMonths, bagLabel, FREEZER_SUPPLIES, freezerShelves, parseFreezer, shortDate, suppliesToAdd,
} from '../freezer';
import { scaleRecipe } from '../scale';
import type { FreezerInfo, Recipe } from '../config';

const FZ: FreezerInfo = { course: 'dinner', months: 3, freeze: ['Bag it flat.'], reheat: ['Heat until bubbling.'] };

function recipe(p: Partial<Recipe> & { id: string; name: string }): Recipe {
  return {
    emoji: '🍽', mealType: 'dinner', serves: 4, ingredients: [], steps: [],
    totalMinutes: 45, scalable: true, tags: [], ...p,
  };
}

describe('parseFreezer', () => {
  it('accepts a complete block', () => {
    expect(parseFreezer({ ...FZ })).toEqual(FZ);
  });

  it('rejects anything it could not render', () => {
    expect(parseFreezer(null)).toBeUndefined();
    expect(parseFreezer('freeze it')).toBeUndefined();
    expect(parseFreezer({ ...FZ, course: 'brunch' })).toBeUndefined();
    expect(parseFreezer({ ...FZ, months: 0 })).toBeUndefined();
    expect(parseFreezer({ ...FZ, months: '3' })).toBeUndefined();
    expect(parseFreezer({ ...FZ, reheat: 'heat it' })).toBeUndefined();
    expect(parseFreezer({ ...FZ, freeze: ['ok', 4] })).toBeUndefined();
  });
});

describe('freezerShelves', () => {
  const book = [
    recipe({ id: 'pie', name: 'Cottage pie', freezer: FZ }),
    recipe({ id: 'bol', name: 'Bolognese', freezer: FZ }),
    recipe({ id: 'muf', name: 'Muffins', freezer: { ...FZ, course: 'breakfast' } }),
    recipe({ id: 'salad', name: 'Salad' }),
  ];

  it('groups by course in day order, A–Z within, leaving out non-freezer recipes and empty courses', () => {
    const shelves = freezerShelves(book);
    expect(shelves.map(s => s.course)).toEqual(['breakfast', 'dinner']);
    expect(shelves[1].recipes.map(r => r.id)).toEqual(['bol', 'pie']);
  });

  it('narrows to one course', () => {
    expect(freezerShelves(book, 'breakfast').map(s => s.recipes.length)).toEqual([1]);
    expect(freezerShelves(book, 'snack')).toEqual([]);
  });
});

describe('addMonths', () => {
  it('moves calendar months, across a year end', () => {
    expect(addMonths('2026-10-12', 3)).toBe('2027-01-12');
    expect(addMonths('2026-12-01', 2)).toBe('2027-02-01');
  });

  it('clamps to the end of a shorter month rather than spilling into the next', () => {
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
    expect(addMonths('2027-11-30', 3)).toBe('2028-02-29');
    expect(addMonths('2026-08-31', 1)).toBe('2026-09-30');
  });
});

describe('bagLabel', () => {
  it('names the dish, the day it went in and the day to eat it by', () => {
    expect(shortDate('2026-09-05')).toBe('5 Sep 2026');
    expect(bagLabel('Savoury mince', '2026-10-12', 3))
      .toBe('Savoury mince · frozen 12 Oct 2026 · eat by 12 Jan 2027');
  });
});

describe('suppliesToAdd', () => {
  it('adds everything to an empty list, and nothing twice', () => {
    expect(suppliesToAdd([])).toEqual(FREEZER_SUPPLIES);
    expect(suppliesToAdd(FREEZER_SUPPLIES)).toEqual([]);
  });

  it('matches what is on the list without case or spacing', () => {
    expect(suppliesToAdd(['baking  paper', 'CLING WRAP'])).not.toContain('Baking paper');
    expect(suppliesToAdd(['baking  paper', 'CLING WRAP'])).not.toContain('Cling wrap');
  });
});

describe('scaling a freezer recipe', () => {
  const soup = recipe({
    id: 'soup', name: 'Soup', serves: 8,
    steps: ['Add 1.5 litres of water.'],
    freezer: { ...FZ, freeze: ['Bag it, two portions to a bag, within 2 hours.'], reheat: ['Loosen with 250 ml of water.'] },
  });

  it('scales quantities in the freezer steps like the method, and leaves times alone', () => {
    const s = scaleRecipe(soup, 16);
    expect(s.steps).toEqual(['Add 3 litres of water.']);
    expect(s.freezer?.freeze).toEqual(['Bag it, two portions to a bag, within 2 hours.']);
    expect(s.freezer?.reheat).toEqual(['Loosen with 500 ml of water.']);
    expect(s.freezer?.months).toBe(3);
  });

  it('hands the block back untouched at its own size', () => {
    expect(scaleRecipe(soup, 8).freezer).toBe(soup.freezer);
  });
});
