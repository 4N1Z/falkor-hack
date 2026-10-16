/**
 * adam worker — drains (:AdamJob) nodes from every workspace graph and runs their handlers.
 * Runs beside `next dev` (pnpm dev:all) or on its own:
 *
 *   node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/adam-worker.ts [--slots=4] [--once]
 *
 * Design (docs/adam-spec-creation.md, "One shared store, no side channels"): the queue is in
 * FalkorDB next to the research graph, a single query claims a job atomically, jobs heartbeat
 * while they run, and a job whose worker vanished is requeued after STALE_MS. Nothing here
 * imports next/server.
 */
import { hostname } from "os";
import { getFalkor, getWorkspaceGraph } from "../src/lib/graph/client";
import { HANDLERS, type JobContext } from "../src/lib/adam/handlers";
import * as jobs from "../src/lib/adam/jobs";
import { getProject } from "../src/lib/adam/project";
import { emit } from "../src/lib/adam/events";
import type { AdamJob } from "../src/lib/adam/types";

const SLOTS = Number(process.argv.find((a) => a.startsWith("--slots="))?.slice(8) ?? 4);
const ONCE = process.argv.includes("--once");
const POLL_MS = 2000;
const HEARTBEAT_MS = 30_000;
const WORKER = `${hostname()}#${process.pid}`;

let running = 0;
let stopping = false;
const concurrencyCache = new Map<string, number>();

const ts = () => new Date().toISOString().slice(11, 19);
const log = (msg: string) => console.log(`[adam ${ts()}] ${msg}`);

async function listWorkspaceGraphs(): Promise<string[]> {
  const names = await (await getFalkor()).list();
  return names.filter((n) => n.startsWith("ws:")).map((n) => n.slice(3));
}

async function concurrencyOf(workspaceId: string, projectId: string): Promise<number> {
  const key = `${workspaceId}/${projectId}`;
  const cached = concurrencyCache.get(key);
  if (cached) return cached;
  const project = await getProject(await getWorkspaceGraph(workspaceId), projectId).catch(() => null);
  const n = project?.maxConcurrency ?? 3;
  concurrencyCache.set(key, n);
  setTimeout(() => concurrencyCache.delete(key), 60_000).unref();
  return n;
}

async function runJob(workspaceId: string, job: AdamJob) {
  const graph = await getWorkspaceGraph(workspaceId);
  const handler = HANDLERS[job.kind];
  const label = `${job.kind}${job.subject ? `(${job.subject})` : ""} ${job.id.slice(0, 8)}`;
  const t0 = Date.now();
  const beat = setInterval(() => jobs.heartbeat(graph, job.id).catch(() => {}), HEARTBEAT_MS);
  beat.unref();
  try {
    if (!handler) throw new Error(`no handler for job kind ${job.kind}`);
    const ctx: JobContext = {
      workspaceId,
      graph,
      job,
      heartbeat: (progress) => jobs.heartbeat(graph, job.id, progress),
      log: (m) => log(`${label}: ${m}`),
    };
    const result = await handler(ctx);
    await jobs.complete(graph, job.id, result);
    // A cycling job (the orchestrator) asks to run again; this must follow the completion write
    const again = result && typeof result === "object" && "rescheduleAt" in result ? Number((result as { rescheduleAt: number }).rescheduleAt) : null;
    if (again) await jobs.reschedule(graph, job.id, again);
    log(`✓ ${label} in ${Date.now() - t0}ms${again ? ` · again in ${Math.max(0, Math.round((again - Date.now()) / 1000))}s` : ""}`);
  } catch (err) {
    const { exhausted, message } = await jobs.fail(graph, job, err);
    log(`${exhausted ? "✗ failed" : "↻ retry"} ${label}: ${message}`);
    if (job.projectId) await emit(graph, job.projectId, exhausted ? "job_failed" : "job_retry", { kind: job.kind, subject: job.subject, error: message });
  } finally {
    clearInterval(beat);
  }
}

/** One pass over every workspace graph: requeue the dead, claim what the free slots can take. */
async function poll() {
  const workspaces = await listWorkspaceGraphs();
  for (const workspaceId of workspaces) {
    if (stopping || running >= SLOTS) break;
    let graph;
    try {
      graph = await getWorkspaceGraph(workspaceId);
    } catch (err) {
      log(`cannot open ws:${workspaceId}: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    const stale = await jobs.requeueStale(graph).catch(() => 0);
    if (stale) log(`requeued ${stale} stale job(s) in ws:${workspaceId}`);

    while (!stopping && running < SLOTS) {
      const busy = await jobs.busyProjects(graph, () => 3);
      // Per-project limits beyond the default 3 are read from the project node
      const busyExact: string[] = [];
      for (const pid of busy) if ((await concurrencyOf(workspaceId, pid)) <= 3) busyExact.push(pid);
      const job = await jobs.claim(graph, WORKER, busyExact);
      if (!job) break;
      running++;
      runJob(workspaceId, job)
        .catch((err) => log(`unexpected error in ${job.kind}: ${err instanceof Error ? err.message : err}`))
        .finally(() => running--);
    }
  }
}

async function main() {
  log(`worker ${WORKER} up, ${SLOTS} slots${ONCE ? ", one pass" : ""}`);
  const stop = () => {
    if (stopping) return;
    stopping = true;
    log(`stopping after ${running} running job(s)…`);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  do {
    try {
      await poll();
    } catch (err) {
      log(`poll error: ${err instanceof Error ? err.message : err}`);
    }
    if (ONCE) {
      while (running > 0) await new Promise((r) => setTimeout(r, 200));
      break;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  } while (!stopping);

  while (running > 0) await new Promise((r) => setTimeout(r, 200));
  await (await getFalkor()).close();
  log("bye");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
