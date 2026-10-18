import type { ReactNode } from "react";

/**
 * Empty state.
 *
 * These were dashed-border boxes with one grey sentence in the middle, which
 * read as "nothing here" and nothing else. An empty screen is an invitation:
 * it should say what this place is for and offer the one action that fills
 * it. Written that way, the same box does the work of explaining the feature.
 *
 * The mark is drawn from the app's own vocabulary (the trace glyph) rather
 * than an icon font or emoji, so it carries no new dependency and stays
 * legible at any size.
 */
export function EmptyState({
  title,
  body,
  action,
  compact = false,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`pt-card flex flex-col items-center justify-center text-center ${
        compact ? "px-5 py-8" : "px-6 py-12"
      }`}
    >
      {/* Recessed well rather than a dashed outline: a dashed border reads as
          "missing", a sunken surface reads as "ready and waiting". */}
      <span
        aria-hidden="true"
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-card shadow-[inset_0_1px_3px_rgb(58_22_8/0.08)]"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" focusable="false">
          <path
            d="M4 7h16M4 12h10M4 17h13"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="text-clay-400"
          />
        </svg>
      </span>
      <p className="font-display text-[15px] font-bold text-clay-100">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-clay-500">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/**
 * Loading skeleton.
 *
 * Reserves the shape of the content that is coming so the panel does not jump
 * when it arrives. The shimmer is a background-position animation rather than
 * an opacity fade, so it survives forced-colors mode (where box-shadow and
 * most colours are stripped) and degrades to a static block instead of
 * disappearing entirely.
 */
export function Skeleton({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={`space-y-2.5 ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="pt-skeleton h-3 rounded-full bg-clay-500/15"
          style={{ width: `${92 - i * 11}%`, animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  );
}

/** Panel-shaped skeleton for a lazy tab that has not arrived yet. */
export function PanelSkeleton({ label }: { label: string }) {
  return (
    <div className="pt-card p-5" role="status" aria-label={label}>
      <div className="pt-skeleton mb-4 h-5 w-44 rounded-full bg-clay-500/20" />
      <Skeleton rows={4} />
    </div>
  );
}