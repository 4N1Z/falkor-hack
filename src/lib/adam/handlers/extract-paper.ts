// Job: extract_paper — one slot of one paper's extraction card.

import { runExtractor, type Slot } from "../agents/extractor";
import { emit } from "../events";
import { getProject } from "../project";
import type { JobContext } from "./index";

export async function runExtractPaper(ctx: JobContext) {
  const project = await getProject(ctx.graph, ctx.job.projectId);
  if (!project) throw new Error("project not found");
  const paperId = String(ctx.job.payload.paperId ?? ctx.job.subject ?? "");
  const slot = (ctx.job.payload.slot as Slot) ?? "a";
  if (!paperId) throw new Error("paperId missing");
  const result = await runExtractor(ctx.graph, ctx.workspaceId, project, paperId, slot, {
    note: ctx.job.payload.note as string | undefined,
    heartbeat: ctx.heartbeat,
    log: ctx.log,
  });
  await emit(ctx.graph, project.id, "card_extracted", { paperId, slot, ...result.counts, dropped: result.dropped, merges: result.merges.length, abstractOnly: result.abstractOnly });
  if (result.merges.length) await emit(ctx.graph, project.id, "entities_merged", { paperId, merges: result.merges.slice(0, 20) });
  return result;
}
