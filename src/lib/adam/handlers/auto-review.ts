// Job: auto_review — decide the clear cases in the exception queue, leave the rest.

import { runAutoReview } from "../agents/auto-review";
import { getProject } from "../project";
import type { QueueKind } from "../review";
import type { JobContext } from "./index";

export async function runAutoReviewJob(ctx: JobContext) {
  const project = await getProject(ctx.graph, ctx.job.projectId);
  if (!project) throw new Error("project not found");
  const kinds = ctx.job.payload.kinds as QueueKind[] | undefined;
  return runAutoReview(ctx.graph, ctx.workspaceId, project, { kinds, heartbeat: ctx.heartbeat, log: ctx.log });
}
