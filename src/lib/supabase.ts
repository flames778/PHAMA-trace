import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase is optional.
 *
 * The app reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from the build
 * environment. If they are absent it falls back to the bundled mock registry,
 * so the stage demo still works with no network and no account. Put the two
 * variables in a `.env.local` at the project root to switch it on.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey, { auth: { persistSession: false } }) : null;

export const usingSupabase = supabase !== null;

export const SUPABASE_CONFIG_HINT =
  "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local, then run `npm run db:push` to apply supabase/schema.sql.";
