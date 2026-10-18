// Auto-review — an optional pass a person asks for when the exception queue is long. It
// reviews every open item and comes back with a proposal, so the researcher can approve or
// reject hundreds at once instead of one by one. It does not decide anything itself: each
// item gets a suggestion (approve / reject / none when unsure), the queue shows the totals,
// and one click applies them as the researcher's decisions.
//   approve  a stricter typed judgement says the passage states this (exactly, or with
//            caveats), and for load-bearing items the graph corroborates it
//   reject   the passage does not state it, or states only a weaker version, confidently
//   none     unsure; and always for unsourced items (no claim without a source) and
//            conflicts (a person picks between two readings)

import { ADAM_QUERY_TIMEOUT_MS } from "../types";
import type { Graph } from "falkordb";
import { startRun } from "../../agents/base";
import { scoreMany } from "../../jev";
import { emit } from "../events";
import { CORROBORATION, SET_SUGGESTIONS } from "../queries-review";
import { queueItems, type QueueItem } from "../review";
import type { AdamProject } from "../types";

const RUBRIC = [
  "The passage does not state this; the statement is unsupported or contradicted by it",
  "The passage states only a weaker or different version",
  "The passage states this, with caveats or less precisely",
  "The passage states exactly this, including its numbers and conditions",
] as const;

const MIN_CONFIDENCE = 0.45;
const BATCH = 25;

export interface AutoReviewResult {
  reviewed: number;
  approve: number;
  reject: number;
  unsure: number;
  skipped: number;
}

const params = <T>(p: T) => ({ params: p as never, TIMEOUT: ADAM_QUERY_TIMEOUT_MS });

export async function runAutoReview(
  graph: Graph,
  workspaceId: string,
  project: AdamProject,
  opts: { kinds?: QueueItem["kind"][]; heartbeat?: (p: Record<string, unknown>) => Promise<void>; log?: (m: string) => void } = {},
): Promise<AutoReviewResult> {
  const run = await startRun("adam-verifier", workspaceId, { projectId: project.id, action: "auto-review", kinds: opts.kinds ?? "all" });
  const beat = opts.heartbeat ?? (async () => {});
  const log = opts.log ?? (() => {});
  const result: AutoReviewResult = { reviewed: 0, approve: 0, reject: 0, unsure: 0, skipped: 0 };
  const at = Date.now();

  const all = (await queueItems(graph, project.id)).filter((it) => !opts.kinds?.length || opts.kinds.includes(it.kind));
  // A person picks between two readings, and an unsourced item cannot be approved by anyone but a person
  const judgeable = all.filter((it) => it.kind !== "conflict" && it.kind !== "unsourced" && !!it.chunkText);
  const skippedRows = all.filter((it) => !judgeable.includes(it)).map((it) => ({ id: it.id, suggestion: null, level: null, confidence: 0, reason: it.kind === "conflict" ? "auto_review:conflict_needs_you" : "auto_review:unsourced_needs_you" }));
  result.skipped = skippedRows.length;
  if (skippedRows.length) await graph.query(SET_SUGGESTIONS, params({ projectId: project.id, rows: skippedRows, runId: run.runId, at }));
  await beat({ step: "start", total: judgeable.length, done: 0 });

  for (let i = 0; i < judgeable.length; i += BATCH) {
    const batch = judgeable.slice(i, i + BATCH);
    const [judged, corroboration] = await Promise.all([
      run.step(`judge.${i / BATCH + 1}`, () =>
        scoreMany(
          `Reviewing flagged extractions for the project "${project.title}". Judge each statement only against the passage given with it.`,
          batch.map((it) => ({ id: it.id, text: `Statement (${it.label}): ${it.text}\n\nPassage (p.${it.chunkPage || it.page}, ${it.chunkSection || it.section}):\n${it.chunkText.slice(0, 2200)}` })),
          "Does the passage state the statement?",
          RUBRIC,
        ),
        { source: "jev", args: { n: batch.length } },
      ),
      graph.roQuery<{ id: string; evidence: number; dependents: number }>(CORROBORATION, params({ ids: batch.map((it) => it.id) })).then((r) => new Map((r.data ?? []).map((x) => [x.id, x]))),
    ]);
    const rows = batch.map((it) => {
      const j = judged.result.get(it.id);
      result.reviewed++;
      if (!j || j.confidence < MIN_CONFIDENCE) {
        result.unsure++;
        return { id: it.id, suggestion: null, level: j?.level ?? null, confidence: j?.confidence ?? 0, reason: "auto_review:unsure" };
      }
      const c = corroboration.get(it.id);
      const corroborated = it.kind !== "load_bearing" || (c?.evidence ?? 0) > 0 || (c?.dependents ?? 0) > 0;
      if (j.level >= 2 && corroborated) {
        result.approve++;
        return { id: it.id, suggestion: "approve", level: j.level, confidence: j.confidence, reason: j.level === 3 ? "auto_review:exact" : "auto_review:with_caveats" };
      }
      if (j.level <= 1) {
        result.reject++;
        return { id: it.id, suggestion: "reject", level: j.level, confidence: j.confidence, reason: j.level === 0 ? "auto_review:not_in_source" : "auto_review:weaker_version" };
      }
      result.unsure++;
      return { id: it.id, suggestion: null, level: j.level, confidence: j.confidence, reason: "auto_review:uncorroborated" };
    });
    await graph.query(SET_SUGGESTIONS, params({ projectId: project.id, rows, runId: run.runId, at }));
    await beat({ step: "judge", total: judgeable.length, done: Math.min(judgeable.length, i + batch.length), approve: result.approve, reject: result.reject, unsure: result.unsure });
  }

  log(`auto-review: suggests approving ${result.approve}, rejecting ${result.reject}; unsure ${result.unsure}; ${result.skipped} left to a person`);
  await emit(graph, project.id, "auto_review_done", { ...result });
  await run.finish("ANSWERED", [result], project.createdBy);
  return result;
}
