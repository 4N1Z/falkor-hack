// Structured LLM calls for the adam agents (spec rule 5: "Structured output only").
// Every call fills a zod schema through `chatModel()` (DeepSeek), is counted against the
// project's per-pass budget, and is retried once on a schema failure with the error quoted
// back, which is what usually fixes a malformed object.

import type { Graph } from "falkordb";
import { generateObject } from "ai";
import type { z } from "zod";
import { chatModel } from "@/lib/ai/models";
import { spend } from "./project";

export interface StructuredInput<S extends z.ZodTypeAny> {
  graph: Graph;
  projectId: string;
  schema: S;
  system: string;
  prompt: string;
  /** `heavy` for whole-paper reasoning (extractor, methods hunter, writer, falsifier) */
  tier?: "fast" | "heavy";
  temperature?: number;
  maxTokens?: number;
  /** Name shown in the trace */
  label: string;
}

export interface StructuredResult<T> {
  object: T;
  ms: number;
  /** Prompt + completion tokens when the provider reports them */
  tokens: number | null;
  attempts: number;
}

export async function structured<S extends z.ZodTypeAny>(input: StructuredInput<S>): Promise<StructuredResult<z.infer<S>>> {
  const t0 = Date.now();
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await generateObject({
        model: chatModel(input.tier ?? "fast"),
        schema: input.schema,
        system: input.system,
        prompt:
          attempt === 1
            ? input.prompt
            : `${input.prompt}\n\nYour previous answer did not match the required schema (${String(lastError instanceof Error ? lastError.message : lastError).slice(0, 400)}). Answer again, following the schema exactly.`,
        temperature: input.temperature ?? 0.2,
        maxTokens: input.maxTokens ?? 8000,
      });
      await spend(input.graph, input.projectId, { llmCalls: 1 });
      return {
        object: res.object,
        ms: Date.now() - t0,
        tokens: res.usage ? res.usage.promptTokens + res.usage.completionTokens : null,
        attempts: attempt,
      };
    } catch (err) {
      lastError = err;
      await spend(input.graph, input.projectId, { llmCalls: 1 });
      console.error(`[adam] ${input.label} attempt ${attempt} failed:`, err instanceof Error ? err.message : err);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${input.label} failed`);
}

/** Trim a passage for a prompt without cutting a word in half. */
export const clip = (text: string, max: number) => (text.length <= max ? text : text.slice(0, max).replace(/\s+\S*$/, "") + "…");
