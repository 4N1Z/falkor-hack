// Relevance layer: fast, typed judgements from JEV (TypeSafe System One).
// Every agent decision that is a classification or a score goes through here, not an LLM.
// One request carries many named questions, so scoring N candidates is a single ~100ms call.
// When JEV is unavailable (no key / error), each helper falls back to embeddings or a
// small structured LLM call so the product never depends on one vendor.

import { openai } from "@ai-sdk/openai";
import { TypeSafeClient, choice, noul, score } from "@typesafe-ai/sdk";
import { generateObject } from "ai";
import { z } from "zod";
import { embedTexts, paperEmbeddingText } from "./graph/embeddings";

export type JevSource = "jev" | "fallback";

export interface Judgement {
  /** Normalised to 0..1 */
  value: number;
  /** 0..1; how peaked the answer was (JEV), or a fixed estimate for the fallback */
  confidence: number;
}

export interface Candidate {
  id: string;
  title: string;
  abstract?: string | null;
}

export const SUPPORT_LEVELS = ["contradicts", "unrelated", "partial", "supports"] as const;
export type SupportLevel = (typeof SUPPORT_LEVELS)[number];

// Descriptive rubric levels give far better calibrated answers than bare numbers (JEV docs)
const RELEVANCE_RUBRIC = [
  "Unrelated: the paper is about a different topic than the sentence",
  "Same broad area, but would not be cited for this sentence",
  "Related work: a reasonable but indirect citation for this sentence",
  "Directly relevant: a strong citation for exactly what this sentence says",
] as const;

const SUPPORT_RUBRIC = [
  "The paper's findings contradict the claim",
  "The paper does not address the claim",
  "The paper partially supports the claim or supports a weaker version of it",
  "The paper directly supports the claim",
] as const;

let client: TypeSafeClient | null | undefined;
function jev(): TypeSafeClient | null {
  if (client === undefined) {
    try {
      client = process.env.TYPESAFE_API_KEY
        ? new TypeSafeClient({ defaultModel: "jev-latest", timeout: 8000 })
        : null;
    } catch (err) {
      console.error("[jev] client init failed, using fallback:", err);
      client = null;
    }
  }
  return client;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const paperText = (c: Candidate, max = 1200) =>
  `${c.title}${c.abstract ? `\n${c.abstract.slice(0, max)}` : ""}`;

async function withFallback<T>(
  label: string,
  viaJev: (c: TypeSafeClient) => Promise<T>,
  viaFallback: () => Promise<T>,
): Promise<{ result: T; source: JevSource; ms: number }> {
  const started = Date.now();
  const c = jev();
  if (c) {
    try {
      return { result: await viaJev(c), source: "jev", ms: Date.now() - started };
    } catch (err) {
      console.error(`[jev] ${label} failed, using fallback:`, err instanceof Error ? err.message : err);
    }
  }
  return { result: await viaFallback(), source: "fallback", ms: Date.now() - started };
}

const fallbackModel = () => openai("gpt-4o-mini");

/** Does this sentence make a claim that should carry a citation? (gate before searching) */
export function needsCitation(sentence: string, context?: string) {
  const state = context ? { sentence, surroundingText: context.slice(0, 1500) } : sentence;
  return withFallback<Judgement>(
    "needsCitation",
    async (c) => {
      const { answers } = await c.systemOne({
        state,
        questions: {
          cite: noul("The sentence states a factual, empirical or prior-work claim that a research paper should cite a source for", {
            false: "Opinion, transition, definition of the author's own plan, or common knowledge",
          }),
        },
      });
      return { value: answers.cite.noul, confidence: Math.abs(answers.cite.noul - 0.5) * 2 };
    },
    async () => {
      const { object } = await generateObject({
        model: fallbackModel(),
        schema: z.object({ probability: z.number().min(0).max(1) }),
        prompt: `Probability (0-1) that this sentence in a research draft makes a factual or prior-work claim that needs a citation.\nSentence: ${sentence}`,
      });
      return { value: object.probability, confidence: 0.5 };
    },
  );
}

/** Relevance of each candidate paper as a citation for `sentence`, in one request. */
export function scoreRelevance(sentence: string, candidates: Candidate[]) {
  return withFallback<Map<string, Judgement>>(
    "scoreRelevance",
    async (c) => {
      if (!candidates.length) return new Map();
      const questions = Object.fromEntries(
        candidates.map((cand, i) => [
          `c${i}`,
          score(`How relevant is this paper as a citation for the sentence?\nPaper: ${paperText(cand)}`, RELEVANCE_RUBRIC),
        ]),
      );
      const { answers } = await c.systemOne({ state: sentence, questions });
      return new Map(
        candidates.map((cand, i) => {
          const a = answers[`c${i}`];
          return [cand.id, { value: clamp01(a.score / (RELEVANCE_RUBRIC.length - 1)), confidence: a.confidence }];
        }),
      );
    },
    async () => {
      if (!candidates.length) return new Map();
      const [q, ...vecs] = await embedTexts([sentence, ...candidates.map((c) => paperEmbeddingText(c.title, c.abstract))]);
      const cos = (a: number[], b: number[]) => {
        let dot = 0, na = 0, nb = 0;
        for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
        return dot / (Math.sqrt(na) * Math.sqrt(nb));
      };
      // text-embedding-3-small cosine for "related" text sits roughly in 0.2–0.7
      return new Map(candidates.map((cand, i) => [cand.id, { value: clamp01((cos(q, vecs[i]) - 0.2) / 0.5), confidence: 0.4 }]));
    },
  );
}

/** How well each cited paper supports `claim` (Citation Checker). */
export function scoreSupport(claim: string, papers: Candidate[]) {
  return withFallback<Map<string, Judgement & { level: SupportLevel }>>(
    "scoreSupport",
    async (c) => {
      if (!papers.length) return new Map();
      const questions = Object.fromEntries(
        papers.map((p, i) => [`p${i}`, score(`Does this paper support the claim?\nPaper: ${paperText(p, 2000)}`, SUPPORT_RUBRIC)]),
      );
      const { answers } = await c.systemOne({ state: claim, questions });
      return new Map(
        papers.map((p, i) => {
          const a = answers[`p${i}`];
          return [p.id, { level: SUPPORT_LEVELS[Math.round(a.score)], value: clamp01(a.score / 3), confidence: a.confidence }];
        }),
      );
    },
    async () => {
      if (!papers.length) return new Map();
      const { object } = await generateObject({
        model: fallbackModel(),
        schema: z.object({ verdicts: z.array(z.object({ index: z.number(), level: z.enum(SUPPORT_LEVELS) })) }),
        prompt: `Claim: ${claim}\n\nFor each paper, judge whether it ${SUPPORT_LEVELS.join(" / ")} the claim.\n\n${papers
          .map((p, i) => `[${i}] ${paperText(p, 1500)}`)
          .join("\n\n")}`,
      });
      return new Map(
        papers.map((p, i) => {
          const level = object.verdicts.find((v) => v.index === i)?.level ?? "unrelated";
          return [p.id, { level, value: SUPPORT_LEVELS.indexOf(level) / 3, confidence: 0.5 }];
        }),
      );
    },
  );
}

/** Pick one label for `text` (agent router, note classification). */
export function classify<const L extends string>(text: string, instructions: string, labels: Record<L, string>) {
  return withFallback<{ label: L; confidence: number }>(
    "classify",
    async (c) => {
      const { answers } = await c.systemOne({ state: text, questions: { pick: choice(instructions, labels) } });
      return { label: answers.pick.choice as L, confidence: answers.pick.confidence };
    },
    async () => {
      const keys = Object.keys(labels) as [L, ...L[]];
      const { object } = await generateObject({
        model: fallbackModel(),
        schema: z.object({ label: z.enum(keys) }),
        prompt: `${instructions}\nOptions:\n${keys.map((k) => `- ${k}: ${labels[k]}`).join("\n")}\n\nText: ${text}`,
      });
      return { label: object.label as L, confidence: 0.5 };
    },
  );
}
