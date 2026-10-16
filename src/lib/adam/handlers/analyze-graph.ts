// Job: analyze_graph — the Graph Analyst's pass over the project.

import { runAnalyst } from "../agents/analyst";
import { emit } from "../events";
import { getProject } from "../project";
import type { JobContext } from "./index";

export async function runAnalyzeGraph(ctx: JobContext) {
  const project = await getProject(ctx.graph, ctx.job.projectId);
  if (!project) throw new Error("project not found");
  const result = await runAnalyst(ctx.graph, ctx.workspaceId, project, { heartbeat: ctx.heartbeat, log: ctx.log });
  await emit(ctx.graph, project.id, "analysis_done", { ...result, pass: project.pass });
  return result;
}
