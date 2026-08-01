// Reads via RLS public-read selects; writes via definer RPCs. Recipe edits and
// the cook list are open to the household by design — one person adding a
// recipe and the other seeing it on the shopping list is the point. Only
// recipe deletes need the admin password.
import { sb } from './supabase';
import type { Ingredient, MealType, Recipe, ShoppingRow } from './config';

interface DbRecipeRow {
  id: string;
  name: string;
  emoji: string;
  meal_type: string;
  serves: number;
  ingredients: Ingredient[];
  steps: string[];
  total_minutes: number | null;
  notes: string | null;
}

export async function fetchRecipes(): Promise<Recipe[]> {
  const client = sb();
  if (!client) return [];
  const { data, error } = await client
    .from('mealprep_recipes')
    .select('id, name, emoji, meal_type, serves, ingredients, steps, total_minutes, notes')
    .order('name');
  if (error || !data) return [];
  return (data as DbRecipeRow[]).map(r => ({
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    mealType: r.meal_type as MealType,
    serves: r.serves,
    ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
    steps: Array.isArray(r.steps) ? r.steps : [],
    totalMinutes: r.total_minutes,
    notes: r.notes ?? undefined,
  }));
}

/** Recipe ids currently on the cook list, oldest first. */
export async function fetchCookList(): Promise<string[]> {
  const client = sb();
  if (!client) return [];
  const { data, error } = await client
    .from('mealprep_cook_list')
    .select('recipe_id')
    .order('added_at');
  if (error || !data) return [];
  return data.map(r => r.recipe_id as string);
}

export async function fetchTicks(): Promise<ShoppingRow[]> {
  const client = sb();
  if (!client) return [];
  const { data, error } = await client
    .from('mealprep_ticks')
    .select('item_key, label, checked, custom');
  if (error || !data) return [];
  return data.map(r => ({
    itemKey: r.item_key as string,
    label: r.label as string,
    checked: r.checked as boolean,
    custom: r.custom as boolean,
  }));
}

export async function cookAdd(recipeId: string): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const { data, error } = await client.rpc('mealprep_cook_add', { p_recipe_id: recipeId });
  return !error && data === true;
}

export async function cookRemove(recipeId: string): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const { data, error } = await client.rpc('mealprep_cook_remove', { p_recipe_id: recipeId });
  return !error && data === true;
}

export async function cookClear(): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const { data, error } = await client.rpc('mealprep_cook_clear');
  return !error && data === true;
}

export async function setTick(itemKey: string, label: string, checked: boolean): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const { data, error } = await client.rpc('mealprep_tick', {
    p_item_key: itemKey, p_label: label, p_checked: checked,
  });
  return !error && data === true;
}

export async function addExtra(label: string): Promise<string | null> {
  const client = sb();
  if (!client) return null;
  const { data, error } = await client.rpc('mealprep_extra_add', { p_label: label });
  return error ? null : (data as string | null);
}

export async function removeExtra(itemKey: string): Promise<boolean> {
  const client = sb();
  if (!client) return false;
  const { data, error } = await client.rpc('mealprep_extra_remove', { p_item_key: itemKey });
  return !error && data === true;
}

export interface RecipeDraft {
  id: string | null;
  name: string;
  emoji: string;
  mealType: MealType;
  serves: number;
  ingredients: Ingredient[];
  steps: string[];
  totalMinutes: number | null;
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
    p_steps: d.steps,
    p_total_minutes: d.totalMinutes,
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
