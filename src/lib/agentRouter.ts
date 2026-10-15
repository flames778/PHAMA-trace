import type { Batch, Product, ScanResult } from "../types";

/**
 * AgentRouter provider.
 *
 * AgentRouter exposes an OpenAI-compatible API, so this client speaks plain
 * `POST {baseUrl}/chat/completions` with `Authorization: Bearer <key>`.
 * It works with either public surface:
 *   - https://agent-router.net/aggregate/openai/v1  (AI Aggregate, billed)
 *   - https://agent-router.net/gateway/openai/v1    (Gateway passthrough)
 *   - https://agentrouter.org/v1                    (alternate AgentRouter host)
 * or any custom base URL you paste in the UI.
 *
 * Where the key comes from (first non-empty wins):
 *   1. The settings form in the app (stored in localStorage, per-browser).
 *   2. Build-time env vars: VITE_AGENT_ROUTER_API_KEY,
 *      VITE_AGENT_ROUTER_BASE_URL, VITE_AGENT_ROUTER_MODEL.
 *
 * The key is never hardcoded. Paste yours in the "AI assistant" tab.
 */

export interface AgentRouterConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export const AGENT_ROUTER_DEFAULT_BASE_URL = "https://agent-router.net/aggregate/openai/v1";
export const AGENT_ROUTER_DEFAULT_MODEL = "gpt-4o-mini";

const LS_KEY = "pharmatrace:agent-router:key:v1";
const LS_BASE_URL = "pharmatrace:agent-router:baseUrl:v1";
const LS_MODEL = "pharmatrace:agent-router:model:v1";

function readLocal(key: string): string {
  if (typeof localStorage === "undefined") return "";
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function env(name: string): string {
  try {
    const v = (import.meta.env as Record<string, unknown>)[name];
    return typeof v === "string" ? v.trim() : "";
  } catch {
    return "";
  }
}

export function resolveAgentRouterConfig(): AgentRouterConfig {
  const baseUrl =
    readLocal(LS_BASE_URL) || env("VITE_AGENT_ROUTER_BASE_URL") || AGENT_ROUTER_DEFAULT_BASE_URL;
  const model = readLocal(LS_MODEL) || env("VITE_AGENT_ROUTER_MODEL") || AGENT_ROUTER_DEFAULT_MODEL;
  const apiKey = readLocal(LS_KEY) || env("VITE_AGENT_ROUTER_API_KEY");
  return { apiKey, baseUrl: normaliseBaseUrl(baseUrl), model: model.trim() };
}

/** Persist the key + options the user pastes into the settings form. */
export function saveAgentRouterConfig(partial: Partial<AgentRouterConfig>): AgentRouterConfig {
  if (typeof localStorage !== "undefined") {
    try {
      if (partial.apiKey !== undefined) localStorage.setItem(LS_KEY, partial.apiKey.trim());
      if (partial.baseUrl !== undefined)
        localStorage.setItem(LS_BASE_URL, normaliseBaseUrl(partial.baseUrl));
      if (partial.model !== undefined) localStorage.setItem(LS_MODEL, partial.model.trim());
    } catch {
      /* private mode — settings just won't persist */
    }
  }
  return resolveAgentRouterConfig();
}

export function clearAgentRouterKey(): AgentRouterConfig {
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* ignore */
    }
  }
  return resolveAgentRouterConfig();
}

export function isAgentRouterConfigured(cfg?: AgentRouterConfig): boolean {
  const c = cfg ?? resolveAgentRouterConfig();
  return c.apiKey.length > 0 && c.baseUrl.length > 0 && c.model.length > 0;
}

function normaliseBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

export function maskKey(key: string): string {
  const k = key.trim();
  if (k.length <= 8) return k ? "••••" : "";
  return `${k.slice(0, 3)}••••${k.slice(-4)}`;
}

/** Minimal OpenAI-compatible chat call through AgentRouter. */
export async function agentRouterChat(
  messages: ChatMessage[],
  opts?: { signal?: AbortSignal; maxTokens?: number; temperature?: number },
  cfgOverride?: AgentRouterConfig,
): Promise<string> {
  const cfg = cfgOverride ?? resolveAgentRouterConfig();
  if (!cfg.apiKey) {
    throw new Error("No AgentRouter API key set. Paste yours in the AI assistant tab first.");
  }
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    signal: opts?.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      max_tokens: opts?.maxTokens ?? 600,
      temperature: opts?.temperature ?? 0.3,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AgentRouter ${res.status}: ${text.slice(0, 300) || res.statusText}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (json.error?.message) throw new Error(`AgentRouter: ${json.error.message}`);
  const content = json.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) throw new Error("AgentRouter returned an empty reply.");
  return content;
}

/** Lightweight connectivity check — lists models, falls back to a ping prompt. */
export async function testAgentRouterConnection(cfgOverride?: AgentRouterConfig): Promise<string> {
  const cfg = cfgOverride ?? resolveAgentRouterConfig();
  if (!cfg.apiKey) throw new Error("No API key set.");
  const res = await fetch(`${cfg.baseUrl}/models`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
  });
  if (res.ok) {
    const json = (await res.json()) as { data?: Array<{ id?: string }> };
    const ids = (json.data ?? []).map((m) => m.id).filter(Boolean) as string[];
    const match = ids.includes(cfg.model)
      ? `Model "${cfg.model}" is available.`
      : ids.length > 0
        ? `Connected. Model "${cfg.model}" not in catalog; e.g. try "${ids[0]}".`
        : "Connected.";
    return match;
  }
  // Some gateways don't expose /models — fall back to a tiny chat call.
  await agentRouterChat([{ role: "user", content: "Reply with the word ok." }], { maxTokens: 8 }, cfg);
  return "Connected (chat ping succeeded).";
}

/** Build a pharmacist-facing explanation prompt from the current verdict. */
export function buildVerdictPrompt(
  result: ScanResult,
  product: Product | null,
  batch: Batch | null,
): ChatMessage[] {
  const lines = [
    `Verdict: ${result.verdict} (${Math.round(result.confidence * 100)}% confidence)`,
    `Headline: ${result.headline}`,
    `Batch code: ${result.batchCode || "(empty)"}`,
    product ? `Product: ${product.brandName} (${product.genericName} ${product.strength}) by ${product.manufacturer}` : null,
    batch ? `Batch status: ${batch.status}, expires ${batch.expiresOn}` : null,
    `Flags: ${result.evidence.flags.join(", ") || "none"}`,
    `Reasons:`,
    ...result.reasons.map((r) => `- ${r}`),
  ].filter(Boolean) as string[];
  return [
    {
      role: "system",
      content:
        "You are a pharmacy decision-support assistant. Explain medicine verification results in plain language for a pharmacist. Be concise, never invent batch data, and always end by reminding them this is decision support, not a lab test or legal finding. If the verdict is not genuine, advise quarantine and escalation.",
    },
    { role: "user", content: `Explain this scan result:\n${lines.join("\n")}` },
  ];
}
