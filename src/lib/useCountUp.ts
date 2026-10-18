import { useEffect, useState } from "react";

/**
 * Motion helpers for numerals and charts.
 *
 * Both hooks share one hard requirement: the resting value must always be
 * correct, whatever the browser is doing. requestAnimationFrame is throttled
 * to a standstill in a background or hidden tab, so a purely rAF-driven
 * animation freezes at its starting value and the user sees real data
 * reported as a lie — band cards sat at "0 critical shelves" until the tab
 * was focused. Every animation here therefore ends on a timer, which
 * browsers still fire when hidden, and jumps straight to the final value
 * when the page starts hidden or reduced motion is on.
 */

function prefersReduced(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function pageHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

/** 0 -> 1 on an ease-out-expo curve. Safe to use for pure decoration. */
export function useProgress(duration = 600): number {
  const [value, setValue] = useState(() => (prefersReduced() || pageHidden() ? 1 : 0));

  useEffect(() => {
    if (prefersReduced() || pageHidden()) {
      setValue(1);
      return;
    }
    let raf = 0;
    let settled = false;
    const t0 = performance.now();
    const settle = () => {
      if (settled) return;
      settled = true;
      setValue(1);
    };
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      if (p >= 1) {
        settle();
        return;
      }
      setValue(1 - Math.pow(2, -10 * p));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // The guarantee: if rAF never fires (hidden tab), the number is still
    // correct a beat later.
    const failsafe = window.setTimeout(settle, duration + 150);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(failsafe);
    };
  }, [duration]);

  return value;
}

/**
 * Count-up for headline numerals (donut totals, band cards, landing stats).
 * Returns the display value, not a string — callers round and format.
 */
export function useCountUp(target: number, duration = 600): number {
  const [value, setValue] = useState(() => (prefersReduced() || pageHidden() ? target : 0));

  useEffect(() => {
    if (prefersReduced() || pageHidden()) {
      setValue(target);
      return;
    }
    let raf = 0;
    let settled = false;
    const t0 = performance.now();
    const settle = () => {
      if (settled) return;
      settled = true;
      setValue(target);
    };
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      if (p >= 1) {
        settle();
        return;
      }
      setValue(target * (1 - Math.pow(2, -10 * p)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const failsafe = window.setTimeout(settle, duration + 150);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(failsafe);
    };
  }, [target, duration]);

  return value;
}