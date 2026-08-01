// Serving-size scaling. Pure — no React, no Supabase.
//
// A recipe states its quantities twice: once in the ingredient table and again
// in the prose of the method ("bring 5 cups of water to the boil"). Scaling
// only the table would leave the method contradicting it, so both are scaled
// with the same rounding, which keeps the two agreeing.
//
// Scaling prose is only safe because the unit list is a whitelist. A number is
// rescaled if — and only if — it is followed by a unit of food. Minutes,
// seconds, °C, cm and mm are not on the list, so oven temperatures, cooking
// times and knife-work dimensions are never touched.
import type { Ingredient, Recipe } from './config';

/** Units that never take a plural 's'. */
const INVARIANT = new Set(['g', 'kg', 'ml', 'l', 'tbsp', 'tsp']);

/** Everything that counts as a quantity of food. Order matters only in that
 *  longer forms must be tried before their prefixes, which the regex below
 *  handles by sorting. */
const UNITS = [
  'cups', 'cup',
  'tablespoons', 'tablespoon', 'tbsp',
  'teaspoons', 'teaspoon', 'tsp',
  'litres', 'litre', 'liters', 'liter',
  'kg', 'g', 'ml', 'l',
  'slices', 'slice', 'tins', 'tin', 'packets', 'packet',
  'cloves', 'clove', 'sprigs', 'sprig', 'heads', 'head',
  'rounds', 'round', 'scoops', 'scoop', 'squares', 'square',
  'punnets', 'punnet', 'stalks', 'stalk', 'handfuls', 'handful',
  'eggs', 'egg', 'balls', 'ball', 'bars', 'bar',
  'pieces', 'piece', 'wedges', 'wedge', 'florets', 'floret',
  'rashers', 'rasher', 'fillets', 'fillet', 'breasts', 'breast',
  'chops', 'chop', 'rolls', 'roll', 'wraps', 'wrap', 'sheets', 'sheet',
];

const UNIT_ALT = [...UNITS].sort((a, b) => b.length - a.length).join('|');

/** Round a scaled quantity to something a person can actually measure. */
export function roundQty(value: number, unit: string): number {
  const u = unit.trim().toLowerCase();
  if (value <= 0) return 0;

  // A count of things is a whole thing. Half an onion is fine in principle,
  // but half an egg is not, and the list cannot tell them apart.
  if (u === '' || u === 'egg' || u === 'eggs') return Math.max(1, Math.round(value));

  if (u === 'g' || u === 'ml') {
    if (value < 100) return Math.max(5, Math.round(value / 5) * 5);
    if (value < 1000) return Math.round(value / 10) * 10;
    return Math.round(value / 50) * 50;
  }
  if (u === 'kg' || u === 'l' || u.startsWith('litre') || u.startsWith('liter')) {
    return Math.max(0.05, Math.round(value * 20) / 20);
  }
  // Spoons and cups come in quarters.
  if (u.startsWith('cup') || u.startsWith('tbsp') || u.startsWith('tablespoon')
      || u.startsWith('tsp') || u.startsWith('teaspoon')) {
    return Math.max(0.25, Math.round(value * 4) / 4);
  }
  // Tins, cloves, slices, packets — whole units.
  return Math.max(1, Math.round(value));
}

const FRACTIONS: [number, string][] = [[0.25, '¼'], [0.5, '½'], [0.75, '¾']];

/** 1.5 -> "1½", 0.5 -> "½", 12 -> "12", 1.35 -> "1.35". */
export function formatQty(value: number): string {
  const whole = Math.floor(value);
  const rest = +(value - whole).toFixed(4);
  if (rest === 0) return String(whole);
  const frac = FRACTIONS.find(([n]) => n === rest);
  if (frac) return whole === 0 ? frac[1] : `${whole}${frac[1]}`;
  return String(+value.toFixed(2));
}

/** Match the source unit's plurality to the new number. */
export function pluraliseUnit(unit: string, value: number): string {
  const u = unit.trim();
  if (u === '' || INVARIANT.has(u.toLowerCase())) return u;
  const plural = u.endsWith('s');
  if (value === 1 && plural) return u.slice(0, -1);
  if (value !== 1 && !plural) return `${u}s`;
  return u;
}

export function scaleIngredients(ingredients: Ingredient[], factor: number): Ingredient[] {
  if (factor === 1) return ingredients;
  return ingredients.map(i => {
    // "f" marks a quantity that is about the equipment rather than the eating:
    // the litre of oil you deep-fry in does not double because dinner did.
    if (i.f) return i;
    const q = typeof i.q === 'number' ? i.q : Number(i.q);
    if (!Number.isFinite(q) || q <= 0) return i;
    const scaled = roundQty(q * factor, i.u ?? '');
    return { ...i, q: scaled, u: pluraliseUnit(i.u ?? '', scaled) };
  });
}

// One regex, one pass, four alternatives tried in this order:
//   A "1 and a half cups"   B "half a cup"
//   C "4 to 5 tablespoons"  D "500 g"
// It has to be a single pass: running these as four separate replaces means
// the output of an earlier rule is still on the page for a later one to match,
// and "1 and a half teaspoons" doubled twice comes out as 6 rather than 3.
const QUANTITY = new RegExp(
  `\\b(\\d+) and a half\\s+(${UNIT_ALT})\\b`
  + `|\\bhalf a\\s+(${UNIT_ALT})\\b`
  + `|\\b(\\d+(?:\\.\\d+)?)\\s*(?:to|-|–)\\s*(\\d+(?:\\.\\d+)?)\\s+(${UNIT_ALT})\\b`
  + `|\\b(\\d+(?:\\.\\d+)?)\\s+(${UNIT_ALT})\\b`,
  'gi',
);

/** Rescale every food quantity in a sentence, leaving times, temperatures and
 *  measurements alone. */
export function scaleText(text: string, factor: number): string {
  if (factor === 1) return text;

  const one = (raw: number, unit: string): string => {
    const scaled = roundQty(raw * factor, unit);
    return `${formatQty(scaled)} ${pluraliseUnit(unit, scaled)}`;
  };

  return text.replace(QUANTITY, (
    match,
    halfNum: string | undefined, halfUnit: string | undefined,
    halfAUnit: string | undefined,
    lo: string | undefined, hi: string | undefined, rangeUnit: string | undefined,
    plainNum: string | undefined, plainUnit: string | undefined,
  ) => {
    if (halfUnit) return one(Number(halfNum) + 0.5, halfUnit);
    if (halfAUnit) return one(0.5, halfAUnit);
    if (rangeUnit) {
      // Both ends move, or the range stops making sense.
      const l = roundQty(Number(lo) * factor, rangeUnit);
      const h = roundQty(Number(hi) * factor, rangeUnit);
      return `${formatQty(l)} to ${formatQty(h)} ${pluraliseUnit(rangeUnit, h)}`;
    }
    if (plainUnit) return one(Number(plainNum), plainUnit);
    return match;
  });
}

export interface ScaledRecipe {
  ingredients: Ingredient[];
  steps: string[];
  servings: number;
}

/** A recipe at a chosen serving size. Recipes marked not scalable are handed
 *  back untouched at their own serving size. */
export function scaleRecipe(recipe: Recipe, servings: number): ScaledRecipe {
  const base = recipe.serves || 1;
  if (!recipe.scalable || servings === base || servings <= 0) {
    return { ingredients: recipe.ingredients, steps: recipe.steps, servings: base };
  }
  const factor = servings / base;
  return {
    ingredients: scaleIngredients(recipe.ingredients, factor),
    steps: recipe.steps.map(s => scaleText(s, factor)),
    servings,
  };
}
