// Fetching for the today surface.
//
// Everything here is world data the apps already expose public-read — fixtures,
// programme structure, the cook list, releases, prices, the registry — so the
// hub reads it with the anon key exactly like each app does. There is no new
// RPC and no new policy.
//
// The baby row is the exception and is deliberately different: `babies` is
// "authenticated users full access", and every app is served from the same
// origin, so the Supabase client picks up the session baby-logger already
// stored. Signed in, the card appears; signed out — or for anyone else who
// loads the public site — the query returns nothing and it does not. RLS is
// the gate, so no household detail is published by adding this screen.
import { getSupabase, supabaseConfigured } from '@ecosystem/shared';
import type {
  BabyRow, CookRow, MarvelRow, PriceRow, RegistryCounts, SportRow, TodayInput,
  TrainingInput,
} from './today';

const EMPTY: TodayInput = {
  sport: [], training: null, cook: [], marvel: [], prices: [], baby: null, registry: null,
};

/** One failing source must not blank the whole screen — a card with no data
 *  just does not render. */
async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

async function fetchSport(sb: ReturnType<typeof getSupabase>): Promise<SportRow[]> {
  const { data } = await sb
    .from('sport_events')
    .select('sport, competition, home, away, home_flag, away_flag, event_date, venue')
    .gt('event_date', new Date().toISOString())
    .order('event_date', { ascending: true })
    .limit(1);
  return (data ?? []).map(r => ({
    sport: r.sport, competition: r.competition, home: r.home, away: r.away,
    homeFlag: r.home_flag, awayFlag: r.away_flag, date: r.event_date, venue: r.venue,
  }));
}

async function fetchTraining(sb: ReturnType<typeof getSupabase>): Promise<TrainingInput | null> {
  const { data: profile } = await sb
    .from('workout_profile')
    .select('program_id, program_started_on')
    .limit(1)
    .maybeSingle();
  if (!profile?.program_id) return null;

  const [{ data: program }, { data: days }] = await Promise.all([
    sb.from('workout_programs').select('title, weeks').eq('id', profile.program_id).maybeSingle(),
    sb.from('workout_program_days').select('label').eq('program_id', profile.program_id)
      .order('day_index'),
  ]);
  if (!program) return null;

  return {
    title: program.title,
    weeks: program.weeks,
    startedOn: profile.program_started_on,
    dayLabels: (days ?? []).map(d => d.label),
  };
}

/** The embedded recipe is a single row through the foreign key, but PostgREST
 *  types an embed as an array — take whichever shape comes back rather than
 *  asserting one. */
function embedded<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function fetchCook(sb: ReturnType<typeof getSupabase>): Promise<CookRow[]> {
  const { data } = await sb
    .from('mealprep_cook_list')
    .select('recipe_id, mealprep_recipes(name, emoji)')
    .order('added_at', { ascending: true });
  return (data ?? []).flatMap(row => {
    const recipe = embedded<{ name: string; emoji: string | null }>(row.mealprep_recipes);
    return recipe ? [{ name: recipe.name, emoji: recipe.emoji }] : [];
  });
}

async function fetchMarvel(sb: ReturnType<typeof getSupabase>): Promise<MarvelRow[]> {
  const { data } = await sb
    .from('marvel_titles')
    .select('title, release_date, media_type')
    .eq('date_tbc', false)
    .gte('release_date', new Date().toISOString().slice(0, 10))
    .order('release_date', { ascending: true })
    .limit(1);
  return (data ?? []).map(r => ({
    title: r.title, releaseDate: r.release_date, mediaType: r.media_type,
  }));
}

/** Every point for the tracked products, with the lowest worked out here
 *  rather than in SQL — a view would be one more thing to keep in step with
 *  the table. "Lowest seen" is all-time, so this cannot be windowed to recent
 *  points; it grows with the daily sync, and if the handful of tracked
 *  products ever becomes hundreds this is the query to revisit. */
async function fetchPrices(sb: ReturnType<typeof getSupabase>): Promise<PriceRow[]> {
  const { data: products } = await sb
    .from('pricewatch_products')
    .select('id, title')
    .is('delisted_at', null);
  if (!products || products.length === 0) return [];

  const { data: points } = await sb
    .from('pricewatch_prices')
    .select('product_id, price, captured_at')
    .in('product_id', products.map(p => p.id))
    .order('captured_at', { ascending: true });

  const byProduct = new Map<string, number[]>();
  for (const p of points ?? []) {
    const price = Number(p.price);
    if (!Number.isFinite(price)) continue;
    byProduct.set(p.product_id, [...(byProduct.get(p.product_id) ?? []), price]);
  }

  return products.flatMap(p => {
    const series = byProduct.get(p.id);
    if (!series || series.length === 0) return [];
    return [{
      title: p.title,
      latest: series[series.length - 1],
      lowest: Math.min(...series),
      points: series.length,
    }];
  });
}

async function fetchBaby(sb: ReturnType<typeof getSupabase>): Promise<BabyRow | null> {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null; // signed out: nothing to show, and nothing leaks
  const { data } = await sb
    .from('babies')
    .select('name, due_date, birth_date, week_anchor')
    .limit(1)
    .maybeSingle();
  // Once the baby is here the countdown is over and the app itself is the
  // place to look, so the card stands down rather than counting past zero.
  if (!data?.due_date || data.birth_date) return null;
  return { name: data.name, dueDate: data.due_date, weekAnchor: data.week_anchor };
}

/** Ids rather than an exact-count head request: the registry is under a
 *  hundred rows either way, and counting what came back needs no Prefer
 *  header or Content-Range parsing to go right. */
async function fetchRegistry(sb: ReturnType<typeof getSupabase>): Promise<RegistryCounts | null> {
  const [items, claims] = await Promise.all([
    sb.from('items').select('id'),
    sb.from('claims').select('id'),
  ]);
  if (!items.data) return null;
  return { items: items.data.length, claims: claims.data?.length ?? 0 };
}

export async function fetchToday(): Promise<TodayInput> {
  // getSupabase throws when the env vars are missing, which is the normal
  // state of a local build without .env.local — the tiles still work.
  if (!supabaseConfigured()) return EMPTY;
  const sb = getSupabase();

  const [sport, training, cook, marvel, prices, baby, registry] = await Promise.all([
    safe(() => fetchSport(sb), []),
    safe(() => fetchTraining(sb), null),
    safe(() => fetchCook(sb), []),
    safe(() => fetchMarvel(sb), []),
    safe(() => fetchPrices(sb), []),
    safe(() => fetchBaby(sb), null),
    safe(() => fetchRegistry(sb), null),
  ]);

  return { sport, training, cook, marvel, prices, baby, registry };
}
