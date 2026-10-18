import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

/**
 * BE-3. Applies supabase/migrations/*.sql to the linked project.
 *
 * Thin wrapper around the Supabase CLI so the documented path is one command
 * instead of three, and so a missing link fails with instructions rather than
 * a wall of CLI output. Schema only: rows come from `npm run seed`.
 *
 * Run with: npm run db:push
 */

const linked = existsSync("supabase/.temp/project-ref");
const version = spawnSync("npx", ["--no-install", "supabase", "--version"], {
  encoding: "utf8",
  shell: process.platform === "win32",
});

if (version.error || version.status !== 0) {
  console.error(
    "Supabase CLI not found. Install it with:\n" +
      "  npm i -g supabase\n" +
      "Or paste supabase/migrations/20261018000000_init_schema.sql into the\n" +
      "dashboard SQL editor (Database -> SQL editor) instead.",
  );
  process.exit(1);
}

if (!linked) {
  console.error(
    "No project linked yet. One-time setup:\n\n" +
      "  npx supabase login\n" +
      "  npx supabase link --project-ref <your-project-ref>\n\n" +
      "The project ref is the first segment of your project URL:\n" +
      "  https://<ref>.supabase.co\n\n" +
      "Then re-run: npm run db:push",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
console.log(`Applying supabase/migrations -> linked project${args.length ? ` (${args.join(" ")})` : ""}\n`);
const res = spawnSync("npx", ["--no-install", "supabase", "db", "push", ...args], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(res.status ?? 1);