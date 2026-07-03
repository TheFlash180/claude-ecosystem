import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Shared Supabase client for all ecosystem apps.
 *
 * Env vars are injected at build time by Vite:
 *  - VITE_SUPABASE_URL
 *  - VITE_SUPABASE_ANON_KEY
 *
 * Locally: put them in apps/<app>/.env.local (gitignored).
 * In CI: set as GitHub repository secrets (see README).
 *
 * SECURITY NOTE: the anon key is public by design. All data protection
 * comes from Row Level Security policies in Supabase. Never create a
 * table without an RLS policy.
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!url || !anonKey) {
    throw new Error(
      'Supabase env vars missing. Create .env.local with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see README).'
    );
  }

  client = createClient(url, anonKey);
  return client;
}

/** True when Supabase env vars are configured (lets apps degrade to localStorage). */
export function supabaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}
