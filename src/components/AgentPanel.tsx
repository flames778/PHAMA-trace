import { useState } from "react";
import type { Batch, Product, ScanResult } from "../types";
import {
  agentRouterChat,
  buildVerdictPrompt,
  clearAgentRouterKey,
  isAgentRouterConfigured,
  maskKey,
  resolveAgentRouterConfig,
  saveAgentRouterConfig,
  testAgentRouterConnection,
  AGENT_ROUTER_DEFAULT_BASE_URL,
  AGENT_ROUTER_DEFAULT_MODEL,
} from "../lib/agentRouter";

export interface AgentPanelProps {
  result: ScanResult | null;
  product: Product | null;
  batch: Batch | null;
}

export function AgentPanel({ result, product, batch }: AgentPanelProps) {
  const [cfg, setCfg] = useState(resolveAgentRouterConfig);
  const [keyInput, setKeyInput] = useState("");
  const [baseUrlInput, setBaseUrlInput] = useState(cfg.baseUrl);
  const [modelInput, setModelInput] = useState(cfg.model);
  const [status, setStatus] = useState<string | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);

  const configured = isAgentRouterConfigured(cfg);

  const flash = (msg: string, isError = false) => {
    setStatus(msg);
    setStatusError(isError);
  };

  const handleSave = () => {
    if (!keyInput.trim() && !cfg.apiKey) {
      flash("Paste your API key first.", true);
      return;
    }
    const next = saveAgentRouterConfig({
      // apiKey line was redacted by security policy. Restore it manually.
      baseUrl: baseUrlInput.trim() || AGENT_ROUTER_DEFAULT_BASE_URL,
      model: modelInput.trim() || AGENT_ROUTER_DEFAULT_MODEL,
    });
    setCfg(next);
    setKeyInput("");
    setBaseUrlInput(next.baseUrl);
    setModelInput(next.model);
    flash(next.apiKey ? `Saved. Key ${maskKey(next.apiKey)} · ${next.model}` : "Saved.", false);
  };

  const handleTest = async () => {
    setBusy(true);
    try {
      const msg = await testAgentRouterConnection(cfg);
      flash(msg, false);
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  };

  const handleClear = () => {
    const next = clearAgentRouterKey();
    setCfg(next);
    flash("Stored key removed from this browser.", false);
  };

  const runChat = async (messages: { role: "system" | "user" | "assistant"; content: string }[]) => {
    if (!isAgentRouterConfigured(cfg)) {
      flash("Add your AgentRouter API key below first.", true);
      return;
    }
    setBusy(true);
    setAnswer(null);
    try {
      const reply = await agentRouterChat(messages, undefined, cfg);
      setAnswer(reply);
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), true);
    } finally {
      setBusy(false);
    }
  };

  const handleExplain = () => {
    if (!result) {
      flash("Run a scan first, then ask for an explanation.", true);
      return;
    }
    void runChat(buildVerdictPrompt(result, product, batch));
  };

  const handleAsk = () => {
    const q = question.trim();
    if (!q) return;
    const context = result
      ? `Current scan context — verdict ${result.verdict}, code ${result.batchCode || "(empty)"}, headline: ${result.headline}. Reasons: ${result.reasons.join(" | ")}`
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
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-[15px] font-semibold text-slate-100">AI assistant · AgentRouter</h2>
        <p className="text-[12.5px] leading-relaxed text-slate-500">
          AgentRouter is configured as an OpenAI-compatible provider. Paste your API key here to
          enable plain-language explanations of scan results. The key stays in this browser
          (localStorage) unless you also set <span className="font-mono">VITE_AGENT_ROUTER_API_KEY</span> at
          build time.
        </p>
      </div>

      <section className="rounded-xl border border-line bg-ink-soft/60 p-4">
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Provider settings {configured ? <span className="text-teal-300">· connected</span> : <span className="text-amber-200">· needs key</span>}
        </h3>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <label className="block md:col-span-2">
            <span className="mb-1 block text-[11px] font-medium text-slate-400">
              API key {cfg.apiKey ? `(stored: ${maskKey(cfg.apiKey)})` : "(not set)"}
            </span>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="sk-tp-… or sk-…"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-lg border border-line bg-ink px-3 py-2 font-mono text-[13px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-teal-500/60"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-slate-400">Base URL</span>
            <input
              value={baseUrlInput}
              onChange={(e) => setBaseUrlInput(e.target.value)}
              placeholder={AGENT_ROUTER_DEFAULT_BASE_URL}
              spellCheck={false}
              className="w-full rounded-lg border border-line bg-ink px-3 py-2 font-mono text-[12px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-teal-500/60"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-slate-400">Model</span>
            <input
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
              placeholder={AGENT_ROUTER_DEFAULT_MODEL}
              spellCheck={false}
              className="w-full rounded-lg border border-line bg-ink px-3 py-2 font-mono text-[12px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-teal-500/60"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-teal-500/15 px-4 py-2 text-[13px] font-medium text-teal-300 ring-1 ring-teal-400/40 transition hover:bg-teal-500/25"
          >
            Save key
          </button>
          <button
            type="button"
            disabled={busy || !configured}
            onClick={() => void handleTest()}
            className="rounded-lg border border-line px-4 py-2 text-[13px] text-slate-300 transition hover:bg-white/5 disabled:opacity-40"
          >
            Test connection
          </button>
          {cfg.apiKey && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-lg border border-rose-400/30 px-4 py-2 text-[13px] text-rose-300 transition hover:bg-rose-400/10"
            >
              Remove stored key
            </button>
          )}
        </div>
        {status && (
          <p
            className={`mt-3 rounded-lg px-3 py-2 text-[12px] ${statusError ? "bg-rose-400/10 text-rose-200" : "bg-teal-500/10 text-teal-200"}`}
          >
            {status}
          </p>
        )}
        <p className="mt-2 text-[11px] text-slate-600">
          Works with <span className="font-mono">agent-router.net/aggregate/openai/v1</span>,{" "}
          <span className="font-mono">/gateway/openai/v1</span>, or{" "}
          <span className="font-mono">agentrouter.org/v1</span> — just change the Base URL.
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !result}
            onClick={handleExplain}
            className="rounded-lg bg-teal-500 px-4 py-2 text-[13px] font-semibold text-teal-950 transition hover:bg-teal-400 disabled:opacity-40"
          >
            {busy ? "Thinking…" : "Explain current scan"}
          </button>
        </div>
        {!result && (
          <p className="text-[12px] text-slate-500">
            No scan yet — run one from the Verify tab and it will appear here as context.
          </p>
        )}
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAsk()}
            placeholder="Ask about stock, recalls, next steps…"
            className="flex-1 rounded-lg border border-line bg-ink-soft px-3 py-2 text-[13px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-teal-500/60"
          />
          <button
            type="button"
            disabled={busy || !question.trim()}
            onClick={handleAsk}
            className="rounded-lg bg-teal-500/15 px-4 py-2 text-[13px] font-medium text-teal-300 ring-1 ring-teal-400/40 transition hover:bg-teal-500/25 disabled:opacity-40"
          >
            Ask
          </button>
        </div>
        {answer && (
          <div className="whitespace-pre-wrap rounded-xl border border-line bg-ink-soft/60 px-4 py-3 text-[13px] leading-relaxed text-slate-200">
            {answer}
          </div>
        )}
      </section>
    </div>
  );
}
