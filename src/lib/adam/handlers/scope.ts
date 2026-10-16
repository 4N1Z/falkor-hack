// Job: scope — run the Scoper for the project's current pass.

import { runScoper } from "../agents/scoper";
import { emit } from "../events";
import { getProject } from "../project";
import type { JobContext } from "./index";

export async function runScope(ctx: JobContext) {
  const project = await getProject(ctx.graph, ctx.job.projectId);
  if (!project) throw new Error("project not found");
  await ctx.heartbeat({ step: "scoper" });
  const page = await runScoper(ctx.graph, ctx.workspaceId, project, { note: ctx.job.payload.note as string | undefined });
  await emit(ctx.graph, project.id, "question_page_written", {
    pass: page.pass,
    subquestions: page.subquestions.length,
    ready: page.checks?.ready ?? null,
  });
  return { pageId: page.id, ready: page.checks?.ready ?? null };
}
