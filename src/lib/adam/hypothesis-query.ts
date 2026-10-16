// Hypothesis as a query (spec, "Hypothesis as a query"): the feature the whole system exists
// to deliver. The researcher types a hypothesis; the system answers with the chain of known
// steps that could test it, and shows where the chain breaks.
//   1. the hypothesis becomes a predicted Result, starting materials, a mechanism (methods)
//      and sub-claims
//   2. boundary: where the literature says it should hold and fail (conditions, assumptions
//      of the supporting claims)
//   3. candidate chains: paths of Procedures ending in a Result close to the prediction,
//      each step with its status (verified / partial / unknown / infeasible)
//   4. gaps: no chain → an OpenQuestion; partial steps re-prioritise the Methods Hunter
//   5. rival chains: paths to the same result that avoid the mechanism's methods, which
//      become the Falsifier's rival explanations
//   6. cost to kill: the cheapest chain whose failure would falsify the hypothesis
// Everything returned carries graph ids, so the UI can click from a step to its sources.

import type { Graph } from "falkordb";
import { z } from "zod";
import { startRun } from "../agents/base";
import { embedTexts } from "../graph/embeddings";
import { scoreSupport } from "../jev";
import { structured } from "./llm";
import {
  BUMP_CHAINS_NEEDING,
  CLAIM_BOUNDARY,
  CLEAR_HYPOTHESIS_CHAINS,
  LINK_BLOCKS,
  LINK_HYPOTHESIS_CHAIN,
  LINK_HYPOTHESIS_PREDICTS,
  METHODS_BY_KEYS,
  NEAREST_METHODS_TO,
  NEAREST_RESULTS,
  NEAREST_VERIFIED_CLAIMS,
  PROCEDURE_CHAINS,
  PROCEDURE_DETAILS,
  SET_HYPOTHESIS_QUERY,
  UPSERT_OPEN_QUESTION,
} from "./queries-experiments";
import { CREATE_ATTACKS } from "./queries-hypotheses";
import { nameKey } from "./resolve";
import type { AdamProject } from "./types";

const ParseSchema = z.object({
  statement: z.string().describe("The hypothesis restated in one falsifiable sentence"),
  predictedResult: z.string().describe("The outcome that would be observed if it is true, as a checkable statement"),
  startingMaterials: z.array(z.string()).describe("What a lab would start from: data, samples, models, reagents"),
  mechanismMethods: z.array(z.string()).describe("The techniques the mechanism relies on, as a paper would name them"),
  subclaims: z.array(z.string()).min(1).max(4).describe("The two to four things that must be true for the hypothesis to hold"),
});

/** Result nodes this close to the prediction are candidates; closer than RIVAL_SAME they are the same result. */
const RESULT_DISTANCE = 0.35;
const RIVAL_SAME = 0.12;
const SUBCLAIM_DISTANCE = 0.3;
/** Cost weights (spec: "cost over time, money and gap count") */
const W = { hour: 1, usd: 0.01, unknown: 50, partial: 20, infeasible: 100 } as const;

export type StepStatus = "verified" | "partial" | "unknown" | "infeasible" | "missing";

export interface ChainStep {
  procedureId: string;
  name: string;
  methodId: string;
  methodName: string;
  runnability: string;
  feasibility: string;
  feasibilityNote: string;
  status: StepStatus;
  missing: string[];
  timeHours: number;
  costUsd: number;
  reliability: number;
  expected: string;
  instruments: { name: string; kind: string; available: boolean }[];
}

export interface Chain {
  rank: number;
  resultId: string;
  resultText: string;
  resultDistance: number;
  steps: ChainStep[];
  cost: number;
  gaps: number;
  feasible: boolean;
  /** true when the chain reaches the result without the mechanism's methods: a rival */
  rival: boolean;
  throughMechanism: string[];
}

export interface EvidenceHit {
  id: string;
  text: string;
  paperId: string;
  paper: string;
  year: number;
  page: number;
  section: string;
  level: "supports" | "partial" | "unrelated" | "contradicts";
  confidence: number;
}

export interface SubclaimReport {
  text: string;
  for: EvidenceHit[];
  against: EvidenceHit[];
  gap: boolean;
}

export interface HypothesisQueryResult {
  statement: string;
  predictedResult: string;
  startingMaterials: string[];
  mechanismMethods: string[];
  subclaims: SubclaimReport[];
  boundary: { holds: string[]; fails: string[]; assumptions: { id: string; text: string; loadBearing: boolean; dependents: number }[] };
  chains: Chain[];
  rivals: Chain[];
  gaps: { kind: "missing_procedure" | "untested_subclaim"; text: string; chainsNeeding: number; openQuestionId: string | null }[];
  costToKill: { chainRank: number; cost: number; description: string } | null;
  runId: string;
}

const params = <T>(p: T) => ({ params: p as never });

const stepStatus = (p: { runnability: string; feasibility: string; instruments: { available: boolean; kind: string }[] }): StepStatus => {
  const needsUnavailable = p.instruments.some((i) => !i.available && (i.kind === "equipment" || i.kind === "reagent"));
  if (p.feasibility.startsWith("missing") || p.feasibility === "over_budget" || needsUnavailable) return "infeasible";
  if (p.runnability === "runnable") return "verified";
  if (p.runnability === "partial") return "partial";
  return "unknown";
};

const chainCost = (steps: ChainStep[]) =>
  steps.reduce((s, st) => s + st.timeHours * W.hour + st.costUsd * W.usd + (st.status === "unknown" ? W.unknown : 0) + (st.status === "partial" ? W.partial : 0) + (st.status === "infeasible" ? W.infeasible : 0), 0);

export async function hypothesisQuery(
  graph: Graph,
  workspaceId: string,
  project: AdamProject,
  input: { text: string; hypothesisId?: string | null; userId?: string },
): Promise<HypothesisQueryResult> {
  const run = await startRun("adam-designer", workspaceId, { projectId: project.id, hypothesisId: input.hypothesisId ?? null, query: input.text.slice(0, 300) });
  const pid = project.id;
  const at = Date.now();

  // 1. Parse
  const parsed = await run.step(
    "llm.parse",
    () =>
      structured({
        graph,
        projectId: pid,
        schema: ParseSchema,
        system: "You turn a research hypothesis into the parts a literature graph can be queried with. Be concrete; name techniques as papers name them.",
        prompt: `Hypothesis: ${input.text}\n\nLab constraints: equipment ${project.constraints.equipment.join(", ") || "unspecified"}; data ${project.constraints.data.join(", ") || "unspecified"}.`,
        label: "hypothesis-query:parse",
      }),
    { source: "llm" },
  );
  const q = parsed.object;
  const [resultVec, ...subVecs] = await embedTexts([q.predictedResult, ...q.subclaims], "query");

  // 2. Sub-claims: evidence for / against, gaps
  const subclaims: SubclaimReport[] = [];
  for (const [i, sc] of q.subclaims.entries()) {
    const near = ((await graph.roQuery<{ id: string; text: string; paperId: string; paper: string; year: number; page: number; section: string; conditions: string[]; score: number }>(NEAREST_VERIFIED_CLAIMS, params({ projectId: pid, k: 8, v: subVecs[i] })).catch(() => ({ data: [] }))).data ?? []).filter((n) => n.score <= SUBCLAIM_DISTANCE);
    const judged = near.length ? await scoreSupport(sc, near.map((n) => ({ id: n.id, title: n.paper, abstract: n.text }))) : null;
    const hits: (EvidenceHit & { conditions: string[] })[] = near.map((n) => {
      const j = judged?.result.get(n.id);
      return { id: n.id, text: n.text, paperId: n.paperId, paper: n.paper, year: n.year, page: n.page, section: n.section, conditions: n.conditions, level: j?.level ?? "unrelated", confidence: j?.confidence ?? 0 };
    });
    const forHits = hits.filter((h) => h.level === "supports" || h.level === "partial");
    const againstHits = hits.filter((h) => h.level === "contradicts");
    subclaims.push({ text: sc, for: forHits, against: againstHits, gap: forHits.length === 0 });
  }
  const supportingIds = subclaims.flatMap((s) => s.for.map((h) => h.id));

  // 3. Boundary from the supporting claims
  const boundaryRow = supportingIds.length ? (await graph.roQuery<{ fails: string[]; assumptions: { id: string; text: string; loadBearing: boolean; dependents: number }[] }>(CLAIM_BOUNDARY, params({ ids: supportingIds }))).data?.[0] : null;
  const holds = [...new Set(subclaims.flatMap((s) => s.for.flatMap((h) => near_conditions(h))))];
  const boundary = {
    holds,
    fails: boundaryRow?.fails ?? [],
    assumptions: (boundaryRow?.assumptions ?? []).sort((a, b) => Number(b.loadBearing) - Number(a.loadBearing) || b.dependents - a.dependents).slice(0, 10),
  };

  // 4. Mechanism methods in the graph (by key, then by embedding)
  const keys = q.mechanismMethods.map(nameKey).filter(Boolean);
  const byKey = keys.length ? ((await graph.roQuery<{ id: string; name: string }>(METHODS_BY_KEYS, params({ projectId: pid, keys }))).data ?? []) : [];
  const mechanismIds = new Set(byKey.map((m) => m.id));
  if (q.mechanismMethods.length) {
    const vecs = await embedTexts(q.mechanismMethods, "query");
    for (const v of vecs) {
      const near = (await graph.roQuery<{ id: string; name: string; score: number }>(NEAREST_METHODS_TO, params({ projectId: pid, k: 2, v, maxDistance: 0.2 })).catch(() => ({ data: [] }))).data ?? [];
      for (const n of near) mechanismIds.add(n.id);
    }
  }

  // 5. Chains to nearby results
  const results = ((await graph.roQuery<{ id: string; text: string; score: number }>(NEAREST_RESULTS, params({ projectId: pid, k: 6, v: resultVec })).catch(() => ({ data: [] }))).data ?? []).filter((r) => r.score <= RESULT_DISTANCE);
  const chains: Chain[] = [];
  for (const r of results) {
    const paths = (await graph.roQuery<{ ids: string[]; names: string[]; runnability: string[]; feasibility: string[]; hours: number[]; cost: number[]; states: string[]; hops: number }>(PROCEDURE_CHAINS, params({ resultId: r.id }))).data ?? [];
    const allIds = [...new Set(paths.flatMap((p) => p.ids))];
    type DetailRow = Omit<ChainStep, "status" | "instruments" | "procedureId"> & { id: string; instruments: string[] };
    const details = allIds.length ? ((await graph.roQuery<DetailRow>(PROCEDURE_DETAILS, params({ ids: allIds }))).data ?? []) : [];
    const detailOf = new Map(details.map((d) => [d.id, d]));
    for (const p of paths) {
      // nodes(p) goes last → first; a lab runs first → last
      const steps: ChainStep[] = [...p.ids].reverse().map((id) => {
        const d = detailOf.get(id);
        const instruments = (d?.instruments ?? []).map((s) => {
          const [name, kind, avail] = s.split("|");
          return { name, kind, available: avail === "1" };
        });
        const base = { procedureId: id, name: d?.name ?? "", methodId: d?.methodId ?? "", methodName: d?.methodName ?? "", runnability: d?.runnability ?? "unknown", feasibility: d?.feasibility ?? "unknown", feasibilityNote: d?.feasibilityNote ?? "", missing: d?.missing ?? [], timeHours: d?.timeHours ?? 0, costUsd: d?.costUsd ?? 0, reliability: d?.reliability ?? 0, expected: d?.expected ?? "", instruments };
        return { ...base, status: stepStatus(base) };
      });
      const through = steps.filter((s) => mechanismIds.has(s.methodId)).map((s) => s.methodName);
      chains.push({
        rank: 0,
        resultId: r.id,
        resultText: r.text,
        resultDistance: r.score,
        steps,
        cost: chainCost(steps),
        gaps: steps.filter((s) => s.status !== "verified").length,
        feasible: steps.every((s) => s.status !== "infeasible"),
        rival: mechanismIds.size > 0 && through.length === 0 && r.score > RIVAL_SAME,
        throughMechanism: through,
      });
    }
  }
  // Dedupe identical step sequences, rank cheapest-to-kill first
  const seen = new Set<string>();
  const unique = chains.filter((c) => {
    const k = c.steps.map((s) => s.procedureId).join(">") + "@" + c.resultId;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const own = unique.filter((c) => !c.rival).sort((a, b) => a.cost - b.cost).map((c, i) => ({ ...c, rank: i + 1 }));
  const rivals = unique.filter((c) => c.rival).sort((a, b) => a.cost - b.cost).map((c, i) => ({ ...c, rank: i + 1 }));

  // 6. Gaps: no chain at all, or steps that are not runnable; the Methods Hunter is re-prioritised
  const gaps: HypothesisQueryResult["gaps"] = [];
  const bump = new Map<string, number>();
  for (const c of own) for (const s of c.steps) if (s.status === "partial" || s.status === "unknown") bump.set(s.methodId, (bump.get(s.methodId) ?? 0) + 1);
  if (bump.size) await graph.query(BUMP_CHAINS_NEEDING, params({ rows: [...bump.entries()].filter(([m]) => m).map(([methodId, n]) => ({ methodId, n })) }));
  if (!own.length) {
    const text = `No procedure in the graph yields "${q.predictedResult}" from ${q.startingMaterials.join(", ") || "the stated starting point"}. Either it exists and has not been found, or it must be invented.`;
    const id = `openq:${pid.slice(0, 8)}:missing:${Buffer.from(q.predictedResult).toString("base64url").slice(0, 24)}`;
    await graph.query(UPSERT_OPEN_QUESTION, params({ id, projectId: pid, text, kind: "missing_procedure", runId: run.runId, at }));
    if (input.hypothesisId) await graph.query(LINK_BLOCKS, params({ questionId: id, hypothesisId: input.hypothesisId, at }));
    gaps.push({ kind: "missing_procedure", text, chainsNeeding: 1, openQuestionId: id });
  }
  for (const s of subclaims.filter((x) => x.gap)) gaps.push({ kind: "untested_subclaim", text: `No verified claim supports: ${s.text}`, chainsNeeding: 0, openQuestionId: null });

  // 7. Cost to kill: the cheapest feasible chain, else the cheapest chain
  const best = own.find((c) => c.feasible) ?? own[0] ?? null;
  const costToKill = best
    ? { chainRank: best.rank, cost: Math.round(best.cost), description: `${best.steps.map((s) => s.name).join(" → ")} → ${best.resultText}` }
    : null;

  // 8. Persist on the brief, when the query is for one: chains, prediction, rivals as attacks
  if (input.hypothesisId) {
    await graph.query(CLEAR_HYPOTHESIS_CHAINS, params({ id: input.hypothesisId }));
    const rows = own.slice(0, 5).flatMap((c) => c.steps.map((s, i) => ({ procedureId: s.procedureId, rank: c.rank, step: i + 1, cost: c.cost, status: s.status })));
    if (rows.length) await graph.query(LINK_HYPOTHESIS_CHAIN, params({ id: input.hypothesisId, rows, at }));
    if (results[0]) await graph.query(LINK_HYPOTHESIS_PREDICTS, params({ id: input.hypothesisId, resultId: results[0].id, score: results[0].score, at }));
    if (rivals.length) {
      const attackRows = rivals.slice(0, 4).map((c, i) => ({
        id: `attack:${input.hypothesisId!.split(":").slice(1).join(":")}:rival-chain:${i + 1}:${at.toString(36)}`,
        kind: "rival",
        text: `A different chain reaches a result like "${c.resultText}" without the mechanism's methods: ${c.steps.map((s) => s.name).join(" → ")}. If that chain also produces the predicted result, the mechanism is not what explains it.`,
        cites: c.steps.map((s) => s.procedureId),
        control: `Run the hypothesis's chain and this one side by side; the mechanism is supported only if the result appears with ${c.steps.find((s) => s.methodName)?.methodName ? "the mechanism's step and not with" : "its own steps and not with"} the rival's.`,
        killCriterion: "",
      }));
      await graph.query(CREATE_ATTACKS, params({ hypothesisId: input.hypothesisId, projectId: pid, rows: attackRows, round: 0, runId: run.runId, at }));
    }
    await graph.query(SET_HYPOTHESIS_QUERY, params({ id: input.hypothesisId, minimumExperiment: costToKill?.description ?? null, costToKill: costToKill?.cost ?? 0, at, queryResult: JSON.stringify({ chains: own.length, rivals: rivals.length, gaps: gaps.length }) }));
  }

  for (const c of own) for (const s of c.steps) run.highlight.add(s.procedureId);
  const out: HypothesisQueryResult = { statement: q.statement, predictedResult: q.predictedResult, startingMaterials: q.startingMaterials, mechanismMethods: q.mechanismMethods, subclaims, boundary, chains: own, rivals, gaps, costToKill, runId: run.runId };
  await run.finish(own.length || supportingIds.length ? "ANSWERED" : "NOT_IN_GRAPH", [{ chains: own.length, rivals: rivals.length, gaps: gaps.length }], input.userId);
  return out;
}

/** Conditions attached to a supporting claim are where the literature says the hypothesis holds. */
function near_conditions(h: EvidenceHit & { conditions?: string[] }): string[] {
  return (h as { conditions?: string[] }).conditions ?? [];
}
