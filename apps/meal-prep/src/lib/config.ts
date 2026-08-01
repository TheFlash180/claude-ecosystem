// Meal Prep: types + visual identity. Deliberately NOT a Watch app —
// warm kitchen tones on cream, Fraunces serif display. Light theme.
//
// This is a recipe book, not a planner. The weekly grid was used twice in four
// months while the recipes were used constantly, so the question the app now
// answers is "we cannot decide what to make tonight" — which needs the method,
// not a calendar.

export type Slot = 'lunch' | 'dinner';
/** 'any' means "works for either lunch or dinner", not a third bucket.
 *  'side', 'snack' and 'dessert' are their own shelves. */
export type MealType = Slot | 'any' | 'side' | 'snack' | 'dessert';
export type Category =
  | 'meat' | 'veg' | 'dairy' | 'bakery' | 'pantry' | 'spices' | 'frozen' | 'other';

export interface Ingredient {
  n: string;      // name
  q: number | string;  // quantity ('' when it's just "some")
  u: string;      // unit ('' = count)
  c: Category;    // shopping aisle
  /** Fixed: does not move with the serving size. The litre of oil you deep-fry
   *  in and the bag of charcoal are about the equipment, not the eating. */
  f?: boolean;
}

export interface Recipe {
  id: string;
  name: string;
  emoji: string;
  mealType: MealType;
  serves: number;
  ingredients: Ingredient[];
  /** Ordered method. Plain strings on purpose — a numbered list is what you
   *  read one-handed at the stove. */
  steps: string[];
  /** Rough hands-on + cooking time, for the "what is quick" filter. */
  totalMinutes: number | null;
  /** False where the quantities are not really quantities — the pap guide is a
   *  ratio explainer, a mug cake is one mug and a fixed microwave time. */
  scalable: boolean;
  notes?: string;
}

/** What is on the cook list, and how many people it is being cooked for. */
export interface CookEntry {
  recipeId: string;
  /** null = the recipe's own serving size. */
  servings: number | null;
}

export const MIN_SERVES = 1;
export const MAX_SERVES = 20;

export interface ShoppingRow {
  itemKey: string;
  label: string;
  checked: boolean;
  custom: boolean;
}

export const MEAL_FILTERS: { key: MealType | 'all'; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'snack', label: 'Snacks' },
  { key: 'dessert', label: 'Puddings' },
  { key: 'side', label: 'Sides' },
];

/** Two speeds, because they answer different questions. 30 minutes is "can we
 *  make this on a weeknight"; 15 is "we are hungry now and nobody feels like
 *  cooking". */
export const TIME_FILTERS: { key: number | null; label: string }[] = [
  { key: null, label: 'Any time' },
  { key: 15, label: 'Under 15 min' },
  { key: 30, label: 'Under 30 min' },
];

// Aisle icons live in components/icons.tsx (lucide) — this stays UI-free
// so the pure list logic can run under node in tests.
export const CATEGORY_META: { key: Category; label: string }[] = [
  { key: 'meat', label: 'Meat & fish' },
  { key: 'veg', label: 'Fruit & veg' },
  { key: 'dairy', label: 'Dairy & eggs' },
  { key: 'bakery', label: 'Bakery' },
  { key: 'frozen', label: 'Frozen' },
  { key: 'pantry', label: 'Pantry' },
  { key: 'spices', label: 'Spices' },
  { key: 'other', label: 'Other' },
];

export const K = {
  bg:       '#FAF4E8',
  surface:  '#FFFDF8',
  raised:   '#F3EAD9',
  border:   '#E4D6BE',
  text:     '#3B2E20',
  sub:      '#75634B',
  muted:    '#A3937B',
  terra:    '#C4572E',
  terraDark:'#96401F',
  sage:     '#5F7D4F',
  honey:    '#B97F1E',
  display: "'Fraunces', Georgia, serif",
  body:    "'Inter', sans-serif",
};
