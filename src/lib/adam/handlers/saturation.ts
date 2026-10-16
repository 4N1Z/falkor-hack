// Job: saturation — recompute the per-cluster bar after an extraction batch.

import { emit } from "../events";
import { getProject } from "../project";
import { getQuestionPage } from "../question-page";
import { computeSaturation } from "../saturation";
import type { JobContext } from "./index";

export async function runSaturation(ctx: JobContext) {
  const project = await getProject(ctx.graph, ctx.job.projectId);
  if (!project) throw new Error("project not found");
  const page = await getQuestionPage(ctx.graph, project.id);
  const stats = await computeSaturation(ctx.graph, project.id, project.pass, page);
  const saturated = stats.filter((s) => s.saturated).map((s) => s.label);
  await emit(ctx.graph, project.id, "saturation_computed", { clusters: stats.length, saturated });
  return { clusters: stats.length, saturated: saturated.length };
}
