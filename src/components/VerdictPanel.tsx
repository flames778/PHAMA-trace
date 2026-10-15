import type { Product, ScanResult, VisionCheck } from "../types";

const VERDICT_STYLE: Record<ScanResult["verdict"], { label: string; classes: string; dot: string }> = {
  genuine: {
    label: "GENUINE",
    classes: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
    dot: "bg-emerald-400",
  },
  suspicious: {
    label: "SUSPICIOUS",
    classes: "border-rose-400/40 bg-rose-400/10 text-rose-300",
    dot: "bg-rose-400",
  },
  unverifiable: {
    label: "CAN'T VERIFY",
    classes: "border-amber-400/40 bg-amber-400/10 text-amber-200",
    dot: "bg-amber-400",
  },
};

const STATUS_ICON: Record<VisionCheck["status"], string> = {
  pass: "✓",
  fail: "✕",
  warn: "!",
  skip: "–",
};

const STATUS_STYLE: Record<VisionCheck["status"], string> = {
  pass: "text-emerald-300",
  fail: "text-rose-300",
  warn: "text-amber-200",
  skip: "text-slate-500",
};

export interface VerdictPanelProps {
  result: ScanResult;
  product: Product | null;
  visionError: string | null;
}

export function VerdictPanel({ result, product, visionError }: VerdictPanelProps) {
  const style = VERDICT_STYLE[result.verdict];
  const vision = result.evidence.vision;

  return (
    <div className="pt-rise space-y-4">
      <div className={`rounded-xl border p-4 ${style.classes}`}>
        <div className="flex items-center gap-2.5">
          <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
          <span className="text-lg font-bold tracking-[0.14em]">{style.label}</span>
          <span className="ml-auto text-[12px] opacity-80">
            {Math.round(result.confidence * 100)}% confidence
          </span>
        </div>
        <p className="mt-2 text-[15px] font-semibold text-slate-100">{result.headline}</p>
        {product && (
          <p className="mt-1 text-[12px] text-slate-300/80">
            {product.brandName} · {product.genericName} {product.strength} · {product.manufacturer}
          </p>
        )}
      </div>

      <section>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Why
        </h3>
        <ul className="space-y-2">
          {result.reasons.map((reason, i) => (
            <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-slate-300">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-600" />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      </section>

      {result.evidence.flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {result.evidence.flags.map((f) => (
            <span
              key={f}
              className="rounded-md border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 font-mono text-[10.5px] text-rose-300"
            >
              {f}
            </span>
          ))}
        </div>
      )}

      {vision && (
        <section>
          <h3 className="mb-2 flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            <span>Packaging analysis</span>
            <span className="font-mono normal-case tracking-normal text-slate-400">
              aggregate {Number.isFinite(vision.score) ? `${(vision.score * 100).toFixed(0)}%` : "—"}
            </span>
          </h3>
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-ink-soft/60">
            {vision.checks.map((check) => (
              <div key={check.id} className="flex gap-3 px-3.5 py-2.5">
                <span className={`mt-px w-4 shrink-0 text-center text-[13px] font-bold ${STATUS_STYLE[check.status]}`}>
                  {STATUS_ICON[check.status]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[12.5px] font-medium text-slate-200">{check.label}</span>
                    {check.measured !== null && check.weight > 0 && (
                      <span className="font-mono text-[10.5px] text-slate-500">
                        {(check.measured * 100).toFixed(0)}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-slate-400">{check.detail}</p>
                  {check.measured !== null && check.weight > 0 && (
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className={`h-full rounded-full ${
                          check.status === "pass"
                            ? "bg-emerald-400/70"
                            : check.status === "warn"
                              ? "bg-amber-300/70"
                              : "bg-rose-400/70"
                        }`}
                        style={{ width: `${Math.max(2, Math.min(100, check.measured * 100))}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {visionError && (
        <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-200">
          Packaging analysis could not run: {visionError}
        </p>
      )}

      <p className="border-t border-line pt-3 text-[11px] leading-relaxed text-slate-500">
        Decision support only. This screen is not a laboratory test, a legal finding, or medical
        advice. Where the answer is anything other than genuine, quarantine the pack and escalate
        through the normal channel.
      </p>
    </div>
  );
}
