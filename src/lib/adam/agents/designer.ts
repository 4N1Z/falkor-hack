// Experiment Designer — one job: for a surviving brief with signed kill criteria, the chain of
// procedures that tests it, ordered cheapest-to-kill first, with the gaps marked as the risky
// steps and the controls that separate the rival explanations (spec, Phase 7 · Experiment).
// It is a path-finder over the hypothesis-as-query's chains, not a free-text planner. The
// design checker (a separate call) asks the step's question: does each experiment test the
// kill criterion and not something adjacent, and are the controls sufficient? The researcher
// approves the plan (gate), and it is handed to the lab; results feed back as new nodes.

import type { Graph } from "falkordb";
import { z } from "zod";
import { startRun } from "../../agents/base";
import { hypothesisQuery, type HypothesisQueryResult } from "../hypothesis-query";
import { clip, structured } from "../llm";
import { CLEAR_PLAN_STEPS, LINK_PLAN_STEPS, RIVAL_ATTACKS, UPSERT_PLAN } from "../queries-experiments";
import { GET_BRIEF } from "../queries-hypotheses";
import type { AdamProject } from "../types";

const PlanSchema = z.object({
  steps: z
    .array(
      z.object({
        procedureId: z.string().nullable().describe("Id of the procedure from the chains, or null when the step must be invented"),
        name: z.string(),
        purpose: z.string().describe("What this step establishes toward the kill criterion"),
        status: z.enum(["verified", "partial", "unknown", "infeasible", "missing"]),
        gap: z.boolean().describe("true when this step is where the real risk sits: missing, unknown or partial"),
        control: z.string().nullable().describe("The control run alongside this step, if one is needed"),
      }),
    )
    .min(1)
    .max(12),
  controls: z.array(z.object({ rival: z.string(), control: z.string() })).describe("One control per rival explanation"),
  rationale: z.string().describe("Why this order: cheapest-to-kill first, gaps surfaced early"),
  killTest: z.string().describe("Exactly how the plan's result maps onto the signed kill criterion"),
});

const CheckSchema = z.object({
  passes: z.boolean(),
  issues: z.array(z.string()).describe("Each way the plan tests something adjacent to the kill criterion, or lacks a control a rival needs"),
  note: z.string(),
});

const DESIGNER_SYSTEM = `You are the Experiment Designer in a research-agent system whose premise is: a new result is a new combination of known steps. You do not invent experiments from imagination: you assemble a plan from the candidate chains the graph returned, ordered so the cheapest step that could kill the hypothesis comes first. Where a chain has no procedure (a gap), say so: that is where the real work and the real risk sit. Every rival explanation needs a control that separates it from the hypothesis.`;
const CHECKER_SYSTEM = `You are the design checker. You see a kill criterion, rival explanations and an experiment plan, nothing else. Two questions: does each experiment test the kill criterion itself, not something adjacent to it? Are the controls sufficient to separate the rival explanations? A plan whose positive result is also predicted by the null fails.`;

const params = <T>(p: T) => ({ params: p as never });

export interface DesignResult {
  planId: string;
  hypothesisId: string;
  steps: number;
  gaps: number;
  passes: boolean;
  issues: string[];
  costToKill: number;
}

export async function runDesigner(
  graph: Graph,
  workspaceId: string,
  project: AdamProject,
  hypothesisId: string,
  rank: number,
  opts: { heartbeat?: (p: Record<string, unknown>) => Promise<void>; log?: (m: string) => void } = {},
): Promise<DesignResult> {
  const run = await startRun("adam-designer", workspaceId, { projectId: project.id, hypothesisId, action: "design" });
  const beat = opts.heartbeat ?? (async () => {});
  const log = opts.log ?? (() => {});
  const pid = project.id;

  const brief = (await graph.roQuery<{ statement: string; killCriteria: string; predictionIfTrue: string; predictionIfFalse: string; boundaryFails: string[] }>(GET_BRIEF, params({ id: hypothesisId }))).data?.[0];
  if (!brief) throw new Error("brief not found");

  // The chains come from the graph, not from imagination
  const query: HypothesisQueryResult = await run.step("hypothesisQuery", () => hypothesisQuery(graph, workspaceId, project, { text: brief.statement, hypothesisId, userId: project.createdBy }), { source: "graph" });
  await beat({ step: "chains", n: query.chains.length });
  const rivals = (await graph.roQuery<{ id: string; text: string; control: string; status: string }>(RIVAL_ATTACKS, params({ id: hypothesisId }))).data ?? [];

  const chainsText = query.chains.length
    ? query.chains.slice(0, 5).map((c) => `Chain ${c.rank} (cost ${Math.round(c.cost)}, ${c.gaps} gap(s), ${c.feasible ? "feasible" : "not feasible for this lab"}) → "${clip(c.resultText, 120)}"\n${c.steps.map((s, i) => `  ${i + 1}. [${s.procedureId}] ${s.name} · ${s.status}${s.missing.length ? ` · missing: ${s.missing.slice(0, 3).join("; ")}` : ""}${s.timeHours ? ` · ${s.timeHours} h` : ""}${s.costUsd ? ` · $${s.costUsd}` : ""}`).join("\n")}`).join("\n\n")
    : "No chain of procedures in the graph reaches the predicted result. The plan must say which step has to be invented or found.";
  const plan = await run.step(
    "llm.design",
    () =>
      structured({
        graph,
        projectId: pid,
        schema: PlanSchema,
        system: DESIGNER_SYSTEM,
        prompt: `Hypothesis: ${brief.statement}\nPrediction: if true, ${brief.predictionIfTrue}; if false, ${brief.predictionIfFalse}\nKill criterion (signed): ${brief.killCriteria}\nShould fail under: ${brief.boundaryFails.join("; ") || "(none)"}\n\nCandidate chains from the graph:\n${chainsText}\n\nGaps:\n${query.gaps.map((g) => `- ${g.text}`).join("\n") || "(none)"}\n\nRival explanations:\n${rivals.map((r) => `- [${r.id}] ${r.text}${r.control ? ` (proposed control: ${r.control})` : ""}`).join("\n") || "(none recorded)"}`,
        tier: "heavy",
        maxTokens: 7000,
        label: `design:${hypothesisId}`,
      }),
    { source: "llm" },
  );
  const check = await run.step(
    "llm.designCheck",
    () =>
      structured({
        graph,
        projectId: pid,
        schema: CheckSchema,
        system: CHECKER_SYSTEM,
        prompt: `Kill criterion: ${brief.killCriteria}\nRival explanations:\n${rivals.map((r) => `- ${r.text}`).join("\n") || "(none)"}\n\nPlan:\n${plan.object.steps.map((s, i) => `${i + 1}. ${s.name} — ${s.purpose}${s.control ? ` (control: ${s.control})` : ""}${s.gap ? " [gap]" : ""}`).join("\n")}\nControls: ${plan.object.controls.map((c) => `${c.rival} → ${c.control}`).join("; ") || "(none)"}\nHow the result maps to the kill criterion: ${plan.object.killTest}`,
        label: `design-check:${hypothesisId}`,
      }),
    { source: "llm" },
  );

  const at = Date.now();
  const planId = `plan:${hypothesisId.split(":").slice(1).join(":")}`;
  const knownIds = new Set(query.chains.flatMap((c) => c.steps.map((s) => s.procedureId)));
  const steps = plan.object.steps.map((s) => ({ ...s, procedureId: s.procedureId && knownIds.has(s.procedureId) ? s.procedureId : null }));
  const costToKill = query.costToKill?.cost ?? Math.round(steps.reduce((n, s) => n + (s.status === "missing" ? 100 : s.status === "unknown" ? 50 : s.status === "partial" ? 20 : 5), 0));
  await graph.query(
    UPSERT_PLAN,
    params({
      id: planId,
      hypothesisId,
      projectId: pid,
      steps: JSON.stringify(steps),
      controls: JSON.stringify(plan.object.controls),
      rationale: plan.object.rationale,
      killTest: plan.object.killTest,
      costToKill,
      rank,
      designCheck: JSON.stringify(check.object),
      designPasses: check.object.passes,
      state: check.object.passes ? "agent_verified" : "low_confidence",
      confidence: check.object.passes ? 0.8 : 0.4,
      runId: run.runId,
      at,
    }),
  );
  await graph.query(CLEAR_PLAN_STEPS, params({ id: planId }));
  const stepRows = steps.map((s, i) => ({ procedureId: s.procedureId, order: i + 1, purpose: s.purpose, status: s.status, gap: s.gap })).filter((r) => r.procedureId);
  if (stepRows.length) await graph.query(LINK_PLAN_STEPS, params({ id: planId, rows: stepRows }));

  const result: DesignResult = { planId, hypothesisId, steps: steps.length, gaps: steps.filter((s) => s.gap).length, passes: check.object.passes, issues: check.object.issues, costToKill };
  log(`plan: ${result.steps} steps, ${result.gaps} gaps, design check ${result.passes ? "passes" : "fails"}`);
  await run.finish("ANSWERED", [result], project.createdBy);
  return result;
}
