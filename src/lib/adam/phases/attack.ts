// Phase 6 · Attack. Each selected brief is attacked in rounds until it is killed or survives
// (convergence: a round adds no new open attacks). Then the researcher signs the kill
// criteria of every surviving brief (gate 3) before anything reaches experiment design.

import { MAX_ATTACK_ROUNDS } from "../handlers/falsify";
import * as jobs from "../jobs";
import { PRIORITY, type PhaseStep } from "../orchestrator";
import { BRIEFS } from "../queries-hypotheses";

interface BriefRow {
  id: string;
  pass: number;
  status: string;
  convergenceRounds: number;
  killSignedAt: number | null;
  killCriteria: string;
}

export const attackStep: PhaseStep = async ({ graph, project }) => {
  const briefs = ((await graph.roQuery<BriefRow>(BRIEFS, { params: { projectId: project.id } as never })).data ?? []).filter((b) => b.pass === project.pass);
  const inPlay = briefs.filter((b) => ["selected", "attacked", "survived"].includes(b.status));
  if (!inPlay.length) return { enqueued: 0, advance: true, notes: ["No selected briefs to attack"] };

  const existing = await jobs.byKindAndStatus(graph, project.id, ["falsify"], ["queued", "running", "done", "failed"]);
  let enqueued = 0;
  let pending = 0;
  for (const b of inPlay) {
    if (b.status === "survived") continue;
    const round = b.convergenceRounds + 1;
    if (round > MAX_ATTACK_ROUNDS) continue;
    const key = `falsify:${project.id}:${b.id}:r${round}`;
    const job = existing.find((j) => j.dedupeKey === key);
    if (!job) {
      const { created } = await jobs.enqueue(graph, { projectId: project.id, kind: "falsify", subject: b.id, payload: { hypothesisId: b.id, round }, priority: PRIORITY.falsify, dedupeKey: key, maxAttempts: 2 });
      if (created) enqueued++;
      pending++;
    } else if (job.status === "queued" || job.status === "running") pending++;
    else if (job.status === "failed") return { enqueued, pause: `The Falsifier failed on a brief: ${job.error ?? "unknown error"}. Resume to try again.` };
  }
  if (pending > 0) return { enqueued };

  const survivors = briefs.filter((b) => b.status === "survived");
  if (!survivors.length) return { enqueued, advance: true, notes: ["Every selected brief was killed by the Falsifier; the loop returns to reading with sharper questions"] };
  const unsigned = survivors.filter((b) => !b.killSignedAt);
  if (unsigned.length) return { enqueued, gate: "kill" };
  return { enqueued, advance: true };
};
