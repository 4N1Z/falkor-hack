// Verifier — one job: re-read the source for every item a card produced, never the
// Extractor's reasoning (spec rule 3: the producer never approves its own work). Per item:
//   1. hard check: the quote must be a verbatim substring of its chunk (then of any chunk of
//      the paper, since quotes can straddle the overlap). No match → low_confidence,
//      quote_not_found, no model is asked.
//   2. section check: a Results claim quoted from Discussion is not a Results claim.
//   3. judgement: does the passage state this? A typed rubric score (JEV, LLM fallback).
//   4. abstract-only papers: everything capped at low_confidence.
//   5. two cards (dual extraction): matching items merge, same-passage disagreements become
//      conflicts for the human queue.
//   6. cross-paper contradictions and load-bearing marks, which feed the Analyst and the queue.

import { ADAM_QUERY_TIMEOUT_MS } from "../types";
import type { Graph } from "falkordb";
import { startRun } from "../../agents/base";
import { embedTexts } from "../../graph/embeddings";
import { scoreMany, scoreSupport } from "../../jev";
import {
  CARD_ASSUMPTION_MENTIONS,
  CARD_ITEMS,
  CARD_METHOD_MENTIONS,
  MARK_CLAIM_CONFLICT,
  MARK_LOAD_BEARING_ASSUMPTIONS,
  MARK_LOAD_BEARING_METHODS,
  MERGE_CLAIM_INTO,
  NEAREST_FOREIGN_CLAIMS,
  PAPER_CARDS,
  PAPER_CHUNKS_FOR_PROMPT,
  PAPER_CLAIMS_FOR_MERGE,
  PAPER_FOR_EXTRACTION,
  REFRESH_METHOD_STATES,
  REPOINT_DEPENDS,
  REPOINT_SUPPORTS,
  REPOINT_USES,
  SET_CARD_STATE,
  SET_MENTION_STATE,
  SET_NODE_STATE,
  SET_PAPER_ADAM_STATE,
  UPSERT_CONTRADICTS,
} from "../queries-extract";
import type { AdamProject, NodeState } from "../types";
import { emit } from "../events";
import { FLAG_BRIEFS_EVIDENCE_CHANGED } from "../queries-saturation";

/** Items whose quote cannot be found in any passage of the paper. */
export const QUOTE_NOT_FOUND = "quote_not_found";

const RUBRIC = [
  "The passage does not state this",
  "The passage states a weaker or different version of this",
  "The passage states this with caveats",
  "The passage states exactly this",
] as const;

/** Same-claim threshold across the two extractors; below SAME but above RELATED on the same passage = a disagreement. */
const SAME_CLAIM = 0.85;
const RELATED_CLAIM = 0.6;
/** Cross-paper contradiction candidates: nearest verified claims within this cosine distance. */
const FOREIGN_DISTANCE = 0.3;
/** Load-bearing thresholds (spec open question: a count of dependants is the starting point). */
export const LOAD_BEARING_DEPENDENTS = 3;

export interface Verdict {
  id: string;
  label: string;
  state: NodeState;
  reason: string | null;
  level: number | null;
  chunkId: string | null;
  page: number | null;
}

/** Whitespace, quotes, dashes and ligatures differ between a model's copy and the PDF text; compare on a normalised form. */
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/­/g, "")
    .replace(/ﬁ/g, "fi")
    .replace(/ﬂ/g, "fl")
    .replace(/ﬀ/g, "ff")
    .replace(/ﬃ/g, "ffi")
    .replace(/ﬄ/g, "ffl")
    .replace(/(\w)-\s+(\w)/g, "$1$2")
    .replace(/[^a-z0-9%.,;:()\[\]'"/<>=+\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface ChunkRow {
  id: string;
  text: string;
  page: number;
  section: string;
}

/** Find the chunk that contains the quote: the claimed one first, then any. */
function locate(quote: string, claimed: string | null, chunks: ChunkRow[], norm: Map<string, string>): ChunkRow | null {
  const q = normalizeForMatch(quote);
  if (q.length < 12) return null;
  const first = claimed ? chunks.find((c) => c.id === claimed) : undefined;
  if (first && norm.get(first.id)!.includes(q)) return first;
  for (const c of chunks) if (norm.get(c.id)!.includes(q)) return c;
  // Tolerate a trimmed end: the longest prefix of at least 60% of the quote
  const min = Math.max(24, Math.floor(q.length * 0.6));
  for (const c of chunks) {
    const t = norm.get(c.id)!;
    let hi = q.length - 1;
    while (hi >= min) {
      if (t.includes(q.slice(0, hi))) return c;
      hi = Math.floor(hi * 0.85);
    }
  }
  return null;
}

const cosine = (a: number[], b: number[]) => {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};

export interface VerifyResult {
  paperId: string;
  cards: number;
  items: number;
  verified: number;
  low: number;
  retracted: number;
  quoteNotFound: number;
  merged: number;
  conflicts: number;
  contradictions: number;
  abstractOnly: boolean;
}

export async function runVerifier(
  graph: Graph,
  workspaceId: string,
  project: AdamProject,
  paperId: string,
  opts: { heartbeat?: (p: Record<string, unknown>) => Promise<void>; log?: (m: string) => void } = {},
): Promise<VerifyResult> {
  const run = await startRun("adam-verifier", workspaceId, { projectId: project.id, paperId });
  const beat = opts.heartbeat ?? (async () => {});
  const log = opts.log ?? (() => {});
  const params = <T>(p: T) => ({ params: p as never, TIMEOUT: ADAM_QUERY_TIMEOUT_MS });
  const at = Date.now();

  const paper = (await graph.roQuery<{ title: string; abstract: string | null; chunks: number }>(PAPER_FOR_EXTRACTION, params({ paperId }))).data?.[0];
  if (!paper) throw new Error(`paper ${paperId} not in graph`);
  await graph.query(SET_PAPER_ADAM_STATE, params({ paperId, state: "verifying", at, projectId: project.id }));

  let chunks = (await graph.roQuery<ChunkRow>(PAPER_CHUNKS_FOR_PROMPT, params({ paperId }))).data ?? [];
  const abstractOnly = chunks.length === 0;
  if (abstractOnly) chunks = paper.abstract ? [{ id: `${paperId}#abstract`, text: paper.abstract, page: 0, section: "abstract" }] : [];
  const norm = new Map(chunks.map((c) => [c.id, normalizeForMatch(c.text)]));
  const cards = (await graph.roQuery<{ id: string; slot: string; state: string }>(PAPER_CARDS, params({ projectId: project.id, paperId }))).data ?? [];
  if (!cards.length) throw new Error("no extraction card to verify");

  const totals: VerifyResult = { paperId, cards: cards.length, items: 0, verified: 0, low: 0, retracted: 0, quoteNotFound: 0, merged: 0, conflicts: 0, contradictions: 0, abstractOnly };

  for (const card of cards) {
    const items = (await graph.roQuery<{ label: string; id: string; text: string; quote: string; chunkId: string | null; section: string; confidence: number }>(CARD_ITEMS, params({ cardId: card.id }))).data ?? [];
    const assumptions = (await graph.roQuery<{ id: string; text: string; quote: string; chunkId: string | null; confidence: number; state: string }>(CARD_ASSUMPTION_MENTIONS, params({ cardId: card.id }))).data ?? [];
    const mentions = (await graph.roQuery<{ id: string; name: string; mentionName: string; quote: string; chunkId: string | null; confidence: number }>(CARD_METHOD_MENTIONS, params({ cardId: card.id }))).data ?? [];
    const all = [
      ...items.map((i) => ({ ...i, kind: "node" as const })),
      ...assumptions.filter((a) => a.state === "extracted").map((a) => ({ id: a.id, label: "Assumption", text: a.text, quote: a.quote, chunkId: a.chunkId, section: "", confidence: a.confidence, kind: "node" as const })),
      ...mentions.map((m) => ({ id: m.id, label: "Method", text: `The paper uses the method "${m.mentionName}"`, quote: m.quote, chunkId: m.chunkId, section: "", confidence: m.confidence, kind: "mention" as const })),
    ];
    totals.items += all.length;

    // 1–2. Hard checks
    const verdicts = new Map<string, Verdict>();
    const toJudge: { id: string; text: string; chunk: ChunkRow; label: string }[] = [];
    for (const it of all) {
      const found = locate(it.quote, it.chunkId, chunks, norm);
      if (!found) {
        verdicts.set(it.id, { id: it.id, label: it.label, state: "low_confidence", reason: QUOTE_NOT_FOUND, level: null, chunkId: null, page: null });
        totals.quoteNotFound++;
        continue;
      }
      if (it.label === "Claim" && it.section && found.section !== "unknown" && found.section !== it.section) {
        verdicts.set(it.id, { id: it.id, label: it.label, state: "low_confidence", reason: `section_mismatch:${it.section}->${found.section}`, level: null, chunkId: found.id, page: found.page });
        continue;
      }
      toJudge.push({ id: it.id, text: it.text, chunk: found, label: it.label });
    }

    // 3. Judgement, batched per card, 25 items per request
    for (let i = 0; i < toJudge.length; i += 25) {
      const batch = toJudge.slice(i, i + 25);
      const judged = await run.step(
        `judge.${card.slot}.${i / 25 + 1}`,
        () =>
          scoreMany(
            `Verifying extractions from the paper "${paper.title}". Judge each statement only against the passage given with it.`,
            batch.map((b) => ({ id: b.id, text: `Statement: ${b.text}\n\nPassage (p.${b.chunk.page}, ${b.chunk.section}):\n${b.chunk.text.slice(0, 2200)}` })),
            "Does the passage state the statement?",
            RUBRIC,
          ),
        { source: "jev", args: { n: batch.length } },
      );
      for (const b of batch) {
        const j = judged.result.get(b.id) ?? { level: 2, confidence: 0.3 };
        const state: NodeState = j.level >= 3 ? "agent_verified" : j.level === 2 ? "low_confidence" : j.level === 1 ? "low_confidence" : "retracted";
        const reason = j.level >= 3 ? null : j.level === 2 ? "with_caveats" : j.level === 1 ? "weaker_version" : "not_in_source";
        verdicts.set(b.id, { id: b.id, label: b.label, state, reason, level: j.level, chunkId: b.chunk.id, page: b.chunk.page });
      }
      await beat({ step: "judge", card: card.slot, done: i + batch.length, of: toJudge.length });
    }

    // 4. Abstract-only cap
    if (abstractOnly) {
      for (const v of verdicts.values()) {
        if (v.state === "agent_verified") {
          v.state = "low_confidence";
          v.reason = "abstract_only";
        }
      }
    }

    // Write
    const nodeRows = [...verdicts.values()].filter((v) => v.label !== "Method").map((v) => ({ id: v.id, state: v.state, reason: v.reason, chunkId: v.chunkId, page: v.page, confidence: v.level === null ? null : Math.max(0.1, v.level / 3) }));
    const mentionRows = [...verdicts.values()].filter((v) => v.label === "Method").map((v) => ({ id: v.id, state: v.state, reason: v.reason }));
    for (let i = 0; i < nodeRows.length; i += 100) await graph.query(SET_NODE_STATE, params({ rows: nodeRows.slice(i, i + 100), runId: run.runId, at }));
    if (mentionRows.length) await graph.query(SET_MENTION_STATE, params({ rows: mentionRows, cardId: card.id, runId: run.runId, at }));
    for (const v of verdicts.values()) {
      if (v.state === "agent_verified") totals.verified++;
      else if (v.state === "retracted") totals.retracted++;
      else totals.low++;
    }
    await graph.query(
      SET_CARD_STATE,
      params({ cardId: card.id, state: "verified", runId: run.runId, at, verdicts: JSON.stringify({ verified: totals.verified, low: totals.low, retracted: totals.retracted, quoteNotFound: totals.quoteNotFound }) }),
    );
  }
  await graph.query(REFRESH_METHOD_STATES, params({ projectId: project.id }));

  // 5. Dual extraction: match claims across slots
  if (cards.length >= 2) {
    const claims = (await graph.roQuery<{ id: string; slot: string; text: string; chunkId: string; state: string; embedding: number[] }>(PAPER_CLAIMS_FOR_MERGE, params({ projectId: project.id, paperId }))).data ?? [];
    const a = claims.filter((c) => c.slot === "a");
    const b = claims.filter((c) => c.slot === "b");
    const taken = new Set<string>();
    for (const cb of b) {
      let best: { c: typeof cb; sim: number } | null = null;
      for (const ca of a) {
        if (taken.has(ca.id) || ca.chunkId !== cb.chunkId) continue;
        const sim = cosine(ca.embedding, cb.embedding);
        if (!best || sim > best.sim) best = { c: ca, sim };
      }
      if (!best) continue;
      if (best.sim >= SAME_CLAIM) {
        taken.add(best.c.id);
        await graph.query(MERGE_CLAIM_INTO, params({ dupId: cb.id, keepId: best.c.id, dupText: cb.text }));
        await graph.query(REPOINT_SUPPORTS, params({ dupId: cb.id, keepId: best.c.id }));
        await graph.query(REPOINT_USES, params({ dupId: cb.id, keepId: best.c.id }));
        await graph.query(REPOINT_DEPENDS, params({ dupId: cb.id, keepId: best.c.id }));
        totals.merged++;
      } else if (best.sim >= RELATED_CLAIM && best.c.state !== "retracted" && cb.state !== "retracted") {
        // Same passage, different reading: the system has found an ambiguity
        taken.add(best.c.id);
        await graph.query(MARK_CLAIM_CONFLICT, params({ aId: best.c.id, bId: cb.id }));
        totals.conflicts++;
      }
    }
    await beat({ step: "merge", merged: totals.merged, conflicts: totals.conflicts });
  }

  // 6. Cross-paper contradictions among verified claims
  const mine = ((await graph.roQuery<{ id: string; slot: string; text: string; chunkId: string; state: string; embedding: number[] }>(PAPER_CLAIMS_FOR_MERGE, params({ projectId: project.id, paperId }))).data ?? []).filter(
    (c) => c.state === "agent_verified" || c.state === "human_approved",
  );
  for (const c of mine) {
    const near = (await graph.roQuery<{ id: string; text: string; title: string; score: number }>(NEAREST_FOREIGN_CLAIMS, params({ projectId: project.id, paperId, k: 6, v: c.embedding })).catch(() => ({ data: [] }))).data ?? [];
    const cands = near.filter((n) => n.score <= FOREIGN_DISTANCE);
    if (!cands.length) continue;
    const judged = await scoreSupport(c.text, cands.map((n) => ({ id: n.id, title: `From "${n.title}"`, abstract: n.text })));
    for (const n of cands) {
      const j = judged.result.get(n.id);
      if (j?.level === "contradicts" && j.confidence >= 0.4) {
        await graph.query(UPSERT_CONTRADICTS, params({ aId: c.id, bId: n.id, by: "agent:adam-verifier", runId: run.runId, at, confidence: j.confidence, reason: "verifier: opposite findings on the same point" }));
        totals.contradictions++;
      }
    }
  }
  if (mine.length) await beat({ step: "contradictions", found: totals.contradictions });
  // Living briefs (spec "Stale graph"): a new contradiction of evidence a brief rests on flags the brief
  if (totals.contradictions) {
    const flagged = (await graph.roQuery<{ id: string; statement: string; newClaim: string }>(FLAG_BRIEFS_EVIDENCE_CHANGED, params({ projectId: project.id, since: at - 1000, at: Date.now() })).catch(() => ({ data: [] }))).data ?? [];
    for (const f of flagged) await emit(graph, project.id, "brief_evidence_changed", { hypothesisId: f.id, statement: f.statement.slice(0, 120), newClaim: f.newClaim.slice(0, 160) });
  }

  // 7. Load-bearing marks (project-wide; cheap)
  await graph.query(MARK_LOAD_BEARING_ASSUMPTIONS, params({ projectId: project.id, threshold: LOAD_BEARING_DEPENDENTS }));
  await graph.query(MARK_LOAD_BEARING_METHODS, params({ projectId: project.id, threshold: LOAD_BEARING_DEPENDENTS }));

  await graph.query(SET_PAPER_ADAM_STATE, params({ paperId, state: "done", at: Date.now(), projectId: project.id }));
  run.highlight.add(paperId);
  log(`verified ${totals.verified}/${totals.items}, low ${totals.low}, retracted ${totals.retracted}, quote-not-found ${totals.quoteNotFound}, merged ${totals.merged}, conflicts ${totals.conflicts}, contradictions ${totals.contradictions}`);
  await run.finish("ANSWERED", [totals], project.createdBy);
  return totals;
}

/** Keep the embed import used for callers that verify a single new item (queue "correct" action re-checks). */
export const embedForVerify = embedTexts;
