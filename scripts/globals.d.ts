/**
 * Minimal node ambient for the headless check scripts. The scripts only ever
 * call process.exit(code); everything else they touch is covered by the DOM
 * lib (see tsconfig.scripts.json). Kept here instead of @types/node so the
 * demo installs one fewer dependency.
 */
declare const process: {
  exit(code: number): never;
};
