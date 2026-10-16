// Phase 4 · Connect. The Analyst reads the whole graph once per pass and reports candidate
// holes, conflicts and load-bearing assumptions. Ends when the report is in.

import * as jobs from "../jobs";
import { PRIORITY, type PhaseStep } from "../orchestrator";

export const connectStep: PhaseStep = async ({ graph, project }) => {
  const key = `analyze_graph:${project.id}:pass${project.pass}`;
  const existing = (await jobs.byKindAndStatus(graph, project.id, ["analyze_graph"], ["queued", "running", "done", "failed"])).find((j) => j.dedupeKey === key);
  if (!existing) {
    const { created } = await jobs.enqueue(graph, { projectId: project.id, kind: "analyze_graph", subject: `pass-${project.pass}`, payload: { pass: project.pass }, priority: PRIORITY.analyze_graph, dedupeKey: key, maxAttempts: 2 });
    return { enqueued: created ? 1 : 0 };
  }
  if (existing.status === "queued" || existing.status === "running") return { enqueued: 0 };
  if (existing.status === "failed") {
    return { enqueued: 0, pause: `The Graph Analyst failed: ${existing.error ?? "unknown error"}. Resume to run it again.` };
  }
  const r = (existing.result ?? {}) as { holes?: number; conflicts?: number; loadBearing?: number };
  const total = (r.holes ?? 0) + (r.conflicts ?? 0) + (r.loadBearing ?? 0);
  return { enqueued: 0, advance: true, notes: total ? [] : ["The Analyst found no holes, conflicts or untested load-bearing assumptions yet; the hypothesis writer will work from the graph directly"] };
};
