import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Supabase is optional.
 *
 * The app reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from the build
 * environment. If they are absent it falls back to the bundled mock registry,
 * so the stage demo still works with no network and no account. Put the two
 * variables in a `.env.local` at the project root to switch it on.
 */
/**
 * Env resolution lives in ./env so this module and registry.ts cannot drift
 * apart again.
 */
const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey, { auth: { persistSession: false } }) : null;

export const usingSupabase = supabase !== null;

export const SUPABASE_CONFIG_HINT =
  "Create a Supabase project, paste supabase/schema.sql into the SQL editor, copy .env.example to .env.local with the project URL and anon key, then run npm run seed (scripts/seed-supabase.mts).";
