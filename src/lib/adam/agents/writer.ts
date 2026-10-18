// Hypothesis Writer — one job: turn the Analyst's candidates and the graph into two to four
// competing hypothesis briefs (spec, Phase 5 · Hypothesise, and "Hypothesis brief template").
// A single hypothesis makes every result look like confirmation, so there are always several.
// Each brief is a query against the graph: its evidence sections are claim ids, its boundary
// comes from conditions and assumptions, its prediction must be distinguishable by a method
// in the graph. A brief with no failure condition is not ready and is marked so. The Writer
// also answers the Falsifier's attacks in writing; an attack it cannot answer stays open, and
// one it concedes is fatal.

import { ADAM_QUERY_TIMEOUT_MS } from "../types";
import type { Graph } from "falkordb";
import { z } from "zod";
import { startRun } from "../../agents/base";
import { embedTexts } from "../../graph/embeddings";
import { clip, structured } from "../llm";
import { parseJson, type AdamProject } from "../types";
import type { QuestionPage } from "../question-page";
import {
  ANSWER_ATTACKS,
  ATTACKS_FOR,
  BRIEF_EVIDENCE,
  CLEAR_BRIEF_EVIDENCE,
  DELETE_PASS_DRAFT_BRIEFS,
  GET_BRIEF,
  LINK_DERIVED_FROM,
  LINK_EVIDENCE_AGAINST,
  LINK_EVIDENCE_FOR,
  LINK_RESTS_ON,
  LINK_WOULD_USE,
  SET_BRIEF_STATUS,
  UPSERT_BRIEF,
  WRITER_ASSUMPTIONS,
  WRITER_CANDIDATES,
  WRITER_CLAIMS,
  WRITER_CONDITIONS,
  WRITER_METHODS,
} from "../queries-hypotheses";

const BriefSchema = z.object({
  statement: z.string().describe("One sentence, phrased so a specific result would make it false"),
  mechanism: z.string().describe("Why it would be true: the causal story, in a paragraph, built from the claims cited"),
  boundaryHolds: z.array(z.string()).min(1).max(6).describe("Conditions under which it should hold"),
  boundaryFails: z.array(z.string()).max(6).describe("Conditions under which it should fail. Empty means the brief is not ready"),
  evidenceFor: z.array(z.string()).describe("Claim ids (exactly as listed) that support it"),
  evidenceAgainst: z.array(z.string()).describe("Claim ids that hurt it. An empty list is a warning sign; look hard"),
  restsOn: z.array(z.string()).describe("Assumption ids it depends on"),
  wouldUse: z.array(z.string()).describe("Method ids the test would use"),
  derivedFrom: z.array(z.string()).describe("Candidate ids (holes, conflicts, load-bearing assumptions) it comes from"),
  predictionIfTrue: z.string().describe("If true, we will observe X under conditions C"),
  predictionIfFalse: z.string().describe("If false, we will observe Y"),
  procedureHint: z.string().describe("The method or procedure in the graph that could distinguish X from Y"),
  killCriteria: z.string().describe("The exact result that makes us drop it, written before any data is collected: one or two sentences naming a single observable result, not a list of conditions"),
});

const BriefsSchema = z.object({ briefs: z.array(BriefSchema).min(2).max(4) });

const AnswerSchema = z.object({
  answers: z.array(
    z.object({
      attackId: z.string(),
      answer: z.string().describe("The written answer: how the brief survives this attack, or why it does not"),
      status: z.enum(["answered", "open", "fatal"]).describe("answered: the attack is met; open: it needs an experiment or evidence not yet available; fatal: the attack stands and the hypothesis should be dropped"),
    }),
  ),
  revisedKillCriteria: z
    .string()
    .nullable()
    .optional()
    .describe("A sharper kill criterion if an attack showed the old one was too loose; else null. One or two sentences naming the single result that drops the hypothesis. Never a list of conditions: those go to revisedBoundaryFails"),
  revisedBoundaryFails: z.array(z.string()).nullable().optional().describe("Added failure conditions if an attack found the boundary incomplete; else null"),
});

/** A kill criterion is one result, not a checklist; a revision longer than this is a list and is kept out. */
const KILL_CRITERIA_MAX = 500;

const WRITER_SYSTEM = `You are the Hypothesis Writer in a research-agent system whose premise is: a new result is a new combination of known steps. You write two to four COMPETING hypotheses from the material given (candidate holes, conflicts and untested assumptions; verified claims with ids; methods; assumptions; failure conditions). Rules:
- Every evidence id you cite must be in the lists provided. Do not invent ids or evidence.
- Each statement must be falsifiable: name the result that would make it false, and the conditions under which it should fail. A hypothesis that every outcome would appear to confirm is useless.
- Prefer hypotheses that come from a hole, a conflict or a load-bearing assumption over ones that merely restate what the literature already says. Safe, plausible-sounding ideas that are already in the papers are a failure mode here.
- Predictions must be distinguishable by a method in the graph.
- The briefs must compete: they should not all be true at once.`;

const ANSWER_SYSTEM = `You are the Hypothesis Writer answering the Falsifier's attacks on your brief, in writing. Be honest: if an attack stands and cannot be met by the evidence or by a design change, concede it (fatal). If it can only be settled by an experiment that is not yet run, say so (open). If it is met, say how (answered). Where an attack shows the kill criterion was too loose or the boundary incomplete, revise them.`;

interface ClaimRow {
  id: string;
  text: string;
  section: string;
  speculative: boolean;
  conditions: string[];
  confidence: number;
  triage: string;
  paper: string;
  year: number;
  page: number;
  methods: string[];
  assumptionIds: string[];
}

const params = <T>(p: T) => ({ params: p as never, TIMEOUT: ADAM_QUERY_TIMEOUT_MS });

export interface WriterResult {
  briefs: { id: string; statement: string; ready: boolean }[];
}

export async function runWriter(
  graph: Graph,
  workspaceId: string,
  project: AdamProject,
  page: QuestionPage,
  opts: { heartbeat?: (p: Record<string, unknown>) => Promise<void>; log?: (m: string) => void } = {},
): Promise<WriterResult> {
  const run = await startRun("adam-writer", workspaceId, { projectId: project.id, pass: project.pass });
  const beat = opts.heartbeat ?? (async () => {});
  const log = opts.log ?? (() => {});
  const pid = project.id;
  const at = Date.now();

  const [claims, methods, assumptions, conditions, candidates] = await Promise.all([
    graph.roQuery<ClaimRow>(WRITER_CLAIMS, params({ projectId: pid, limit: 90 })).then((r) => r.data ?? []),
    graph.roQuery<{ id: string; name: string; dependents: number; runnability: string; feasibility: string }>(WRITER_METHODS, params({ projectId: pid, limit: 40 })).then((r) => r.data ?? []),
    graph.roQuery<{ id: string; text: string; dependents: number; loadBearing: boolean; stated: boolean }>(WRITER_ASSUMPTIONS, params({ projectId: pid, limit: 25 })).then((r) => r.data ?? []),
    graph.roQuery<{ id: string; text: string; claimId: string }>(WRITER_CONDITIONS, params({ projectId: pid, limit: 30 })).then((r) => r.data ?? []),
    graph.roQuery<{ id: string; kind: string; summary: string; detail: string; score: number }>(WRITER_CANDIDATES, params({ projectId: pid })).then((r) => r.data ?? []),
  ]);
  if (claims.length < 3) throw new Error("too few verified claims to write hypotheses");

  const ids = { claims: new Set(claims.map((c) => c.id)), methods: new Set(methods.map((m) => m.id)), assumptions: new Set(assumptions.map((a) => a.id)), candidates: new Set(candidates.map((c) => c.id)) };
  const material = [
    `Question page\nHunch: ${page.hunch}\nSub-questions:\n${page.subquestions.map((q) => `- ${q.text}`).join("\n")}`,
    `Candidates from the Graph Analyst (${candidates.length})\n${candidates.map((c) => {
      const d = parseJson<Record<string, unknown>>(c.detail, {});
      const extra = c.kind === "hole" ? ` Question: ${d.question ?? ""}` : c.kind === "conflict" ? ` Explanations: ${(d.explanations as string[] | undefined)?.join(" | ") ?? ""}` : ` Cheapest test: ${d.cheapestTest ?? ""}`;
      return `- [${c.id}] (${c.kind}) ${c.summary}${extra}`;
    }).join("\n") || "(none)"}`,
    `Verified claims (${claims.length}; id · paper · year · section)\n${claims.map((c) => `- [${c.id}] ${clip(c.text, 260)} — ${c.paper.slice(0, 50)} ${c.year || ""} · ${c.section}${c.speculative ? " · speculative" : ""}${c.conditions.length ? ` · conditions: ${c.conditions.slice(0, 3).join("; ")}` : ""}${c.methods.length ? ` · methods: ${c.methods.slice(0, 3).join(", ")}` : ""}`).join("\n")}`,
    `Methods (${methods.length})\n${methods.map((m) => `- [${m.id}] ${m.name} · used by ${m.dependents} claims · procedure ${m.runnability}${m.feasibility ? ` · ${m.feasibility}` : ""}`).join("\n")}`,
    `Assumptions (${assumptions.length})\n${assumptions.map((a) => `- [${a.id}] ${clip(a.text, 200)} · ${a.dependents} claims depend${a.loadBearing ? " · load-bearing" : ""}${a.stated ? "" : " · unstated"}`).join("\n")}`,
    `Known failure conditions\n${conditions.map((k) => `- ${clip(k.text, 160)} (claim ${k.claimId})`).join("\n") || "(none recorded)"}`,
  ].join("\n\n");

  const out = await run.step(
    "llm.write",
    () => structured({ graph, projectId: pid, schema: BriefsSchema, system: WRITER_SYSTEM, prompt: `Write two to four competing hypothesis briefs.\n\n${material}`, tier: "heavy", maxTokens: 9000, label: "writer" }),
    { source: "llm" },
  );
  await beat({ step: "written", n: out.object.briefs.length });

  // Replace this pass's undecided drafts; keep anything the researcher selected or edited
  await graph.query(DELETE_PASS_DRAFT_BRIEFS, params({ projectId: pid, pass: project.pass }));
  const vectors = await embedTexts(out.object.briefs.map((b) => b.statement), "document");
  const result: WriterResult = { briefs: [] };
  for (const [i, b] of out.object.briefs.entries()) {
    const id = `hypothesis:${pid.slice(0, 8)}:p${project.pass}:${i + 1}:${Math.random().toString(36).slice(2, 6)}`;
    const evidenceFor = b.evidenceFor.filter((x) => ids.claims.has(x));
    const evidenceAgainst = b.evidenceAgainst.filter((x) => ids.claims.has(x));
    const restsOn = b.restsOn.filter((x) => ids.assumptions.has(x));
    const wouldUse = b.wouldUse.filter((x) => ids.methods.has(x));
    const derivedFrom = b.derivedFrom.filter((x) => ids.candidates.has(x));
    const ready = b.boundaryFails.length > 0 && evidenceFor.length > 0 && b.killCriteria.trim().length > 10;
    await graph.query(
      UPSERT_BRIEF,
      params({
        id,
        projectId: pid,
        pass: project.pass,
        statement: b.statement,
        mechanism: b.mechanism,
        boundaryHolds: b.boundaryHolds,
        boundaryFails: b.boundaryFails,
        predictionIfTrue: b.predictionIfTrue,
        predictionIfFalse: b.predictionIfFalse,
        procedureHint: b.procedureHint,
        killCriteria: b.killCriteria,
        ready,
        state: ready ? "agent_verified" : "low_confidence",
        stateReason: ready ? null : b.boundaryFails.length ? "no_evidence" : "no_failure_condition",
        confidence: Math.min(1, 0.3 + evidenceFor.length * 0.08),
        runId: run.runId,
        at,
        embedding: vectors[i],
      }),
    );
    await graph.query(CLEAR_BRIEF_EVIDENCE, params({ id }));
    const link = { id, by: "agent:adam-writer", runId: run.runId, at };
    if (evidenceFor.length) await graph.query(LINK_EVIDENCE_FOR, params({ ...link, ids: evidenceFor }));
    if (evidenceAgainst.length) await graph.query(LINK_EVIDENCE_AGAINST, params({ ...link, ids: evidenceAgainst }));
    if (restsOn.length) await graph.query(LINK_RESTS_ON, params({ ...link, ids: restsOn }));
    if (wouldUse.length) await graph.query(LINK_WOULD_USE, params({ ...link, ids: wouldUse }));
    if (derivedFrom.length) await graph.query(LINK_DERIVED_FROM, params({ ...link, ids: derivedFrom }));
    result.briefs.push({ id, statement: b.statement, ready });
    log(`brief ${i + 1}: ${ready ? "ready" : "not ready"} · for ${evidenceFor.length} · against ${evidenceAgainst.length} · ${b.statement.slice(0, 80)}`);
  }
  await run.finish("ANSWERED", result.briefs, project.createdBy);
  return result;
}

export interface AnswerResult {
  answered: number;
  open: number;
  fatal: number;
  revised: boolean;
}

/** The Writer answers one round of attacks on one brief, in writing. */
export async function answerAttacks(graph: Graph, workspaceId: string, project: AdamProject, hypothesisId: string, round: number): Promise<AnswerResult> {
  const run = await startRun("adam-writer", workspaceId, { projectId: project.id, hypothesisId, round, action: "answer" });
  const brief = (await graph.roQuery<{ statement: string; mechanism: string; boundaryHolds: string[]; boundaryFails: string[]; killCriteria: string; predictionIfTrue: string; predictionIfFalse: string }>(GET_BRIEF, params({ id: hypothesisId }))).data?.[0];
  if (!brief) throw new Error("brief not found");
  const attacks = ((await graph.roQuery<{ id: string; kind: string; text: string; status: string; round: number; control: string; killCriterion: string }>(ATTACKS_FOR, params({ id: hypothesisId }))).data ?? []).filter((a) => a.round === round && a.status === "open");
  if (!attacks.length) return { answered: 0, open: 0, fatal: 0, revised: false };
  const evidence = (await graph.roQuery<{ type: string; id: string; text: string; paper: string; year: number }>(BRIEF_EVIDENCE, params({ id: hypothesisId }))).data ?? [];

  const out = await run.step(
    "llm.answer",
    () =>
      structured({
        graph,
        projectId: project.id,
        schema: AnswerSchema,
        system: ANSWER_SYSTEM,
        prompt: `Brief\nStatement: ${brief.statement}\nMechanism: ${brief.mechanism}\nHolds under: ${brief.boundaryHolds.join("; ")}\nFails under: ${brief.boundaryFails.join("; ") || "(none stated)"}\nPrediction: if true, ${brief.predictionIfTrue}; if false, ${brief.predictionIfFalse}\nKill criteria: ${brief.killCriteria}\n\nEvidence\n${evidence.map((e) => `- [${e.id}] (${e.type === "EVIDENCE_FOR" ? "for" : "against"}) ${clip(e.text, 220)} — ${e.paper.slice(0, 50)} ${e.year || ""}`).join("\n")}\n\nAttacks (round ${round})\n${attacks.map((a) => `- [${a.id}] (${a.kind}) ${a.text}${a.control ? ` Control proposed: ${a.control}` : ""}${a.killCriterion ? ` Sharper kill criterion proposed: ${a.killCriterion}` : ""}`).join("\n")}`,
        tier: "heavy",
        maxTokens: 6000,
        label: `answer:${hypothesisId}`,
      }),
    { source: "llm" },
  );
  const valid = out.object.answers.filter((a) => attacks.some((x) => x.id === a.attackId));
  const at = Date.now();
  await graph.query(ANSWER_ATTACKS, params({ rows: valid.map((a) => ({ id: a.attackId, answer: a.answer, status: a.status })), at, runId: run.runId }));
  const revisedKill = out.object.revisedKillCriteria && out.object.revisedKillCriteria.trim().length <= KILL_CRITERIA_MAX ? out.object.revisedKillCriteria.trim() : null;
  const revised = !!(revisedKill || out.object.revisedBoundaryFails?.length);
  if (revised) {
    await graph.query(SET_BRIEF_STATUS, params({ id: hypothesisId, status: "attacked", rounds: null, at, killCriteria: revisedKill, boundaryFails: out.object.revisedBoundaryFails?.length ? [...new Set([...brief.boundaryFails, ...out.object.revisedBoundaryFails])] : null }));
  }
  const result: AnswerResult = {
    answered: valid.filter((a) => a.status === "answered").length,
    open: valid.filter((a) => a.status === "open").length + (attacks.length - valid.length),
    fatal: valid.filter((a) => a.status === "fatal").length,
    revised,
  };
  await run.finish("ANSWERED", [result], project.createdBy);
  return result;
}
