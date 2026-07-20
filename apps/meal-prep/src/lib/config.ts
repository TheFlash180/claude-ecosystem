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

export const SLOTS: { key: Slot; label: string; emoji: string }[] = [
  { key: 'lunch', label: 'Lunch', emoji: '🌤️' },
  { key: 'dinner', label: 'Dinner', emoji: '🌙' },
];

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const CATEGORY_META: { key: Category; label: string; emoji: string }[] = [
  { key: 'meat', label: 'Meat & fish', emoji: '🥩' },
  { key: 'veg', label: 'Fruit & veg', emoji: '🥕' },
  { key: 'dairy', label: 'Dairy & eggs', emoji: '🥛' },
  { key: 'bakery', label: 'Bakery', emoji: '🍞' },
  { key: 'frozen', label: 'Frozen', emoji: '🧊' },
  { key: 'pantry', label: 'Pantry', emoji: '🥫' },
  { key: 'spices', label: 'Spices', emoji: '🧂' },
  { key: 'other', label: 'Other', emoji: '🛒' },
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
