// Job: search_ring — one ring of the sweep for the current pass, then the coverage check.

import { RINGS, runSearchRing, type Ring } from "../agents/searcher";
import { computeCoverage } from "../coverage";
import { emit } from "../events";
import { getProject } from "../project";
import { getQuestionPage } from "../question-page";
import type { JobContext } from "./index";

export async function runSearchRing_(ctx: JobContext) {
  const project = await getProject(ctx.graph, ctx.job.projectId);
  if (!project) throw new Error("project not found");
  const page = await getQuestionPage(ctx.graph, project.id);
  if (!page || !page.approvedAt) throw new Error("question page is not approved");

  const ring = ctx.job.payload.ring as Ring;
  if (!RINGS.includes(ring)) throw new Error(`unknown ring ${ring}`);
  const round = Number(ctx.job.payload.round ?? 1);
  const onlyPaperIds = ctx.job.payload.paperIds as string[] | undefined;
  const recentSince = ctx.job.payload.recentSince as string | undefined;
  const skipClusters = ctx.job.payload.skipClusters as string[] | undefined;

  const result = await runSearchRing(ctx.graph, ctx.workspaceId, project, page, ring, { round, onlyPaperIds, recentSince, skipClusters, heartbeat: ctx.heartbeat, log: ctx.log });
  await emit(ctx.graph, project.id, "ring_done", { ...result, round });

  // The checker: what is still missing after this ring?
  const coverage = await computeCoverage(ctx.graph, project.id, project.pass, page);
  if (coverage.gaps.length || coverage.adjacentMissing.length) {
    await emit(ctx.graph, project.id, "coverage_gap", { ring, gaps: coverage.gaps.length, adjacentMissing: coverage.adjacentMissing });
  }
  return { ...result, coverageGaps: coverage.gaps.length };
}

export { runSearchRing_ as runSearchRing };
