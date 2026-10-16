// Job handlers, one per JobKind. The worker looks the kind up here and runs it with a
// context that carries the workspace graph, the job, and a heartbeat it must call between
// slow steps (LLM calls, OpenAlex batches) so a long job is not mistaken for a dead one.
// Each build phase registers its handlers here; a kind with no handler fails loudly.

import type { Graph } from "falkordb";
import type { AdamJob, JobKind } from "../types";
import { orchestrate } from "../orchestrator";
import { runScope } from "./scope";
import { runSearchRing } from "./search-ring";
import { runExtractPaper } from "./extract-paper";
import { runVerifyCard } from "./verify-card";
import { runHuntMethod } from "./hunt-method";
import { runAnalyzeGraph } from "./analyze-graph";
import { runWriteHypotheses } from "./write-hypotheses";
import { runFalsify } from "./falsify";
import { runDesignExperiment } from "./design-experiment";

export interface JobContext {
  workspaceId: string;
  graph: Graph;
  job: AdamJob;
  /** Call between slow steps; also records progress for the status UI */
  heartbeat: (progress?: Record<string, unknown>) => Promise<void>;
  log: (msg: string) => void;
}

export type Handler = (ctx: JobContext) => Promise<unknown>;

const noop: Handler = async (ctx) => {
  await ctx.heartbeat({ step: "noop" });
  return { ok: true, at: Date.now(), payload: ctx.job.payload };
};

export const HANDLERS: Partial<Record<JobKind, Handler>> = {
  noop,
  orchestrate,
  scope: runScope,
  search_ring: runSearchRing,
  extract_paper: runExtractPaper,
  verify_card: runVerifyCard,
  hunt_method: runHuntMethod,
  analyze_graph: runAnalyzeGraph,
  write_hypotheses: runWriteHypotheses,
  falsify: runFalsify,
  design_experiment: runDesignExperiment,
};
