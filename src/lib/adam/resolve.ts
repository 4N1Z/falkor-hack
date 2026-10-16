// Entity resolution for the graph's shared nodes (Method, Assumption, later Instrument).
// Two papers that say "cryo-EM" and "cryo-electron microscopy" must land on one Method node,
// or the saturation bar never fills (every paper would add "new" nodes forever) and holes
// between clusters would be fake. Order: exact name key → nearest embedding under a
// per-label distance threshold → create. Every merge is logged with its distance so the
// thresholds can be tuned on the benchmark, and the queue offers an unmerge.

import type { Graph } from "falkordb";
import { embedTexts } from "../graph/embeddings";
import { ADD_ASSUMPTION_ALIAS, ADD_METHOD_ALIAS, CREATE_ASSUMPTION, CREATE_METHOD, METHOD_BY_KEY, NEAREST_ASSUMPTIONS, NEAREST_METHODS } from "./queries-extract";

/** Cosine distances below which two names are the same entity (starting points; tuned on the benchmark). */
export const MERGE_DISTANCE = { method: 0.12, assumption: 0.1 } as const;

const STOP = new Set(["the", "a", "an", "of", "for", "with", "and", "or", "to", "in", "on", "by", "via", "using", "based", "approach", "method", "methods", "technique"]);

/** Normalised name for exact matching: lowercase, no punctuation, no stopwords, singular last token. */
export function nameKey(name: string): string {
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t && !STOP.has(t));
  if (tokens.length) tokens[tokens.length - 1] = tokens[tokens.length - 1].replace(/(ies)$/, "y").replace(/(?<!s)s$/, "");
  return tokens.join(" ");
}

export interface Resolved {
  id: string;
  created: boolean;
  /** Distance to the node it was merged into (0 for exact key matches) */
  distance: number | null;
  mergedWith: string | null;
}

export interface MergeLog {
  label: "method" | "assumption";
  text: string;
  into: string;
  intoText: string;
  distance: number;
}

const params = <T>(p: T) => ({ params: p as never });

export interface MethodInput {
  projectId: string;
  paperId: string;
  name: string;
  quote: string;
  chunkId: string;
  page: number;
  confidence: number;
  runId: string;
  embedding?: number[];
}

export async function resolveMethod(graph: Graph, input: MethodInput, log: MergeLog[]): Promise<Resolved> {
  const key = nameKey(input.name);
  const exact = (await graph.roQuery<{ id: string; name: string }>(METHOD_BY_KEY, params({ projectId: input.projectId, nameKey: key }))).data?.[0];
  if (exact) {
    if (exact.name !== input.name) await graph.query(ADD_METHOD_ALIAS, params({ id: exact.id, alias: input.name }));
    return { id: exact.id, created: false, distance: 0, mergedWith: exact.id };
  }
  const embedding = input.embedding ?? (await embedTexts([input.name], "document"))[0];
  const near = (await graph.roQuery<{ id: string; name: string; score: number }>(NEAREST_METHODS, params({ projectId: input.projectId, k: 5, v: embedding })).catch(() => ({ data: [] }))).data ?? [];
  const best = near[0];
  if (best && best.score <= MERGE_DISTANCE.method) {
    await graph.query(ADD_METHOD_ALIAS, params({ id: best.id, alias: input.name }));
    log.push({ label: "method", text: input.name, into: best.id, intoText: best.name, distance: best.score });
    return { id: best.id, created: false, distance: best.score, mergedWith: best.id };
  }
  const id = `method:${input.projectId.slice(0, 8)}:${key.replace(/\s+/g, "-").slice(0, 60)}:${Math.random().toString(36).slice(2, 6)}`;
  await graph.query(
    CREATE_METHOD,
    params({
      id,
      projectId: input.projectId,
      name: input.name,
      nameKey: key,
      at: Date.now(),
      confidence: input.confidence,
      runId: input.runId,
      embedding,
      quote: input.quote,
      chunkId: input.chunkId,
      page: input.page,
      paperId: input.paperId,
    }),
  );
  return { id, created: true, distance: null, mergedWith: null };
}

export interface AssumptionInput {
  projectId: string;
  paperId: string;
  cardId: string;
  slot: string;
  localId: string;
  text: string;
  stated: boolean;
  quote: string;
  chunkId: string;
  page: number;
  confidence: number;
  runId: string;
  textVersion: number;
  embedding?: number[];
}

export async function resolveAssumption(graph: Graph, input: AssumptionInput, log: MergeLog[]): Promise<Resolved> {
  const embedding = input.embedding ?? (await embedTexts([input.text], "document"))[0];
  const near = (await graph.roQuery<{ id: string; text: string; score: number }>(NEAREST_ASSUMPTIONS, params({ projectId: input.projectId, k: 5, v: embedding })).catch(() => ({ data: [] }))).data ?? [];
  const best = near[0];
  if (best && best.score <= MERGE_DISTANCE.assumption) {
    await graph.query(ADD_ASSUMPTION_ALIAS, params({ id: best.id, alias: input.text }));
    log.push({ label: "assumption", text: input.text, into: best.id, intoText: best.text, distance: best.score });
    return { id: best.id, created: false, distance: best.score, mergedWith: best.id };
  }
  const id = `assumption:${input.projectId.slice(0, 8)}:${Math.random().toString(36).slice(2, 10)}`;
  await graph.query(
    CREATE_ASSUMPTION,
    params({
      id,
      projectId: input.projectId,
      text: input.text,
      at: Date.now(),
      stated: input.stated,
      confidence: input.confidence,
      runId: input.runId,
      embedding,
      quote: input.quote,
      chunkId: input.chunkId,
      page: input.page,
      paperId: input.paperId,
      cardId: input.cardId,
      slot: input.slot,
      localId: input.localId,
      textVersion: input.textVersion,
    }),
  );
  return { id, created: true, distance: null, mergedWith: null };
}
