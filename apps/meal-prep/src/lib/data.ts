// Reads via RLS public-read selects; writes via definer RPCs. Recipe adds
// and plan edits are open to the household by design — only recipe deletes
// need the admin password.
import { sb } from './supabase';
import type {
  Ingredient, MealType, PlanSlot, Recipe, ShoppingRow, Slot,
} from './config';

interface DbRecipeRow {
  id: string;
  name: string;
  emoji: string;
  meal_type: string;
  serves: number;
  ingredients: Ingredient[];
  notes: string | null;
}

export async function fetchRecipes(): Promise<Recipe[]> {
  const client = sb();
  if (!client) return [];
  const { data, error } = await client
    .from('mealprep_recipes')
    .select('id, name, emoji, meal_type, serves, ingredients, notes')
    .order('name');
  if (error || !data) return [];
  return (data as DbRecipeRow[]).map(r => ({
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    mealType: r.meal_type as MealType,
    serves: r.serves,
    ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
    notes: r.notes ?? undefined,
  }));
}

export async function fetchPlan(weekStart: string): Promise<PlanSlot[]> {
  const client = sb();
  if (!client) return [];
  const { data, error } = await client
    .from('mealprep_plan')
    .select('day, slot, recipe_id, is_leftover')
    .eq('week_start', weekStart);
  if (error || !data) return [];
  return data.map(r => ({
    day: r.day as number,
    slot: r.slot as Slot,
    recipeId: r.recipe_id as string,
    isLeftover: r.is_leftover as boolean,
  }));
}

export async function fetchShopping(weekStart: string): Promise<ShoppingRow[]> {
  const client = sb();
  if (!client) return [];
  const { data, error } = await client
    .from('mealprep_shopping')
    .select('item_key, label, checked, custom')
    .eq('week_start', weekStart);
  if (error || !data) return [];
  return data.map(r => ({
    itemKey: r.item_key as string,
    label: r.label as string,
    checked: r.checked as boolean,
    custom: r.custom as boolean,
  }));
}

/** recipeId null clears the slot. */
export async function setSlot(
  weekStart: string, day: number, slot: Slot,
  recipeId: string | null, isLeftover = false,
): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const { data, error } = await client.rpc('mealprep_set_slot', {
    p_week: weekStart, p_day: day, p_slot: slot,
    p_recipe_id: recipeId, p_leftover: isLeftover,
  });
  return !error && data === true;
}

export interface RecipeDraft {
  id: string | null;
  name: string;
  emoji: string;
  mealType: MealType;
  serves: number;
  ingredients: Ingredient[];
  notes: string;
}

export async function upsertRecipe(d: RecipeDraft): Promise<string | null> {
  const client = sb();
  if (!client) return null;
  const { data, error } = await client.rpc('mealprep_upsert_recipe', {
    p_id: d.id,
    p_name: d.name,
    p_emoji: d.emoji,
    p_meal_type: d.mealType,
    p_serves: d.serves,
    p_ingredients: d.ingredients,
    p_notes: d.notes || null,
  });
  return error ? null : (data as string | null);
}

export async function adminCheck(password: string): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const { data, error } = await client.rpc('mealprep_admin_check', { p_password: password });
  return !error && data === true;
}

export async function deleteRecipe(id: string, password: string): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const { data, error } = await client.rpc('mealprep_delete_recipe', {
    p_id: id, p_password: password,
  });
  return !error && data === true;
}

export async function setTick(
  weekStart: string, itemKey: string, label: string, checked: boolean,
): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const { data, error } = await client.rpc('mealprep_set_tick', {
    p_week: weekStart, p_item_key: itemKey, p_label: label, p_checked: checked,
  });
  return !error && data === true;
}

export async function addExtra(weekStart: string, label: string): Promise<string | null> {
  const client = sb();
  if (!client) return null;
  const { data, error } = await client.rpc('mealprep_add_extra', {
    p_week: weekStart, p_label: label,
  });
  return error ? null : (data as string | null);
}

export async function removeExtra(weekStart: string, itemKey: string): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const { data, error } = await client.rpc('mealprep_remove_extra', {
    p_week: weekStart, p_item_key: itemKey,
  });
  return !error && data === true;
}
