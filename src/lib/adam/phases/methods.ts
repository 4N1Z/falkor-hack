// Phase 3 · Methods. Every method a verified claim uses is chased to a Procedure, most
// depended-on first. Ends when each has one (runnable, partial or unknown; "unknown" is an
// honest answer, not a failure). Later passes re-prioritise by how many candidate chains
// pass through each procedure (the hypothesis-as-query feeds chainsNeeding).

import * as jobs from "../jobs";
import { PRIORITY, type PhaseStep } from "../orchestrator";
import { METHODS_TO_HUNT } from "../queries-methods";

/** Per pass: the rest wait for the next pass (the diminishing-chains rule prunes them later). */
const MAX_HUNTS_PER_PASS = 80;

interface Row {
  id: string;
  name: string;
  claims: number;
  dependents: number;
  procedureId: string;
  chainsNeeding: number;
  huntedAt: number | null;
}

export const methodsStep: PhaseStep = async ({ graph, project }) => {
  const methods = (await graph.roQuery<Row>(METHODS_TO_HUNT, { params: { projectId: project.id } as never })).data ?? [];
  const wanted = methods.filter((m) => m.claims > 0 || m.chainsNeeding > 0).slice(0, MAX_HUNTS_PER_PASS);
  if (!wanted.length) return { enqueued: 0, advance: true, notes: ["No methods used by verified claims; nothing to hunt"] };

  const existing = await jobs.byKindAndStatus(graph, project.id, ["hunt_method"], ["queued", "running", "done", "failed"]);
  const byKey = new Map(existing.map((j) => [j.dedupeKey, j]));
  let enqueued = 0;
  let pending = 0;
  let failed = 0;
  for (const m of wanted) {
    const key = `hunt_method:${project.id}:${m.id}:pass${project.pass}`;
    const job = byKey.get(key);
    if (!job) {
      if (m.procedureId) continue; // already has a procedure from an earlier pass or a manual hunt
      const { created } = await jobs.enqueue(graph, { projectId: project.id, kind: "hunt_method", subject: m.id, payload: { methodId: m.id, name: m.name }, priority: PRIORITY.hunt_method, dedupeKey: key, maxAttempts: 2 });
      if (created) enqueued++;
      pending++;
    } else if (job.status === "queued" || job.status === "running") pending++;
    else if (job.status === "failed") failed++;
  }
  if (pending > 0) return { enqueued };
  const notes = failed ? [`${failed} method hunt(s) failed; their methods stay without a procedure`] : [];
  if (methods.length > wanted.length) notes.push(`${methods.length - wanted.length} further method(s) deferred to the next pass`);
  return { enqueued, advance: true, notes };
};
