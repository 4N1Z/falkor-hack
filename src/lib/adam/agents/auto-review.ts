// Auto-review — an optional pass a person asks for when the exception queue is long. It is
// not the Verifier again: it asks a stricter question of each flagged item with the passage
// beside it (JEV, typed), and reads the graph for corroboration (evidence edges, verified
// claims that depend on it). Only the clear cases are decided:
//   approve  the passage states exactly this (top rubric level, confident), and nothing in
//            the graph argues otherwise
//   reject   the passage does not state this at all (bottom level, confident)
//   leave    everything else, which is what the queue is for
// Decided items become agent_verified or retracted, never human_approved: a machine does not
// sign as a person. They are marked autoReviewed and stay auditable under the queue's filter.
// Unsourced items (quote not in the paper) are never auto-approved: no claim without a source.

import type { Graph } from "falkordb";
import { startRun } from "../../agents/base";
import { scoreMany } from "../../jev";
import { emit } from "../events";
import { AUTO_DECIDE_BATCH, CORROBORATION } from "../queries-review";
import { queueItems, type QueueItem } from "../review";
import type { AdamProject } from "../types";

const RUBRIC = [
  "The passage does not state this; the statement is unsupported or contradicted by it",
  "The passage states only a weaker or different version",
  "The passage states this, with caveats or less precisely",
  "The passage states exactly this, including its numbers and conditions",
] as const;

/** Decide only when the typed judgement is at an extreme and confident. */
const MIN_CONFIDENCE = 0.6;
const BATCH = 25;

export interface AutoReviewResult {
  considered: number;
  approved: number;
  rejected: number;
  left: number;
  skippedUnsourced: number;
}

const params = <T>(p: T) => ({ params: p as never });

export async function runAutoReview(
  graph: Graph,
  workspaceId: string,
  project: AdamProject,
  opts: { kinds?: QueueItem["kind"][]; heartbeat?: (p: Record<string, unknown>) => Promise<void>; log?: (m: string) => void } = {},
): Promise<AutoReviewResult> {
  const run = await startRun("adam-verifier", workspaceId, { projectId: project.id, action: "auto-review", kinds: opts.kinds ?? "all" });
  const beat = opts.heartbeat ?? (async () => {});
  const log = opts.log ?? (() => {});
  const result: AutoReviewResult = { considered: 0, approved: 0, rejected: 0, left: 0, skippedUnsourced: 0 };

  const all = await queueItems(graph, project.id);
  const items = all.filter((it) => (!opts.kinds?.length || opts.kinds.includes(it.kind)) && it.kind !== "conflict");
  // No claim without a source: an item whose quote is not in the paper is a person's call
  const sourced = items.filter((it) => {
    if (it.kind === "unsourced" || !it.chunkText) {
      result.skippedUnsourced++;
      return false;
    }
    return true;
  });
  result.considered = sourced.length;
  await beat({ step: "start", total: sourced.length, done: 0 });

  const at = Date.now();
  for (let i = 0; i < sourced.length; i += BATCH) {
    const batch = sourced.slice(i, i + BATCH);
    const [judged, corroboration] = await Promise.all([
      run.step(`judge.${i / BATCH + 1}`, () =>
        scoreMany(
          `Auditing flagged extractions for the project "${project.title}". Judge each statement only against the passage given with it. Be strict: only the top level when the passage states exactly this.`,
          batch.map((it) => ({ id: it.id, text: `Statement (${it.label}): ${it.text}\n\nPassage (p.${it.chunkPage || it.page}, ${it.chunkSection || it.section}):\n${it.chunkText.slice(0, 2200)}` })),
          "Does the passage state the statement?",
          RUBRIC,
        ),
        { source: "jev", args: { n: batch.length } },
      ),
      graph.roQuery<{ id: string; evidence: number; dependents: number }>(CORROBORATION, params({ ids: batch.map((it) => it.id) })).then((r) => new Map((r.data ?? []).map((x) => [x.id, x]))),
    ]);
    const rows: { id: string; state: string; reason: string; level: number; confidence: number }[] = [];
    for (const it of batch) {
      const j = judged.result.get(it.id);
      if (!j) {
        result.left++;
        continue;
      }
      const c = corroboration.get(it.id);
      // Load-bearing items need the graph to agree too: at least one evidence edge or a dependent verified claim
      const corroborated = it.kind !== "load_bearing" || (c?.evidence ?? 0) > 0 || (c?.dependents ?? 0) > 0;
      if (j.level === RUBRIC.length - 1 && j.confidence >= MIN_CONFIDENCE && corroborated) {
        rows.push({ id: it.id, state: "agent_verified", reason: "auto_review:exact", level: j.level, confidence: j.confidence });
        result.approved++;
      } else if (j.level === 0 && j.confidence >= MIN_CONFIDENCE) {
        rows.push({ id: it.id, state: "retracted", reason: "auto_review:not_in_source", level: j.level, confidence: j.confidence });
        result.rejected++;
      } else result.left++;
    }
    if (rows.length) await graph.query(AUTO_DECIDE_BATCH, params({ projectId: project.id, rows, runId: run.runId, at }));
    await beat({ step: "judge", total: sourced.length, done: Math.min(sourced.length, i + batch.length), approved: result.approved, rejected: result.rejected });
  }

  log(`auto-review: ${result.approved} approved, ${result.rejected} rejected, ${result.left} left for a person, ${result.skippedUnsourced} unsourced skipped`);
  await emit(graph, project.id, "auto_review_done", { ...result });
  await run.finish("ANSWERED", [result], project.createdBy);
  return result;
}
