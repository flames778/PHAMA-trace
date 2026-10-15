import { useMemo, useState } from "react";
import type { Batch, Product, ScanResult } from "../types";
import {
  agentRouterChat,
  buildVerdictPrompt,
  isAgentRouterConfigured,
  resolveAgentRouterConfig,
} from "../lib/agentRouter";

export interface AgentPanelProps {
  result: ScanResult | null;
  product: Product | null;
  batch: Batch | null;
}

/**
 * The audience never configures models — the team provides them through the
 * environment. This panel is just: explain the current scan, ask a question,
 * read the answer. If no key is configured it says so plainly and points at
 * the pharmacist instead of exposing provider plumbing.
 */
export function AgentPanel({ result, product, batch }: AgentPanelProps) {
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cfg = useMemo(resolveAgentRouterConfig, []);
  const ready = isAgentRouterConfigured(cfg);

  const runChat = async (messages: { role: "system" | "user" | "assistant"; content: string }[]) => {
    if (!ready) {
      setError("The AI assistant is switched off in this demo. Your pharmacist can still explain any result.");
      return;
    }
    setBusy(true);
    setAnswer(null);
    setError(null);
    try {
      setAnswer(await agentRouterChat(messages, undefined, cfg));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleExplain = () => {
    if (!result) {
      setError("Run a scan first, then ask for an explanation.");
      return;
    }
    void runChat(buildVerdictPrompt(result, product, batch));
  };

  const handleAsk = () => {
    const q = question.trim();
    if (!q) return;
    const context = result
      ? `Current scan: ${result.verdict}, ${result.headline}. Reasons: ${result.reasons.join(" | ")}`
      : "No scan has been run yet.";
    void runChat([
      {
        role: "system",
        content:
          "You are a pharmacy decision-support assistant. Answer concisely for a pharmacist. Do not invent registry data. Always note this is decision support, not medical or legal advice.",
      },
      { role: "user", content: `${context}\n\nQuestion: ${q}` },
    ]);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display mb-1 text-[19px] font-bold text-slate-100">AI assistant</h2>
        <p className="max-w-xl text-[12.5px] leading-relaxed text-slate-500">
          {result
            ? `Explaining: ${result.headline}`
            : "Run a scan on the Verify tab and this assistant can explain it in plain words."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !result}
          onClick={handleExplain}
          className="pt-press rounded-lg bg-teal-500 px-4 py-2 text-[13px] font-semibold text-teal-950 transition hover:bg-teal-400 disabled:opacity-40"
        >
          {busy ? "Thinking…" : "Explain current scan"}
        </button>
      </div>

      <div className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAsk()}
          placeholder="Ask about stock, recalls, next steps…"
          aria-label="Ask the AI assistant"
          className="flex-1 rounded-lg border border-line bg-ink-soft px-3 py-2 text-[13px] text-slate-100 outline-none placeholder:text-slate-500 focus:border-teal-500/60"
        />
        <button
          type="button"
          disabled={busy || !question.trim()}
          onClick={handleAsk}
          className="pt-press rounded-lg bg-teal-500/15 px-4 py-2 text-[13px] font-medium text-teal-300 ring-1 ring-teal-400/40 transition hover:bg-teal-500/25 disabled:opacity-40"
        >
          Ask
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-rose-400/10 px-3 py-2 text-[12px] text-rose-200">{error}</p>
      )}
      {answer && (
        <div className="whitespace-pre-wrap rounded-xl border border-line bg-ink-soft/60 px-4 py-3 text-[13px] leading-relaxed text-slate-200">
          {answer}
        </div>
      )}

      <p className="text-[11px] text-slate-500">
        {ready ? `Consulting ${cfg.model}. ` : ""}An assistant, not an authority: always confirm
        with your pharmacist.
      </p>
    </div>
  );
}
