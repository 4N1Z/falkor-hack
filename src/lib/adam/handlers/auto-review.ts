// Job: auto_review — judge the clear cases in the exception queue. With `apply` in the payload
// (the orchestrator's automatic run after extraction), the clear approve / reject calls are
// applied at once under the "auto-review" signature; conflicts, unsourced items and anything the
// reviewer was unsure about stay for a person.

import { runAutoReview } from "../agents/auto-review";
import { emit } from "../events";
import { getProject } from "../project";
import { applySuggestions, type QueueKind } from "../review";
import type { JobContext } from "./index";

export const AUTO_REVIEW_USER = "auto-review";

export async function runAutoReviewJob(ctx: JobContext) {
  const project = await getProject(ctx.graph, ctx.job.projectId);
  if (!project) throw new Error("project not found");
  const kinds = ctx.job.payload.kinds as QueueKind[] | undefined;
  const result = await runAutoReview(ctx.graph, ctx.workspaceId, project, { kinds, heartbeat: ctx.heartbeat, log: ctx.log });
  if (!ctx.job.payload.apply) return result;
  const approved = result.approve ? await applySuggestions(ctx.graph, { projectId: project.id, userId: AUTO_REVIEW_USER, suggestion: "approve" }) : 0;
  const rejected = result.reject ? await applySuggestions(ctx.graph, { projectId: project.id, userId: AUTO_REVIEW_USER, suggestion: "reject" }) : 0;
  await emit(ctx.graph, project.id, "auto_review_applied", { approved, rejected, unsure: result.unsure, leftToPerson: result.skipped });
  ctx.log?.(`auto-review applied: ${approved} approved, ${rejected} rejected; ${result.unsure + result.skipped} left to a person`);
  return { ...result, applied: { approved, rejected } };
}
