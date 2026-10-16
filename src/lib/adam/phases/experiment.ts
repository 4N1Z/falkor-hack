// Phase 7 · Experiment. Every surviving brief with signed kill criteria gets a plan; the
// researcher approves each plan (gate). Ends when every plan is approved; the project is
// then done for this pass, and results feed back as new nodes on the next pass.

import * as jobs from "../jobs";
import { PRIORITY, type PhaseStep } from "../orchestrator";
import { PLANS, SURVIVING_BRIEFS } from "../queries-experiments";

export const experimentStep: PhaseStep = async ({ graph, project }) => {
  const p = <T>(x: T) => ({ params: x as never });
  const survivors = ((await graph.roQuery<{ id: string; statement: string; killSignedAt: number | null }>(SURVIVING_BRIEFS, p({ projectId: project.id, pass: project.pass }))).data ?? []).filter((b) => b.killSignedAt);
  if (!survivors.length) return { enqueued: 0, advance: true, notes: ["No surviving brief with signed kill criteria; nothing to design"] };

  const plans = (await graph.roQuery<{ id: string; hypothesisId: string; approvedAt: number | null; version: number }>(PLANS, p({ projectId: project.id }))).data ?? [];
  const existing = await jobs.byKindAndStatus(graph, project.id, ["design_experiment"], ["queued", "running", "done", "failed"]);
  let enqueued = 0;
  let pending = 0;
  survivors.forEach(async () => {});
  for (const [i, b] of survivors.entries()) {
    const key = `design_experiment:${project.id}:${b.id}:pass${project.pass}`;
    const job = existing.find((j) => j.dedupeKey === key);
    const plan = plans.find((x) => x.hypothesisId === b.id);
    if (!job && !plan) {
      const { created } = await jobs.enqueue(graph, { projectId: project.id, kind: "design_experiment", subject: b.id, payload: { hypothesisId: b.id, rank: i + 1 }, priority: PRIORITY.design_experiment, dedupeKey: key, maxAttempts: 2 });
      if (created) enqueued++;
      pending++;
    } else if (job && (job.status === "queued" || job.status === "running")) pending++;
    else if (job && job.status === "failed" && !plan) return { enqueued, pause: `The Experiment Designer failed: ${job.error ?? "unknown error"}. Resume to try again.` };
  }
  if (pending > 0) return { enqueued };
  const unapproved = survivors.filter((b) => !plans.find((x) => x.hypothesisId === b.id)?.approvedAt);
  if (unapproved.length) return { enqueued, gate: "plan" };
  return { enqueued, advance: true, notes: ["Every experiment plan is approved and handed to the lab; results come back as new nodes on the next pass"] };
};
