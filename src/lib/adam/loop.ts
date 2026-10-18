// The living loop (spec rule 1, "Loop, not line"; "Stale graph"). A pass ends at experiment
// design; the next pass starts back at the question with sharper sub-questions drawn from
// what the attacks and the path search left open. A scheduled re-sweep brings in papers that
// have cited the core since the last sweep, and briefs whose evidence changed are flagged.

import { ADAM_QUERY_TIMEOUT_MS } from "./types";
import type { Graph } from "falkordb";
import { emit } from "./events";
import * as jobs from "./jobs";
import { PRIORITY, startProject } from "./orchestrator";
import { CORE_OPENALEX_IDS, NEXT_PASS, OPEN_ATTACKS, OPEN_QUESTIONS, PASS_SUMMARY, SET_LAST_SWEEP } from "./queries-saturation";
import { clusterStats } from "./saturation";

const params = <T>(p: T) => ({ params: p as never, TIMEOUT: ADAM_QUERY_TIMEOUT_MS });

export interface Carryover {
  openAttacks: { kind: string; text: string; status: string; hypothesis: string; hypothesisStatus: string }[];
  openQuestions: { kind: string; text: string; chainsNeeding: number }[];
  briefs: { pass: number; status: string; statement: string }[];
  saturated: string[];
}

/** What the Scoper reads on pass N+1: the open attacks, the gaps, the fate of each brief, which clusters are saturated. */
export async function carryover(graph: Graph, projectId: string): Promise<Carryover> {
  const [openAttacks, openQuestions, briefs, stats] = await Promise.all([
    graph.roQuery<Carryover["openAttacks"][number]>(OPEN_ATTACKS, params({ projectId })).then((r) => r.data ?? []),
    graph.roQuery<Carryover["openQuestions"][number]>(OPEN_QUESTIONS, params({ projectId })).then((r) => r.data ?? []),
    graph.roQuery<Carryover["briefs"][number]>(PASS_SUMMARY, params({ projectId })).then((r) => r.data ?? []),
    clusterStats(graph, projectId),
  ]);
  return { openAttacks, openQuestions, briefs, saturated: stats.filter((s) => s.saturated).map((s) => s.label) };
}

/** Start the next pass: back to the question, budget reset, orchestrator running. */
export async function nextPass(graph: Graph, workspaceId: string, projectId: string, userId: string) {
  const r = await graph.query<{ pass: number }>(NEXT_PASS, params({ id: projectId, at: Date.now() }));
  const pass = r.data?.[0]?.pass ?? 0;
  await emit(graph, projectId, "pass_started", { pass, by: userId });
  await startProject(graph, workspaceId, projectId);
  return pass;
}

/**
 * Re-sweep: a forward citation ring over works that cited the core papers since the last
 * sweep. Runs as a search_ring job with `recentSince`; the Searcher uses the recent-citing
 * endpoint instead of the full forward ring, triages and reads as usual, and the Verifier's
 * cross-paper contradictions flag any brief whose evidence changed.
 */
export async function scheduleResweep(graph: Graph, projectId: string, pass: number, userId: string | null, sinceMs: number) {
  const cores = (await graph.roQuery<{ paperId: string }>(CORE_OPENALEX_IDS, params({ projectId }))).data ?? [];
  if (!cores.length) return { queued: false, reason: "no core papers with OpenAlex ids" };
  const since = new Date(sinceMs).toISOString().slice(0, 10);
  const job = await jobs.enqueue(graph, {
    projectId,
    kind: "search_ring",
    subject: `citation · re-sweep since ${since}`,
    payload: { ring: "citation", round: 9, pass, recentSince: since, resweep: true },
    priority: PRIORITY.search_ring,
    dedupeKey: `search_ring:${projectId}:resweep:${since}`,
    maxAttempts: 2,
  });
  await graph.query(SET_LAST_SWEEP, params({ id: projectId, at: Date.now() }));
  await emit(graph, projectId, "resweep_scheduled", { since, by: userId, created: job.created });
  return { queued: job.created, since };
}
