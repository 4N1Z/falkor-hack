// The Orchestrator (spec: "Agent roster" → Orchestrator; "Saturation bar and stopping rules").
// It reads the graph's state, decides who runs next, and never talks to agents directly:
// it enqueues jobs, agents write to the graph, and the next tick reads what changed.
//
// One `orchestrate` job per project cycles: run → decide → reschedule itself while work is
// pending. It stops on its own when the project is paused, blocked on a human gate, out of
// budget, or done. The researcher can override at any point (pause, resume, redraw scope).

import type { Graph } from "falkordb";
import { emit } from "./events";
import * as jobs from "./jobs";
import { getProject, setProjectState } from "./project";
import { PHASES, type AdamProject, type Gate, type JobKind, type Phase } from "./types";
import type { JobContext } from "./handlers";
import { questionStep } from "./phases/question";
import { sweepStep } from "./phases/sweep";
import { extractStep } from "./phases/extract";
import { methodsStep } from "./phases/methods";
import { connectStep } from "./phases/connect";
import { hypothesiseStep } from "./phases/hypothesise";
import { attackStep } from "./phases/attack";
import { experimentStep } from "./phases/experiment";

/** How soon the orchestrator looks again while jobs are in flight. */
const TICK_MS = 20_000;
export const ORCHESTRATE_PRIORITY = 10;

export interface PhaseContext {
  graph: Graph;
  workspaceId: string;
  project: AdamProject;
  log: (msg: string) => void;
}

/** What a phase step decided on this tick. */
export interface StepResult {
  /** Jobs this tick enqueued (only newly created ones count) */
  enqueued: number;
  /** The phase's "ends when" condition holds: move on */
  advance?: boolean;
  /** Work cannot continue until a person decides */
  gate?: Gate;
  /** Something to tell the researcher (recorded as an event) */
  notes?: string[];
  /** Human hold: stop the loop with this reason; the researcher resumes after looking */
  pause?: string;
}

export type PhaseStep = (ctx: PhaseContext) => Promise<StepResult>;

/** Phase steps register here as each is built; a phase without a step holds the project. */
const STEPS: Partial<Record<Exclude<Phase, "done">, PhaseStep>> = {
  question: questionStep,
  sweep: sweepStep,
  extract: extractStep,
  methods: methodsStep,
  connect: connectStep,
  hypothesise: hypothesiseStep,
  attack: attackStep,
  experiment: experimentStep,
};

const nextPhase = (p: Phase): Phase => PHASES[Math.min(PHASES.indexOf(p) + 1, PHASES.length - 1)];

/** Budget rule: a pass stops when its allowance is spent; the researcher decides whether to extend. */
function overBudget(p: AdamProject): string | null {
  if (p.budget.maxPapers !== null && p.spent.papers >= p.budget.maxPapers) return `paper budget spent (${p.spent.papers}/${p.budget.maxPapers})`;
  if (p.budget.maxLlmCalls !== null && p.spent.llmCalls >= p.budget.maxLlmCalls) return `LLM-call budget spent (${p.spent.llmCalls}/${p.budget.maxLlmCalls})`;
  return null;
}

/**
 * One decision cycle. Returns what happened so the job result shows it. Safe to call at any
 * time (every enqueue is deduped), which is how a researcher's "resume" works: it just ticks.
 */
export async function tick(graph: Graph, workspaceId: string, projectId: string, log: (m: string) => void = () => {}) {
  const project = await getProject(graph, projectId);
  if (!project) return { stopped: "project not found" as const };
  if (project.status !== "running") return { stopped: `project is ${project.status}` as const };

  const budgetNote = overBudget(project);
  if (budgetNote) {
    await setProjectState(graph, projectId, { status: "paused" });
    await emit(graph, projectId, "budget_spent", { note: budgetNote, pass: project.pass });
    return { stopped: budgetNote };
  }

  if (project.phase === "done") {
    await setProjectState(graph, projectId, { status: "done" });
    await emit(graph, projectId, "project_done", { pass: project.pass });
    return { stopped: "done" as const };
  }

  const step = STEPS[project.phase];
  if (!step) {
    await setProjectState(graph, projectId, { status: "paused" });
    await emit(graph, projectId, "phase_unavailable", { phase: project.phase });
    return { stopped: `phase ${project.phase} is not available yet` as const };
  }
  const result = await step({ graph, workspaceId, project, log });
  for (const note of result.notes ?? []) await emit(graph, projectId, "note", { phase: project.phase, note });

  if (result.pause) {
    await setProjectState(graph, projectId, { status: "paused" });
    await emit(graph, projectId, "loop_paused", { phase: project.phase, reason: result.pause });
    return { phase: project.phase, stopped: result.pause, enqueued: result.enqueued };
  }
  if (result.gate) {
    await setProjectState(graph, projectId, { status: "blocked_on_gate", gate: result.gate });
    await emit(graph, projectId, "gate_pending", { gate: result.gate, phase: project.phase });
    return { phase: project.phase, gate: result.gate, enqueued: result.enqueued };
  }
  if (result.advance) {
    const to = nextPhase(project.phase);
    await setProjectState(graph, projectId, { phase: to, clearGate: true });
    await emit(graph, projectId, "phase_advanced", { from: project.phase, to, pass: project.pass });
    log(`phase ${project.phase} → ${to}`);
    return { phase: to, advanced: true, enqueued: result.enqueued, reschedule: true };
  }
  return { phase: project.phase, enqueued: result.enqueued, reschedule: true };
}

/**
 * The `orchestrate` job handler: tick, and ask the worker to put this same job back on the
 * queue if work continues (`rescheduleAt` is honoured by the worker after it records the
 * result; the handler cannot do it itself, the completion write would overwrite it).
 */
export async function orchestrate(ctx: JobContext) {
  const projectId = ctx.job.projectId;
  const result = await tick(ctx.graph, ctx.workspaceId, projectId, ctx.log);
  if ("reschedule" in result && result.reschedule) {
    // Advancing a phase deserves an immediate look; otherwise wait for jobs to make progress
    return { ...result, rescheduleAt: Date.now() + ("advanced" in result && result.advanced ? 1000 : TICK_MS) };
  }
  return result;
}

/** Start (or resume) a project: mark it running and make sure its orchestrate job exists and is queued. */
export async function startProject(graph: Graph, workspaceId: string, projectId: string) {
  const project = await setProjectState(graph, projectId, { status: "running", clearGate: true });
  if (!project) throw new Error("project not found");
  const { id, created } = await jobs.enqueue(graph, {
    projectId,
    kind: "orchestrate",
    priority: ORCHESTRATE_PRIORITY,
    dedupeKey: `orchestrate:${projectId}`,
    maxAttempts: 1_000_000,
  });
  if (!created) await jobs.reschedule(graph, id, Date.now());
  await emit(graph, projectId, "project_started", { phase: project.phase, pass: project.pass });
  return project;
}

/** Pause: queued jobs stay queued but the claim query skips them; running jobs finish. */
export async function pauseProject(graph: Graph, projectId: string) {
  const project = await setProjectState(graph, projectId, { status: "paused" });
  await emit(graph, projectId, "project_paused", {});
  return project;
}

/** Enqueue work for a phase with the standard priorities; used by the phase steps. */
export const PRIORITY: Partial<Record<JobKind, number>> = {
  orchestrate: ORCHESTRATE_PRIORITY,
  scope: 20,
  index_paper: 30,
  verify_card: 40,
  extract_paper: 50,
  search_ring: 60,
  hunt_method: 65,
  analyze_graph: 70,
  write_hypotheses: 75,
  falsify: 76,
  design_experiment: 80,
  saturation: 90,
  auto_review: 35,
};
