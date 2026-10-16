import type { CustodyEvent, Location } from "../types";
import { EVENT_LABELS } from "../lib/ledger";
import { formatStamp } from "../lib/format";

const KIND_TONE: Record<CustodyEvent["eventType"], string> = {
  released: "border-sage-400/40 bg-sage-400/10 text-sage-300",
  shipped: "border-steel-400/40 bg-steel-400/10 text-steel-300",
  received: "border-terra-400/40 bg-terra-400/10 text-terra-300",
  dispensed: "border-clay-400/30 bg-clay-400/10 text-clay-300",
  returned: "border-ochre-400/40 bg-ochre-400/10 text-ochre-200",
  flagged: "border-rose-400/50 bg-rose-400/10 text-rose-300",
  recalled: "border-rose-500/60 bg-rose-500/15 text-rose-200",
};

export interface CustodyTimelineProps {
  events: CustodyEvent[];
  locationById: (id: string) => Location | null;
  chainIntact: boolean;
  brokenAtEventId: string | null;
}

export function CustodyTimeline({
  events,
  locationById,
  chainIntact,
  brokenAtEventId,
}: CustodyTimelineProps) {
  if (events.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-card/60 px-4 py-6 text-center text-[12.5px] text-clay-500">
        No custody events recorded for this batch.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] ${
          chainIntact
            ? "border-sage-400/25 bg-sage-400/5 text-sage-200"
            : "border-rose-400/40 bg-rose-400/10 text-rose-200"
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${chainIntact ? "bg-sage-400" : "bg-rose-400"}`} />
        {chainIntact
          ? `Hash chain verifies across ${events.length} events`
          : `Hash chain broken at ${brokenAtEventId}`}
        <span className="ml-auto font-mono text-[10.5px] opacity-70">
          sha256 · linked
        </span>
      </div>

      <ol className="relative ml-2 space-y-0 border-l border-line pl-4">
        {events.map((e) => {
          const from = e.fromLocationId ? locationById(e.fromLocationId) : null;
          const to = e.toLocationId ? locationById(e.toLocationId) : null;
          const route =
            from && to && from.id !== to.id ? `${from.name} → ${to.name}` : (to ?? from)?.name ?? "—";
          return (
            <li key={e.id} className="relative pb-4 last:pb-0">
              <span
                className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-canvas ${
                  e.eventType === "flagged" || e.eventType === "recalled" ? "bg-rose-400" : "bg-terra-400"
                }`}
              />
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${KIND_TONE[e.eventType]}`}
                >
                  {EVENT_LABELS[e.eventType]}
                </span>
                <span className="font-mono text-[10.5px] text-clay-500">{e.id}</span>
              </div>
              <p className="mt-1 text-[12.5px] text-clay-200">{route}</p>
              {e.quantity > 0 && (
                <p className="text-[11.5px] text-clay-400">{e.quantity.toLocaleString()} units</p>
              )}
              {e.note && <p className="mt-0.5 text-[11.5px] leading-snug text-clay-500">{e.note}</p>}
              <p className="mt-1 text-[10.5px] text-clay-500">
                {String(e.actor ?? "unknown")} · {formatStamp(String(e.occurredAt ?? ""))}
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-clay-600" title={e.eventHash ?? e.id}>
                hash {(e.eventHash ?? "").slice(0, 16)}…
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
