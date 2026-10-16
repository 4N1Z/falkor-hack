// Job: write_hypotheses — two to four competing briefs for the pass.

import { runWriter } from "../agents/writer";
import { emit } from "../events";
import { getProject } from "../project";
import { getQuestionPage } from "../question-page";
import type { JobContext } from "./index";

export async function runWriteHypotheses(ctx: JobContext) {
  const project = await getProject(ctx.graph, ctx.job.projectId);
  if (!project) throw new Error("project not found");
  const page = await getQuestionPage(ctx.graph, project.id);
  if (!page) throw new Error("no question page");
  const result = await runWriter(ctx.graph, ctx.workspaceId, project, page, { heartbeat: ctx.heartbeat, log: ctx.log });
  await emit(ctx.graph, project.id, "briefs_written", { pass: project.pass, briefs: result.briefs.length, ready: result.briefs.filter((b) => b.ready).length });
  return result;
}
