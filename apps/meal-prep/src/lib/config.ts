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
  /** Free-form labels for the filter chips. 'high-protein' marks a real
   *  protein serving in the dish itself, not cheese melted over carbohydrate. */
  tags: string[];
  notes?: string;
  /** Present on recipes that are made to be frozen; drives the Freezer tab. */
  freezer?: FreezerInfo;
}

/** When you would eat it out of the freezer. Separate from mealType on
 *  purpose: mealType shelves the recipe book for cooking tonight, and the
 *  freezer needs a breakfast that the book never had. */
export type FreezerCourse = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface FreezerInfo {
  course: FreezerCourse;
  /** Best within this many months at -18°C: a quality limit, not a safety one. */
  months: number;
  /** After the method: how to cool, portion, pack and label it. */
  freeze: string[];
  /** From the freezer to the plate. */
  reheat: string[];
}

export const FREEZER_COURSES: { key: FreezerCourse; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snacks' },
];

/** The tag filter chips, in display order. */
export const TAG_META: { tag: string; label: string }[] = [
  { tag: 'easy', label: 'Easy' },
  { tag: 'high-protein', label: 'High protein' },
];

/** 'easy' = few steps, little technique, mostly one pan or one tray: the
 *  recipes to reach for when tired. A judgement per recipe (seed.sql), not a
 *  formula — a ten-step soup can be easier than a five-step omelette. */
export const EASY_TAG = 'easy';

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
