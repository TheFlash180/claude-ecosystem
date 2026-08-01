import { describe, expect, it } from 'vitest';
import {
  formatQty, pluraliseUnit, roundQty, scaleIngredients, scaleRecipe, scaleText,
} from '../scale';
import type { Ingredient, Recipe } from '../config';

describe('roundQty', () => {
  it('keeps counts whole', () => {
    // Half an onion is fine; half an egg is not, and the list cannot tell
    // them apart, so counts round to whole.
    expect(roundQty(1.5, '')).toBe(2);
    expect(roundQty(2.5, 'eggs')).toBe(3);
  });

  it('never rounds an ingredient away to nothing', () => {
    expect(roundQty(0.2, '')).toBe(1);
    expect(roundQty(0.1, 'tins')).toBe(1);
    expect(roundQty(2, 'g')).toBe(5);
  });

  it('rounds spoons and cups to quarters', () => {
    expect(roundQty(0.333, 'tsp')).toBe(0.25);
    expect(roundQty(1.6, 'cups')).toBe(1.5);
    expect(roundQty(0.66, 'tablespoons')).toBe(0.75);
  });

  it('rounds grams and millilitres to something a scale can show', () => {
    expect(roundQty(83, 'g')).toBe(85);
    expect(roundQty(333, 'ml')).toBe(330);
    expect(roundQty(1666, 'g')).toBe(1650);
  });

  it('keeps kilos and litres to a twentieth', () => {
    expect(roundQty(1.13, 'kg')).toBe(1.15);
    expect(roundQty(0.625, 'litres')).toBe(0.65);
  });
});

describe('formatQty', () => {
  it('uses fraction glyphs where they are exact', () => {
    expect(formatQty(0.5)).toBe('½');
    expect(formatQty(1.5)).toBe('1½');
    expect(formatQty(0.25)).toBe('¼');
    expect(formatQty(2.75)).toBe('2¾');
  });
  it('leaves whole numbers alone', () => {
    expect(formatQty(3)).toBe('3');
    expect(formatQty(750)).toBe('750');
  });
  it('falls back to a decimal for anything else', () => {
    expect(formatQty(1.15)).toBe('1.15');
  });
});

describe('pluraliseUnit', () => {
  it('drops the s at exactly one', () => {
    expect(pluraliseUnit('cups', 1)).toBe('cup');
    expect(pluraliseUnit('tins', 1)).toBe('tin');
  });
  it('adds one above or below one', () => {
    expect(pluraliseUnit('cup', 2)).toBe('cups');
    expect(pluraliseUnit('clove', 0.5)).toBe('cloves');
  });
  it('leaves abbreviations and metric units alone', () => {
    expect(pluraliseUnit('g', 1)).toBe('g');
    expect(pluraliseUnit('tbsp', 3)).toBe('tbsp');
    expect(pluraliseUnit('', 2)).toBe('');
  });
});

describe('scaleIngredients', () => {
  const ings: Ingredient[] = [
    { n: 'Maize meal', q: 2, u: 'cups', c: 'pantry' },
    { n: 'Water', q: 750, u: 'ml', c: 'pantry' },
    { n: 'Salt', q: 1.5, u: 'tsp', c: 'spices' },
    { n: 'Parsley', q: 'a handful', u: '', c: 'veg' },
    { n: 'Cooking oil for frying', q: 1, u: 'l', c: 'pantry', f: true },
  ];

  it('doubles what should double', () => {
    const out = scaleIngredients(ings, 2);
    expect(out[0]).toMatchObject({ q: 4, u: 'cups' });
    expect(out[1]).toMatchObject({ q: 1500, u: 'ml' });
    expect(out[2]).toMatchObject({ q: 3, u: 'tsp' });
  });

  it('leaves an unmeasurable quantity as words', () => {
    expect(scaleIngredients(ings, 2)[3].q).toBe('a handful');
  });

  it('leaves a fixed ingredient alone', () => {
    // The litre of oil you deep-fry in does not double because dinner did.
    expect(scaleIngredients(ings, 3)[4]).toMatchObject({ q: 1, u: 'l' });
  });

  it('is a no-op at factor 1', () => {
    expect(scaleIngredients(ings, 1)).toBe(ings);
  });
});

describe('scaleText', () => {
  it('scales quantities of food', () => {
    expect(scaleText('Bring 5 cups (1.25 litres) of water to the boil.', 2))
      .toBe('Bring 10 cups (2½ litres) of water to the boil.');
  });

  it('leaves cooking times alone', () => {
    // The single most dangerous thing a scaler could get wrong.
    expect(scaleText('Simmer 25 minutes, then rest 5 minutes.', 2))
      .toBe('Simmer 25 minutes, then rest 5 minutes.');
    expect(scaleText('Microwave for 70 seconds.', 3)).toBe('Microwave for 70 seconds.');
    expect(scaleText('Roast 1 hour 20 minutes.', 2)).toBe('Roast 1 hour 20 minutes.');
  });

  it('leaves oven temperatures alone', () => {
    expect(scaleText('Heat the oven to 180°C.', 4)).toBe('Heat the oven to 180°C.');
    expect(scaleText('Heat the oil to 170°C.', 0.5)).toBe('Heat the oil to 170°C.');
  });

  it('leaves knife work and dish sizes alone', () => {
    expect(scaleText('Cut into 3 cm chunks and use a 25 cm dish.', 2))
      .toBe('Cut into 3 cm chunks and use a 25 cm dish.');
    expect(scaleText('Slice about 3 mm thick.', 2)).toBe('Slice about 3 mm thick.');
  });

  it('handles the spelled-out halves', () => {
    expect(scaleText('Add 1 and a half teaspoons of salt.', 2))
      .toBe('Add 3 teaspoons of salt.');
    expect(scaleText('Stir in half a cup of cold water.', 4))
      .toBe('Stir in 2 cups of cold water.');
  });

  it('moves both ends of a range', () => {
    // "4 to 10 tablespoons" would be nonsense.
    expect(scaleText('Add 4 to 5 tablespoons of the liquid.', 2))
      .toBe('Add 8 to 10 tablespoons of the liquid.');
  });

  it('agrees with the ingredient table on the same quantity', () => {
    // Both go through roundQty, so the method never contradicts the list.
    const ing = scaleIngredients([{ n: 'Water', q: 750, u: 'ml', c: 'pantry' }], 1.5)[0];
    expect(scaleText('Bring the 750 ml of water to the boil.', 1.5))
      .toContain(`${ing.q} ml`);
  });

  it('fixes the plural when a quantity lands on one', () => {
    expect(scaleText('Use 2 tins of tomatoes.', 0.5)).toBe('Use 1 tin of tomatoes.');
  });

  it('is a no-op at factor 1', () => {
    const s = 'Bring 5 cups of water to the boil for 25 minutes at 180°C.';
    expect(scaleText(s, 1)).toBe(s);
  });
});

function recipe(p: Partial<Recipe> & { id: string }): Recipe {
  return {
    name: 'Krummelpap', emoji: '🌾', mealType: 'side', serves: 6, totalMinutes: 45,
    scalable: true,
    ingredients: [{ n: 'Maize meal', q: 4, u: 'cups', c: 'pantry' }],
    steps: ['Bring 3 cups of water to the boil.', 'Steam for 20 minutes.'],
    ...p,
  };
}

describe('scaleRecipe', () => {
  it('scales the table and the method together', () => {
    const s = scaleRecipe(recipe({ id: 'pap' }), 12);
    expect(s.ingredients[0]).toMatchObject({ q: 8, u: 'cups' });
    expect(s.steps[0]).toBe('Bring 6 cups of water to the boil.');
    expect(s.steps[1]).toBe('Steam for 20 minutes.');
    expect(s.servings).toBe(12);
  });

  it('scales down as well as up', () => {
    const s = scaleRecipe(recipe({ id: 'pap' }), 3);
    expect(s.ingredients[0]).toMatchObject({ q: 2, u: 'cups' });
    expect(s.steps[0]).toBe('Bring 1½ cups of water to the boil.');
  });

  it('refuses to scale a recipe that cannot be scaled', () => {
    // A mug cake is one mug and a fixed microwave time; the pap guide is a
    // ratio explainer, not a quantity.
    const s = scaleRecipe(recipe({ id: 'mug', scalable: false, serves: 1 }), 4);
    expect(s.servings).toBe(1);
    expect(s.ingredients[0]).toMatchObject({ q: 4 });
    expect(s.steps[0]).toBe('Bring 3 cups of water to the boil.');
  });

  it('returns the original arrays when nothing changes', () => {
    const r = recipe({ id: 'pap' });
    expect(scaleRecipe(r, 6).steps).toBe(r.steps);
  });
});
