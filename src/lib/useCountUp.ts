import { useEffect, useState } from "react";

/**
 * Count-up for headline numerals (donut totals, band cards, landing stats).
 * Ease-out-expo over ~600ms, triggered on mount/target change, skipped
 * entirely under reduced motion. Returns the display value, not a string —
 * callers round and format.
 */
export function useCountUp(target: number, duration = 600): number {
  const [value, setValue] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? target
      : 0,
  );

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      setValue(target * (p === 1 ? 1 : 1 - Math.pow(2, -10 * p)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}
