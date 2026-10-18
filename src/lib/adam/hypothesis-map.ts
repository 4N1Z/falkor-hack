// The hypothesis map: one brief at the centre, and around it the evidence claims with the
// papers they came from, the sub-question (topic) each paper was swept for, the methods and
// assumptions the claims rest on, contradicting claims, the attacks and what they cite, the
// candidate the brief was derived from, and the procedures of its chains and plan. Every node
// carries its verification state and who decided it, so the map also shows the review done.

import { ADAM_QUERY_TIMEOUT_MS } from "./types";
import type { Graph } from "falkordb";
import { CLAIMS_CONTEXT, CLAIMS_PAPERS_CLUSTERS, GET_BRIEF, HYPOTHESIS_ATTACK_NODES, HYPOTHESIS_NEIGHBOURS, HYPOTHESIS_PLAN_STEPS } from "./queries-hypotheses";
import { getQuestionPage } from "./question-page";

export interface MapNode {
  id: string;
  label: "Hypothesis" | "Claim" | "Paper" | "Topic" | "Method" | "Assumption" | "Procedure" | "Result" | "Attack" | "Candidate" | "Plan" | string;
  text: string;
  state: string;
  stateReason?: string;
  decidedBy: string | null;
  /** Claim role relative to the hypothesis */
  role?: "for" | "against" | "contradicts";
  /** Attack status / plan approval */
  status?: string;
  kind?: string;
  paperId?: string | null;
}

export interface MapLink {
  source: string;
  target: string;
  type: string;
}

export interface HypothesisMap {
  hypothesis: { id: string; statement: string; status: string };
  nodes: MapNode[];
  links: MapLink[];
  reviews: { approved: number; rejected: number; corrected: number; verified: number; unchecked: number };
}

const params = <T>(p: T) => ({ params: p as never, TIMEOUT: ADAM_QUERY_TIMEOUT_MS });

export async function hypothesisMap(graph: Graph, projectId: string, hypothesisId: string): Promise<HypothesisMap> {
  const brief = (await graph.roQuery<{ id: string; statement: string; status: string }>(GET_BRIEF, params({ id: hypothesisId }))).data?.[0];
  if (!brief) throw new Error("brief not found");
  const nodes = new Map<string, MapNode>();
  const links: MapLink[] = [];
  const add = (n: MapNode) => {
    if (!nodes.has(n.id)) nodes.set(n.id, n);
  };
  const link = (source: string, target: string, type: string) => {
    if (!links.some((l) => l.source === source && l.target === target && l.type === type)) links.push({ source, target, type });
  };
  add({ id: brief.id, label: "Hypothesis", text: brief.statement, state: "", decidedBy: null, status: brief.status });

  // 1. One hop from the brief
  const neighbours = (await graph.roQuery<{ type: string; label: string; id: string; text: string; state: string; stateReason: string; paperId: string | null; decidedBy: string | null; kind: string }>(HYPOTHESIS_NEIGHBOURS, params({ id: hypothesisId }))).data ?? [];
  const claimIds: string[] = [];
  for (const n of neighbours) {
    const role = n.type === "EVIDENCE_FOR" ? "for" : n.type === "EVIDENCE_AGAINST" ? "against" : undefined;
    add({ id: n.id, label: n.label, text: n.text, state: n.state, stateReason: n.stateReason, decidedBy: n.decidedBy, role, kind: n.kind, paperId: n.paperId });
    link(brief.id, n.id, n.type);
    if (n.label === "Claim") claimIds.push(n.id);
  }

  // 2. The claims' papers and topics, and what the claims use, depend on and contradict
  if (claimIds.length) {
    const page = await getQuestionPage(graph, projectId);
    const topicLabel = new Map(page?.subquestions.map((q, i) => [q.id, `Q${i + 1} · ${q.text}`]) ?? []);
    const papers = (await graph.roQuery<{ claimId: string; paperId: string; title: string; year: number; clusterId: string; triage: string }>(CLAIMS_PAPERS_CLUSTERS, params({ ids: claimIds, projectId }))).data ?? [];
    for (const p of papers) {
      add({ id: p.paperId, label: "Paper", text: `${p.title}${p.year ? ` (${p.year})` : ""}`, state: p.triage, decidedBy: null, paperId: p.paperId });
      link(p.claimId, p.paperId, "EXTRACTED_FROM");
      if (p.clusterId) {
        const tid = `topic:${p.clusterId}`;
        add({ id: tid, label: "Topic", text: topicLabel.get(p.clusterId) ?? p.clusterId, state: "", decidedBy: null });
        link(p.paperId, tid, "ABOUT");
      }
    }
    const ctx = (await graph.roQuery<{ source: string; type: string; label: string; id: string; text: string; state: string; stateReason: string; decidedBy: string | null; paperId: string | null }>(CLAIMS_CONTEXT, params({ ids: claimIds }))).data ?? [];
    for (const c of ctx) {
      add({ id: c.id, label: c.label, text: c.text, state: c.state, stateReason: c.stateReason, decidedBy: c.decidedBy, paperId: c.paperId, role: c.type === "CONTRADICTS" ? "contradicts" : undefined });
      link(c.source, c.id, c.type);
    }
  }

  // 3. Attacks and what they cite
  const attacks = (await graph.roQuery<{ id: string; kind: string; status: string; text: string; round: number; cites: string[] }>(HYPOTHESIS_ATTACK_NODES, params({ id: hypothesisId }))).data ?? [];
  for (const a of attacks) {
    add({ id: a.id, label: "Attack", text: a.text, state: "", decidedBy: null, status: a.status, kind: a.kind });
    link(a.id, brief.id, "ON");
    for (const c of a.cites) if (nodes.has(c)) link(a.id, c, "CITES");
  }

  // 4. The plan's procedures
  const steps = (await graph.roQuery<{ planId: string; approvedAt: number; procedureId: string | null; name: string; ord: number; status: string; gap: boolean }>(HYPOTHESIS_PLAN_STEPS, params({ id: hypothesisId }))).data ?? [];
  for (const s of steps) {
    add({ id: s.planId, label: "Plan", text: "Experiment plan", state: "", decidedBy: null, status: s.approvedAt ? "approved" : "draft" });
    link(s.planId, brief.id, "TESTS");
    if (s.procedureId) {
      add({ id: s.procedureId, label: "Procedure", text: `${s.ord}. ${s.name}`, state: s.status, decidedBy: null, status: s.gap ? "gap" : s.status });
      link(s.planId, s.procedureId, "STEP");
    }
  }

  // 5. The review done on what the map shows
  const reviews = { approved: 0, rejected: 0, corrected: 0, verified: 0, unchecked: 0 };
  for (const n of nodes.values()) {
    if (!["Claim", "Method", "Assumption", "Procedure", "Result"].includes(n.label)) continue;
    if (n.state === "human_approved" && n.stateReason === "corrected") reviews.corrected++;
    else if (n.state === "human_approved") reviews.approved++;
    else if (n.state === "retracted") reviews.rejected++;
    else if (n.state === "agent_verified") reviews.verified++;
    else reviews.unchecked++;
  }
  return { hypothesis: brief, nodes: [...nodes.values()], links, reviews };
}
