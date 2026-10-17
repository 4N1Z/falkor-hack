// Job: design_experiment — the plan for one surviving, signed brief.

import { runDesigner } from "../agents/designer";
import { emit } from "../events";
import { getProject } from "../project";
import type { JobContext } from "./index";

export async function runDesignExperiment(ctx: JobContext) {
  const project = await getProject(ctx.graph, ctx.job.projectId);
  if (!project) throw new Error("project not found");
  const hypothesisId = String(ctx.job.payload.hypothesisId ?? ctx.job.subject ?? "");
  if (!hypothesisId) throw new Error("hypothesisId missing");
  const result = await runDesigner(ctx.graph, ctx.workspaceId, project, hypothesisId, Number(ctx.job.payload.rank ?? 1), { heartbeat: ctx.heartbeat, log: ctx.log });
  await emit(ctx.graph, project.id, "plan_written", { ...result, issues: result.issues.slice(0, 5) });
  return result;
}
