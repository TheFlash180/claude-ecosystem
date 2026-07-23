import { getSupabase } from '@ecosystem/shared';
import type { SupabaseClient } from '@supabase/supabase-js';

/** The shared env-configured client, or null when env vars are missing. */
export function sb(): SupabaseClient | null {
  try {
    return getSupabase();
  } catch {
    return null;
  }
}
