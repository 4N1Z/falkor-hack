// The adam job queue, stored as (:AdamJob) nodes in the workspace graph and drained by
// scripts/adam-worker.ts. One FalkorDB query claims a job atomically, so several worker
// slots can share a graph without a lock server. Every job has a dedupeKey, so the
// orchestrator can ask for the same work on every tick and only the first ask counts.

import { randomUUID } from "crypto";
import type { Graph } from "falkordb";
import { getWorkspaceGraph } from "../graph/client";
import {
  CANCEL_QUEUED_JOBS,
  CLAIM_JOB,
  COMPLETE_JOB,
  ENQUEUE_JOB,
  FAIL_JOB,
  GET_JOB,
  HEARTBEAT_JOB,
  JOB_COUNTS,
  JOBS_BY_KIND_STATUS,
  RECENT_JOBS,
  REQUEUE_STALE_JOBS,
  RESCHEDULE_JOB,
  RUNNING_PER_PROJECT,
} from "./queries";
import { parseJson, type AdamJob, type JobKind, type JobStatus } from "./types";

/** A job with no heartbeat for this long is assumed dead and requeued. */
export const STALE_MS = 5 * 60 * 1000;
const BACKOFF_MS = 30_000;

type Row = Omit<AdamJob, "payload" | "result" | "progress"> & { payload: string; result: string | null; progress: string };
const toJob = (r: Row): AdamJob => ({ ...r, payload: parseJson(r.payload, {}), result: r.result ? parseJson(r.result, null) : null, progress: parseJson(r.progress, {}) });

const params = <T>(p: T) => ({ params: p as never });

export interface EnqueueInput {
  projectId: string;
  kind: JobKind;
  /** What the job is about (paperId, methodId, briefId…); part of the default dedupe key */
  subject?: string | null;
  payload?: Record<string, unknown>;
  /** Lower runs first. Orchestrate 10, verification 40, extraction 50, search 60, analysis 70. */
  priority?: number;
  runAfter?: number;
  maxAttempts?: number;
  /** Defaults to `${kind}:${projectId}:${subject}`; add a version to force a re-run */
  dedupeKey?: string;
}

/** Enqueue a job. Returns the job id and whether this call created it. */
export async function enqueue(graph: Graph, input: EnqueueInput): Promise<{ id: string; created: boolean; status: JobStatus }> {
  const dedupeKey = input.dedupeKey ?? `${input.kind}:${input.projectId}:${input.subject ?? "-"}`;
  const res = await graph.query<{ id: string; status: JobStatus; created: boolean }>(
    ENQUEUE_JOB,
    params({
      id: randomUUID(),
      dedupeKey,
      projectId: input.projectId,
      kind: input.kind,
      subject: input.subject ?? null,
      payload: JSON.stringify(input.payload ?? {}),
      priority: input.priority ?? 100,
      runAfter: input.runAfter ?? Date.now(),
      maxAttempts: input.maxAttempts ?? 3,
      at: Date.now(),
    }),
  );
  const row = res.data?.[0];
  if (!row) throw new Error(`enqueue failed for ${dedupeKey}`);
  return { id: row.id, created: !!row.created, status: row.status };
}

/** Enqueue by workspace id (routes); the worker has the graph already. */
export async function enqueueInWorkspace(workspaceId: string, input: EnqueueInput) {
  return enqueue(await getWorkspaceGraph(workspaceId), input);
}

export async function reschedule(graph: Graph, jobId: string, runAfter: number, payload?: Record<string, unknown>) {
  await graph.query(RESCHEDULE_JOB, params({ id: jobId, runAfter, payload: payload ? JSON.stringify(payload) : null }));
}

/** Projects at their concurrency limit, so the claim query skips their jobs. */
export async function busyProjects(graph: Graph, limitOf: (projectId: string) => number): Promise<string[]> {
  const rows = (await graph.roQuery<{ projectId: string; n: number }>(RUNNING_PER_PROJECT)).data ?? [];
  return rows.filter((r) => r.projectId && r.n >= limitOf(r.projectId)).map((r) => r.projectId);
}

export async function claim(graph: Graph, worker: string, busy: string[]): Promise<AdamJob | null> {
  const res = await graph.query<Row>(CLAIM_JOB, params({ now: Date.now(), worker, busyProjects: busy }));
  const row = res.data?.[0];
  return row ? toJob(row) : null;
}

export async function heartbeat(graph: Graph, jobId: string, progress?: Record<string, unknown>) {
  await graph.query(HEARTBEAT_JOB, params({ id: jobId, now: Date.now(), progress: progress ? JSON.stringify(progress) : null }));
}

/** Marks the job done. False when this worker no longer holds it (requeued as stale, or finished elsewhere). */
export async function complete(graph: Graph, jobId: string, result: unknown, worker: string | null = null): Promise<boolean> {
  const res = await graph.query<{ id: string }>(COMPLETE_JOB, params({ id: jobId, worker, now: Date.now(), result: JSON.stringify(result ?? null).slice(0, 8000) }));
  return (res.data?.length ?? 0) > 0;
}

/** Retry with exponential backoff until maxAttempts; then failed. */
export async function fail(graph: Graph, job: AdamJob, err: unknown, worker: string | null = null) {
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
  const exhausted = job.attempts >= job.maxAttempts;
  const res = await graph.query<{ id: string }>(
    FAIL_JOB,
    params({
      id: job.id,
      worker,
      status: exhausted ? "failed" : "queued",
      error: message,
      runAfter: Date.now() + BACKOFF_MS * 2 ** Math.max(0, job.attempts - 1),
      now: Date.now(),
    }),
  );
  return { exhausted, message, held: (res.data?.length ?? 0) > 0 };
}

export async function requeueStale(graph: Graph): Promise<number> {
  const res = await graph.query<{ n: number }>(REQUEUE_STALE_JOBS, params({ now: Date.now(), staleMs: STALE_MS }));
  return res.data?.[0]?.n ?? 0;
}

export async function counts(graph: Graph, projectId: string) {
  const rows = (await graph.roQuery<{ status: JobStatus; kind: JobKind; n: number }>(JOB_COUNTS, params({ projectId }))).data ?? [];
  const byStatus: Partial<Record<JobStatus, number>> = {};
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + r.n;
  return { byStatus, rows };
}

export async function recent(graph: Graph, projectId: string, limit = 40): Promise<AdamJob[]> {
  return ((await graph.roQuery<Row>(RECENT_JOBS, params({ projectId, limit }))).data ?? []).map(toJob);
}

export async function byKindAndStatus(graph: Graph, projectId: string, kinds: JobKind[], statuses: JobStatus[]): Promise<AdamJob[]> {
  return ((await graph.roQuery<Row>(JOBS_BY_KIND_STATUS, params({ projectId, kinds, statuses }))).data ?? []).map(toJob);
}

export async function cancelQueued(graph: Graph, projectId: string, kinds: JobKind[] = []): Promise<number> {
  const res = await graph.query<{ n: number }>(CANCEL_QUEUED_JOBS, params({ projectId, kinds, now: Date.now() }));
  return res.data?.[0]?.n ?? 0;
}

export async function getJob(graph: Graph, jobId: string): Promise<AdamJob | null> {
  const row = (await graph.roQuery<Row>(GET_JOB, params({ id: jobId }))).data?.[0];
  return row ? toJob(row) : null;
}

/** Is any job of these kinds still queued or running? (Phase "ends when" checks.) */
export async function pending(graph: Graph, projectId: string, kinds: JobKind[]): Promise<number> {
  return (await byKindAndStatus(graph, projectId, kinds, ["queued", "running"])).length;
}
