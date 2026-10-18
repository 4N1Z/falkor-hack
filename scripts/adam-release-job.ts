// Release a job that a worker holds but is not finishing (a worker that hung, or one that runs on
// another machine without the keys it needs), and queue a fresh copy for the next free worker.
//
//   node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/adam-release-job.ts \
//     --workspace <workspaceId> --project <projectId> [--kind search_ring] [--job <jobId>]
//
// The held job node is deleted rather than requeued, so a worker that wakes up later and tries to
// finish it finds nothing to write to. The fresh job carries the same kind, subject, payload,
// priority and dedupe key, so the orchestrator treats it as the run that counts.

import * as jobs from "../src/lib/adam/jobs";
import { getWorkspaceGraph } from "../src/lib/graph/client";
import { hostname } from "os";

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : fallback;
  if (!v && fallback === undefined) throw new Error(`--${name} is required`);
  return v ?? "";
};

async function main() {
  const workspaceId = arg("workspace");
  const projectId = arg("project");
  const kind = arg("kind", "");
  const jobId = arg("job", "");
  const graph = await getWorkspaceGraph(workspaceId);
  const now = Date.now();
  const held = (
    await graph.roQuery<{ id: string; kind: string; subject: string | null; payload: string; priority: number; dedupeKey: string; maxAttempts: number; by: string | null; hbAgeS: number }>(
      `MATCH (j:AdamJob {projectId: $projectId, status: 'running'})
       WHERE ($jobId = '' OR j.id = $jobId) AND ($kind = '' OR j.kind = $kind)
       RETURN j.id AS id, j.kind AS kind, j.subject AS subject, coalesce(j.payload, '{}') AS payload, coalesce(j.priority, 50) AS priority,
              j.dedupeKey AS dedupeKey, coalesce(j.maxAttempts, 3) AS maxAttempts, j.lockedBy AS by, ($now - coalesce(j.heartbeatAt, j.lockedAt, 0)) / 1000 AS hbAgeS`,
      { params: { projectId, jobId, kind, now } as never },
    )
  ).data ?? [];
  if (!held.length) {
    console.log("no running job matches; nothing to release");
    process.exit(0);
  }
  for (const j of held) {
    console.log(`releasing ${j.kind}${j.subject ? ` (${j.subject})` : ""} ${j.id.slice(0, 8)} held by ${j.by ?? "?"} (heartbeat ${Math.round(j.hbAgeS)}s ago)`);
    await graph.query("MATCH (j:AdamJob {id: $id}) DETACH DELETE j", { params: { id: j.id } as never });
    const fresh = await jobs.enqueue(graph, {
      projectId,
      kind: j.kind as never,
      subject: j.subject ?? undefined,
      payload: JSON.parse(j.payload),
      priority: j.priority,
      dedupeKey: j.dedupeKey,
      maxAttempts: j.maxAttempts,
    });
    console.log(`queued fresh ${j.kind} ${fresh.id.slice(0, 8)} (released from ${hostname()})`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("release failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
