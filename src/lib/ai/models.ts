// The one place that decides which model writes text. Everything that generates prose or
// structured output (agents, chat, editor AI, JEV fallbacks) calls `chatModel()`.
// DeepSeek V4 via the AI SDK provider; embeddings are Cohere (see graph/embeddings.ts).

import { createDeepSeek } from "@ai-sdk/deepseek";

/** `deepseek-v4-flash` (fast, cheap) by default; set DEEPSEEK_MODEL=deepseek-v4-pro for harder tasks. */
export const CHAT_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

/**
 * DeepSeek V4 reasons ("thinks") before answering by default, and those tokens count against
 * max_tokens: a 40-token ghost-text budget came back empty, and a two-field object spent 345
 * tokens thinking. Our prompts are short, grounded tasks where that only adds latency and cost,
 * so thinking is off unless DEEPSEEK_THINKING=1. The v4 AI SDK provider has no option for this,
 * so it's injected into the request body.
 */
const THINKING = process.env.DEEPSEEK_THINKING === "1" ? "enabled" : "disabled";

const withThinkingFlag: typeof fetch = async (url, init) => {
  if (init?.body && typeof init.body === "string" && init.headers) {
    try {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      body.thinking ??= { type: THINKING };
      init = { ...init, body: JSON.stringify(body) };
    } catch {
      // not JSON: send as-is
    }
  }
  return fetch(url, init);
};

const deepseek = createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY, fetch: withThinkingFlag });

/**
 * `heavy` is for the adam agents that reason over whole papers (extractor, methods hunter,
 * hypothesis writer, falsifier): set DEEPSEEK_HEAVY_MODEL=deepseek-v4-pro to give them the
 * larger model while everything else stays on flash.
 */
export const HEAVY_MODEL = process.env.DEEPSEEK_HEAVY_MODEL || CHAT_MODEL;

export const chatModel = (tier: "fast" | "heavy" = "fast") => deepseek(tier === "heavy" ? HEAVY_MODEL : CHAT_MODEL);
