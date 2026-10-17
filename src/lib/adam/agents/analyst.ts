// Graph Analyst — one job: read the whole graph and report where hypotheses hide (spec,
// Phase 4 · Connect). It looks for exactly three patterns:
//   holes             two clusters that are clearly related (shared methods, close vocabulary)
//                     with no edge between them: nobody has connected them yet
//   conflicts         two papers making opposite claims: something unmeasured, usually a
//                     condition or an assumption, explains the difference
//   load-bearing      one assumption many claims depend on that nothing has tested directly
// This is the one agent that is not split by task: spotting a hole needs the whole picture.
// Every candidate passes a sanity check by a separate call that sees only the candidate's
// subgraph: an edge needs more than vocabulary overlap, and a hole needs both clusters
// verified. Candidates that fail are kept with sane:false so the researcher can see why.

import type { Graph } from "falkordb";
import { z } from "zod";
import { startRun } from "../../agents/base";
import { structured } from "../llm";
import {
  CONFLICT_PAIRS,
  DELETE_PASS_CANDIDATES,
  LINK_CANDIDATE_PAPERS,
  LINK_CANDIDATE_SHOWS,
  LINKS_BETWEEN,
  LOAD_BEARING_ASSUMPTIONS,
  NEAREST_PROJECT_CLAIMS,
  PAPER_METHODS,
  PAPER_VECTORS,
  PROJECT_COMMUNITIES,
  SET_PAPER_COMMUNITIES,
  UPSERT_CANDIDATE,
  VERIFIED_CLAIMS_PER_PAPER,
} from "../queries-analyst";
import type { AdamProject } from "../types";

export type CandidateKind = "hole" | "conflict" | "load_bearing";

const MAX_HOLES = 8;
const MAX_CONFLICTS = 12;
const MAX_LOAD_BEARING = 10;
/** A hole needs real similarity between the clusters: shared methods, or close paper vectors. */
const HOLE_MIN_SHARED_METHODS = 2;
const HOLE_MIN_CENTROID_COS = 0.82;
/** An assumption counts as tested when a verified claim sits this close to it. */
const TESTED_DISTANCE = 0.18;

const HoleSchema = z.object({
  summary: z.string().describe("One sentence: what the two clusters are about and that nothing connects them"),
  whyItMatters: z.string().describe("What combining them could yield, in two sentences"),
  question: z.string().describe("The research question the hole suggests, phrased so evidence could settle it"),
});
const ConflictSchema = z.object({
  summary: z.string().describe("One sentence stating the disagreement precisely"),
  explanations: z.array(z.string()).min(1).max(4).describe("Unmeasured conditions or assumptions that could explain why both are true in their own settings"),
  cheapestTest: z.string().describe("The cheapest experiment that would tell the explanations apart"),
});
const LoadBearingSchema = z.object({
  summary: z.string().describe("One sentence: the assumption and how much rests on it"),
  cheapestTest: z.string().describe("The cheapest direct test of this assumption alone"),
  ifFalse: z.string().describe("What falls if the assumption is false"),
});
const SanitySchema = z.object({
  sane: z.boolean().describe("true if this candidate is a real signal, false if it is an artefact of vocabulary overlap, extraction noise, or thin evidence"),
  reason: z.string().optional().describe("One sentence"),
});

const SYSTEM = `You are the Graph Analyst in a research-agent system whose premise is: a new result is a new combination of known steps. The literature graph is given to you as summaries of its structure. Write precisely and concretely; name papers and methods; never invent evidence that is not in the material given.`;
const SANITY_SYSTEM = `You are the sanity checker for the Graph Analyst. You see one candidate signal and the material behind it, nothing else. Decide whether it is real: a hole between two clusters needs genuine shared substance, not just shared words; a conflict needs two claims that cannot both be true under the same conditions; a load-bearing assumption needs several claims that actually depend on it. Be strict.`;

interface Community {
  id: number;
  papers: { paperId: string; title: string; label: string }[];
  methods: Set<string>;
  methodNames: Set<string>;
  centroid: number[] | null;
  verifiedClaims: number;
}

const cosine = (a: number[], b: number[]) => {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};

const params = <T>(p: T) => ({ params: p as never });

export interface AnalystResult {
  communities: number;
  holes: number;
  conflicts: number;
  loadBearing: number;
  insane: number;
}

export async function runAnalyst(
  graph: Graph,
  workspaceId: string,
  project: AdamProject,
  opts: { heartbeat?: (p: Record<string, unknown>) => Promise<void>; log?: (m: string) => void } = {},
): Promise<AnalystResult> {
  const run = await startRun("adam-analyst", workspaceId, { projectId: project.id, pass: project.pass });
  const beat = opts.heartbeat ?? (async () => {});
  const log = opts.log ?? (() => {});
  const at = Date.now();
  const pid = project.id;

  // 1. Communities over the project's papers (CDLP over papers, methods and claims)
  const rows = await run.step(
    "graph.communities",
    async () => (await graph.roQuery<{ paperId: string; title: string; communityId: number; label: string; clusterId: string }>(PROJECT_COMMUNITIES, params({ projectId: pid }))).data ?? [],
    { source: "graph", cypher: "PROJECT_COMMUNITIES (algo.labelPropagation)" },
  );
  const [methodsRows, vectorRows, claimRows] = await Promise.all([
    graph.roQuery<{ paperId: string; methods: string[]; names: string[] }>(PAPER_METHODS, params({ projectId: pid })).then((r) => r.data ?? []),
    graph.roQuery<{ paperId: string; embedding: number[] }>(PAPER_VECTORS, params({ projectId: pid })).then((r) => r.data ?? []),
    graph.roQuery<{ paperId: string; claims: number }>(VERIFIED_CLAIMS_PER_PAPER, params({ projectId: pid })).then((r) => r.data ?? []),
  ]);
  const methodsOf = new Map(methodsRows.map((r) => [r.paperId, r]));
  const vectorOf = new Map(vectorRows.map((r) => [r.paperId, r.embedding]));
  const claimsOf = new Map(claimRows.map((r) => [r.paperId, r.claims]));

  const communities = new Map<number, Community>();
  for (const r of rows) {
    const c = communities.get(r.communityId) ?? { id: r.communityId, papers: [], methods: new Set(), methodNames: new Set(), centroid: null, verifiedClaims: 0 };
    c.papers.push({ paperId: r.paperId, title: r.title, label: r.label });
    for (const m of methodsOf.get(r.paperId)?.methods ?? []) c.methods.add(m);
    for (const m of methodsOf.get(r.paperId)?.names ?? []) c.methodNames.add(m);
    c.verifiedClaims += claimsOf.get(r.paperId) ?? 0;
    communities.set(r.communityId, c);
  }
  for (const c of communities.values()) {
    const vecs = c.papers.map((p) => vectorOf.get(p.paperId)).filter((v): v is number[] => !!v);
    if (vecs.length) c.centroid = vecs[0].map((_, i) => vecs.reduce((s, v) => s + v[i], 0) / vecs.length);
  }
  await graph.query(SET_PAPER_COMMUNITIES, params({ projectId: pid, rows: rows.map((r) => ({ paperId: r.paperId, community: `c${r.communityId}` })) }));
  log(`${communities.size} communities over ${rows.length} papers`);
  await beat({ step: "communities", n: communities.size });

  // Replace this pass's undecided candidates
  await graph.query(DELETE_PASS_CANDIDATES, params({ projectId: pid, pass: project.pass }));
  const result: AnalystResult = { communities: communities.size, holes: 0, conflicts: 0, loadBearing: 0, insane: 0 };

  const write = async (kind: CandidateKind, key: string, summary: string, detail: Record<string, unknown>, subgraph: { nodeIds: string[]; paperIds: string[] }, score: number, sane: boolean, saneReason: string, confidence: number) => {
    const id = `candidate:${pid.slice(0, 8)}:${kind}:${key}`;
    await graph.query(
      UPSERT_CANDIDATE,
      params({ id, projectId: pid, pass: project.pass, kind, summary, detail: JSON.stringify(detail), subgraph: JSON.stringify(subgraph), score, sane, saneReason, state: sane ? "agent_verified" : "low_confidence", confidence, runId: run.runId, at }),
    );
    if (subgraph.nodeIds.length) await graph.query(LINK_CANDIDATE_SHOWS, params({ candidateId: id, ids: subgraph.nodeIds }));
    if (subgraph.paperIds.length) await graph.query(LINK_CANDIDATE_PAPERS, params({ candidateId: id, ids: subgraph.paperIds }));
    if (!sane) result.insane++;
    return id;
  };

  // 2. Holes: related clusters with no edge between them
  const eligible = [...communities.values()].filter((c) => c.papers.length >= 2 && c.verifiedClaims >= 2);
  const holes: { a: Community; b: Community; shared: string[]; cos: number; score: number }[] = [];
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const a = eligible[i];
      const b = eligible[j];
      const shared = [...a.methodNames].filter((m) => b.methodNames.has(m));
      const cos = a.centroid && b.centroid ? cosine(a.centroid, b.centroid) : 0;
      if (shared.length < HOLE_MIN_SHARED_METHODS && cos < HOLE_MIN_CENTROID_COS) continue;
      const links = (await graph.roQuery<{ cites: number; claimLinks: number }>(LINKS_BETWEEN, params({ projectId: pid, a: a.papers.map((p) => p.paperId), b: b.papers.map((p) => p.paperId) }))).data?.[0];
      if ((links?.cites ?? 0) + (links?.claimLinks ?? 0) > 0) continue;
      holes.push({ a, b, shared, cos, score: shared.length + cos });
    }
  }
  holes.sort((x, y) => y.score - x.score);
  for (const h of holes.slice(0, MAX_HOLES)) {
    const material = `Cluster A (${h.a.papers.length} papers): ${h.a.papers.slice(0, 6).map((p) => p.title).join("; ")}\nMethods in A: ${[...h.a.methodNames].slice(0, 10).join(", ")}\n\nCluster B (${h.b.papers.length} papers): ${h.b.papers.slice(0, 6).map((p) => p.title).join("; ")}\nMethods in B: ${[...h.b.methodNames].slice(0, 10).join(", ")}\n\nShared methods: ${h.shared.join(", ") || "none"}; vector similarity ${h.cos.toFixed(2)}; citations between them: 0; claim-level links: 0.`;
    const [text, sanity] = await Promise.all([
      run.step("llm.hole", () => structured({ graph, projectId: pid, schema: HoleSchema, system: SYSTEM, prompt: `Two clusters of the literature are related but unconnected.\n\n${material}`, label: "analyst:hole" }), { source: "llm" }),
      run.step("llm.hole.sanity", () => structured({ graph, projectId: pid, schema: SanitySchema, system: SANITY_SYSTEM, prompt: `Candidate hole between two clusters.\n\n${material}\n\nIs this a real hole (genuinely related work that nobody has connected) or an artefact?`, label: "analyst:hole:sanity" }), { source: "llm" }),
    ]);
    await write(
      "hole",
      `${h.a.id}-${h.b.id}`,
      text.object.summary,
      { whyItMatters: text.object.whyItMatters, question: text.object.question, sharedMethods: h.shared, similarity: h.cos, clusterA: h.a.papers.map((p) => p.title), clusterB: h.b.papers.map((p) => p.title) },
      { nodeIds: [...h.a.methods, ...h.b.methods].slice(0, 30), paperIds: [...h.a.papers, ...h.b.papers].map((p) => p.paperId) },
      h.score,
      sanity.object.sane,
      sanity.object.reason ?? "",
      Math.min(1, h.score / 4),
    );
    result.holes++;
  }
  await beat({ step: "holes", n: result.holes });

  // 3. Conflicts: opposite claims, with the condition or assumption that might explain them
  const conflicts = (await graph.roQuery<{
    aId: string; aText: string; aConditions: string[]; aPaper: string; aYear: number; bId: string; bText: string; bConditions: string[]; bPaper: string; bYear: number;
    aAssumptions: string[]; bAssumptions: string[]; aMethods: string[]; bMethods: string[]; confidence: number;
  }>(CONFLICT_PAIRS, params({ projectId: pid, limit: MAX_CONFLICTS }))).data ?? [];
  for (const c of conflicts) {
    const material = `Claim A (${c.aPaper}, ${c.aYear || "n.d."}): ${c.aText}\n  conditions: ${c.aConditions.join("; ") || "none stated"}\n  methods: ${c.aMethods.join(", ") || "?"}\n  assumptions: ${c.aAssumptions.join("; ") || "none recorded"}\n\nClaim B (${c.bPaper}, ${c.bYear || "n.d."}): ${c.bText}\n  conditions: ${c.bConditions.join("; ") || "none stated"}\n  methods: ${c.bMethods.join(", ") || "?"}\n  assumptions: ${c.bAssumptions.join("; ") || "none recorded"}`;
    const [text, sanity] = await Promise.all([
      run.step("llm.conflict", () => structured({ graph, projectId: pid, schema: ConflictSchema, system: SYSTEM, prompt: `Two papers make opposite claims.\n\n${material}\n\nWhat unmeasured condition or untested assumption could explain the difference, and what would tell the explanations apart?`, label: "analyst:conflict" }), { source: "llm" }),
      run.step("llm.conflict.sanity", () => structured({ graph, projectId: pid, schema: SanitySchema, system: SANITY_SYSTEM, prompt: `Candidate conflict.\n\n${material}\n\nDo these two claims genuinely contradict each other (they cannot both hold under the same conditions), or is this a false conflict (different scope, compatible readings, extraction noise)?`, label: "analyst:conflict:sanity" }), { source: "llm" }),
    ]);
    await write(
      "conflict",
      `${c.aId.split(":").slice(-2).join("-")}-${c.bId.split(":").slice(-2).join("-")}`.replace(/[^a-z0-9-]/gi, "").slice(0, 80),
      text.object.summary,
      { explanations: text.object.explanations, cheapestTest: text.object.cheapestTest, a: { id: c.aId, text: c.aText, paper: c.aPaper, conditions: c.aConditions }, b: { id: c.bId, text: c.bText, paper: c.bPaper, conditions: c.bConditions } },
      { nodeIds: [c.aId, c.bId], paperIds: [] },
      1 + c.confidence,
      sanity.object.sane,
      sanity.object.reason ?? "",
      c.confidence,
    );
    result.conflicts++;
  }
  await beat({ step: "conflicts", n: result.conflicts });

  // 4. Load-bearing assumptions nothing has tested directly
  const assumptions = (await graph.roQuery<{ id: string; text: string; stated: boolean; dependents: number; claims: string[]; claimIds: string[]; embedding: number[] | null }>(LOAD_BEARING_ASSUMPTIONS, params({ projectId: pid, limit: MAX_LOAD_BEARING * 2 }))).data ?? [];
  let lb = 0;
  for (const a of assumptions) {
    if (lb >= MAX_LOAD_BEARING) break;
    const near = a.embedding ? ((await graph.roQuery<{ id: string; text: string; score: number }>(NEAREST_PROJECT_CLAIMS, params({ projectId: pid, k: 3, v: a.embedding })).catch(() => ({ data: [] }))).data ?? []) : [];
    const tested = near.find((n) => n.score <= TESTED_DISTANCE && !a.claimIds.includes(n.id));
    if (tested) continue; // something in the graph already tests it directly
    const material = `Assumption${a.stated ? " (stated)" : " (unstated)"}: ${a.text}\n${a.dependents} claims depend on it, for example:\n${a.claims.map((c) => `- ${c}`).join("\n")}\nNo verified claim in the graph tests it directly.`;
    const [text, sanity] = await Promise.all([
      run.step("llm.loadBearing", () => structured({ graph, projectId: pid, schema: LoadBearingSchema, system: SYSTEM, prompt: `${material}\n\nPropose the cheapest direct test of this assumption alone.`, label: "analyst:load-bearing" }), { source: "llm" }),
      run.step("llm.loadBearing.sanity", () => structured({ graph, projectId: pid, schema: SanitySchema, system: SANITY_SYSTEM, prompt: `Candidate load-bearing assumption.\n\n${material}\n\nDo the listed claims genuinely depend on this assumption, and is it genuinely untested in this material?`, label: "analyst:load-bearing:sanity" }), { source: "llm" }),
    ]);
    await write(
      "load_bearing",
      a.id.split(":").slice(-1)[0],
      text.object.summary,
      { cheapestTest: text.object.cheapestTest, ifFalse: text.object.ifFalse, dependents: a.dependents, stated: a.stated, assumption: a.text },
      { nodeIds: [a.id, ...a.claimIds.slice(0, 20)], paperIds: [] },
      a.dependents,
      sanity.object.sane,
      sanity.object.reason ?? "",
      Math.min(1, a.dependents / 8),
    );
    result.loadBearing++;
    lb++;
  }

  log(`holes ${result.holes}, conflicts ${result.conflicts}, load-bearing ${result.loadBearing}, failed sanity ${result.insane}`);
  await run.finish("ANSWERED", [result], project.createdBy);
  return result;
}
