// Phase 5 · Hypothesise. The Writer drafts two to four competing briefs; the researcher
// selects which to pursue (gate 2, mandatory: risk appetite, lab strengths, what they
// suspect the field is wrong about are theirs to judge).

import * as jobs from "../jobs";
import { PRIORITY, type PhaseStep } from "../orchestrator";
import { BRIEFS } from "../queries-hypotheses";

export const hypothesiseStep: PhaseStep = async ({ graph, project }) => {
  const briefs = ((await graph.roQuery<{ id: string; pass: number; status: string }>(BRIEFS, { params: { projectId: project.id } as never })).data ?? []).filter((b) => b.pass === project.pass);
  if (briefs.some((b) => b.status === "selected")) return { enqueued: 0, advance: true };

  const key = `write_hypotheses:${project.id}:pass${project.pass}`;
  const job = (await jobs.byKindAndStatus(graph, project.id, ["write_hypotheses"], ["queued", "running", "done", "failed"])).find((j) => j.dedupeKey === key);
  if (!job && briefs.length === 0) {
    const { created } = await jobs.enqueue(graph, { projectId: project.id, kind: "write_hypotheses", subject: `pass-${project.pass}`, payload: { pass: project.pass }, priority: PRIORITY.write_hypotheses, dedupeKey: key, maxAttempts: 2 });
    return { enqueued: created ? 1 : 0 };
  }
  if (job && (job.status === "queued" || job.status === "running")) return { enqueued: 0 };
  if (job && job.status === "failed" && briefs.length === 0) return { enqueued: 0, pause: `The Hypothesis Writer failed: ${job.error ?? "unknown error"}. Resume to try again.` };
  // Briefs exist and none is selected: the researcher decides
  return { enqueued: 0, gate: "select" };
};
