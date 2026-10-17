// Job: verify_card — check every item of a paper's card(s) against the source.

import { runVerifier } from "../agents/verifier";
import { emit } from "../events";
import { getProject } from "../project";
import type { JobContext } from "./index";

export async function runVerifyCard(ctx: JobContext) {
  const project = await getProject(ctx.graph, ctx.job.projectId);
  if (!project) throw new Error("project not found");
  const paperId = String(ctx.job.payload.paperId ?? ctx.job.subject ?? "");
  if (!paperId) throw new Error("paperId missing");
  const result = await runVerifier(ctx.graph, ctx.workspaceId, project, paperId, { heartbeat: ctx.heartbeat, log: ctx.log });
  await emit(ctx.graph, project.id, "card_verified", { ...result });
  return result;
}
