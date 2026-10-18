/**
 * One env accessor for the whole app.
 *
 * The app runs in three places with three different views of "environment":
 *   - the Vite dev server and the production build, where config arrives as
 *     `import.meta.env`;
 *   - plain node (seed scripts, headless gates run with tsx), where
 *     `import.meta.env` does not exist and config is in `process.env`;
 *   - tests, which set `process.env` before importing modules.
 *
 * Reading one of the two and forgetting the other is a silent failure mode:
 * `supabase.ts` gained a `process.env` fallback while `registry.ts` kept only
 * `import.meta.env`, so under tsx the app quietly reported `mode: "local"`
 * and no headless check could ever reach server mode. Both now read here, so
 * there is one rule and one place to change it.
 *
 * `import.meta.env` wins when both are present, because that is what Vite
 * actually compiled into the bundle.
 */
const viteEnv =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

const nodeEnv =
  typeof globalThis === "undefined"
    ? undefined
    : (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

export const env: Record<string, string | undefined> = { ...nodeEnv, ...viteEnv };

/** True when Supabase is configured and the app should boot against it. */
export function hasSupabaseConfig(): boolean {
  return Boolean(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY);
}