import { getSupabase, supabaseConfigured } from '@ecosystem/shared';

export { supabaseConfigured };

export function supabase() {
  return getSupabase();
}
