// Job: hunt_method — fill one Method in to a runnable Procedure.

import { runMethodsHunter } from "../agents/methods-hunter";
import { emit } from "../events";
import { getProject } from "../project";
import type { JobContext } from "./index";

export async function runHuntMethod(ctx: JobContext) {
  const project = await getProject(ctx.graph, ctx.job.projectId);
  if (!project) throw new Error("project not found");
  const methodId = String(ctx.job.payload.methodId ?? ctx.job.subject ?? "");
  if (!methodId) throw new Error("methodId missing");
  const result = await runMethodsHunter(ctx.graph, ctx.workspaceId, project, methodId, { note: ctx.job.payload.note as string | undefined, heartbeat: ctx.heartbeat, log: ctx.log });
  await emit(ctx.graph, project.id, "procedure_written", { ...result, missing: result.missing.slice(0, 8) });
  return result;
}
