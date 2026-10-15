/**
 * Minimal node ambient for the headless check scripts and the Express
 * server. They only read process.env and call process.exit(code); everything
 * else they touch is covered by the DOM lib (see tsconfig.scripts.json and
 * tsconfig.server.json). Kept here instead of @types/node so the demo
 * installs one fewer dependency.
 */
declare const process: {
  env: Record<string, string | undefined>;
  exit(code: number): never;
};
