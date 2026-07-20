// Meal Prep: types + visual identity. Deliberately NOT a Watch app —
// warm kitchen tones on cream, Fraunces serif display. Light theme.

export type Slot = 'lunch' | 'dinner';
export type MealType = Slot | 'any';
export type Category =
  | 'meat' | 'veg' | 'dairy' | 'bakery' | 'pantry' | 'spices' | 'frozen' | 'other';

export interface Ingredient {
  n: string;      // name
  q: number | string;  // quantity ('' when it's just "some")
  u: string;      // unit ('' = count)
  c: Category;    // shopping aisle
}

export interface Recipe {
  id: string;
  name: string;
  emoji: string;
  mealType: MealType;
  serves: number;
  ingredients: Ingredient[];
  notes?: string;
}

export interface PlanSlot {
  day: number;         // 0 = Monday
  slot: Slot;
  recipeId: string;
  isLeftover: boolean; // filled by "cook double"
}

export interface ShoppingRow {
  itemKey: string;
  label: string;
  checked: boolean;
  custom: boolean;
}

export const SLOTS: { key: Slot; label: string }[] = [
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
];

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Aisle icons live in components/icons.tsx (lucide) — this stays UI-free
// so the pure plan logic can run under node in tests.
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
