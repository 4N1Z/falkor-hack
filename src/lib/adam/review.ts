// The human in the loop (spec: "Human in the loop"). Agents never ask a person to review
// everything: the Verifier does the first pass, and people see what it flagged (conflicts,
// low confidence, load-bearing items, anything unsourced) with the quoted passage beside the
// output and one-click decisions. A person's decision outranks every agent write.

import type { Graph } from "falkordb";
import { embedTexts } from "../graph/embeddings";
import { emit } from "./events";
import * as jobs from "./jobs";
import { PRIORITY } from "./orchestrator";
import { nameKey } from "./resolve";
import { DECIDE_NODE, DECIDE_NODE_EDGES, METHOD_MENTIONS, NODE_DETAIL, NODE_EDGES, QUEUE_ITEMS, RETRACT_CONFLICT_PARTNER, SET_NODE_EMBEDDING, UNMERGE_METHOD } from "./queries-review";

export type QueueKind = "conflict" | "unsourced" | "low_confidence" | "load_bearing";

export interface QueueItem {
  label: string;
  id: string;
  text: string;
  state: string;
  reason: string;
  confidence: number;
  loadBearing: boolean;
  dependents: number;
  quote: string;
  chunkId: string | null;
  page: number;
  section: string;
  slot: string;
  conflictWith: string | null;
  agreedText: string | null;
  aliases: string[];
  mergedFrom: number;
  speculative: boolean;
  locator: string | null;
  createdAt: number;
  paperId: string | null;
  paperTitle: string;
  year: number | null;
  chunkText: string;
  chunkSection: string;
  chunkPage: number;
  kind: QueueKind;
  /** For conflicts: the other reading of the same passage */
  partner?: { id: string; text: string; state: string; slot: string } | null;
}

export const kindOf = (it: { state: string; reason: string; loadBearing: boolean }): QueueKind =>
  it.reason === "quote_not_found" ? "unsourced" : it.state === "conflict" ? "conflict" : it.state === "low_confidence" ? "low_confidence" : "load_bearing";

const KIND_ORDER: QueueKind[] = ["conflict", "unsourced", "load_bearing", "low_confidence"];
const params = <T>(p: T) => ({ params: p as never });

export async function queueItems(graph: Graph, projectId: string): Promise<QueueItem[]> {
  const rows = (await graph.roQuery<Omit<QueueItem, "kind" | "partner">>(QUEUE_ITEMS, params({ projectId }))).data ?? [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const items: QueueItem[] = rows.map((r) => {
    const partner = r.conflictWith ? byId.get(r.conflictWith) : null;
    return { ...r, kind: kindOf(r), partner: partner ? { id: partner.id, text: partner.text, state: partner.state, slot: partner.slot } : null };
  });
  // One card per conflict pair: show slot a's item, carrying slot b as the partner
  const seen = new Set<string>();
  const out: QueueItem[] = [];
  for (const it of items.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.dependents - a.dependents || a.createdAt - b.createdAt)) {
    if (seen.has(it.id)) continue;
    if (it.kind === "conflict" && it.partner) seen.add(it.partner.id);
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

export type Decision = "approve" | "correct" | "reject" | "send_back";

export async function decide(
  graph: Graph,
  input: { projectId: string; workspaceId: string; nodeId: string; decision: Decision; text?: string; note?: string; userId: string; pass: number },
) {
  const at = Date.now();
  const detail = (await graph.roQuery<{ label: string; conflictWith: string | null; paperId: string | null }>(NODE_DETAIL, params({ id: input.nodeId, projectId: input.projectId }))).data?.[0];
  if (!detail) throw new Error("node not found");

  if (input.decision === "send_back") {
    if (!detail.paperId) throw new Error("this node has no paper to send back to");
    await graph.query(DECIDE_NODE, params({ id: input.nodeId, projectId: input.projectId, state: "retracted", reason: "sent_back", userId: input.userId, at, text: null, note: input.note ?? null }));
    const job = await jobs.enqueue(graph, {
      projectId: input.projectId,
      kind: "extract_paper",
      subject: detail.paperId,
      payload: { paperId: detail.paperId, slot: "a", note: input.note ?? "" },
      priority: PRIORITY.extract_paper,
      dedupeKey: `extract_paper:${input.projectId}:${detail.paperId}:a:sendback-${at}`,
      maxAttempts: 2,
    });
    await jobs.enqueue(graph, {
      projectId: input.projectId,
      kind: "verify_card",
      subject: detail.paperId,
      payload: { paperId: detail.paperId },
      priority: PRIORITY.verify_card,
      dedupeKey: `verify_card:${input.projectId}:${detail.paperId}:sendback-${at}`,
      runAfter: at + 60_000,
      maxAttempts: 2,
    });
    await emit(graph, input.projectId, "queue_sent_back", { nodeId: input.nodeId, paperId: detail.paperId, note: input.note ?? "", by: input.userId, jobId: job.id });
    return { state: "retracted", requeued: true };
  }

  const state = input.decision === "reject" ? "retracted" : "human_approved";
  const reason = input.decision === "reject" ? "rejected" : input.decision === "correct" ? "corrected" : null;
  const text = input.decision === "correct" ? (input.text ?? "").trim() : null;
  if (input.decision === "correct" && !text) throw new Error("a correction needs text");
  await graph.query(DECIDE_NODE, params({ id: input.nodeId, projectId: input.projectId, state, reason, userId: input.userId, at, text, note: input.note ?? null }));
  if (text && ["Claim", "Method", "Assumption", "Procedure", "Result"].includes(detail.label)) {
    const [embedding] = await embedTexts([text], "document");
    await graph.query(SET_NODE_EMBEDDING, params({ id: input.nodeId, projectId: input.projectId, embedding }));
  }
  await graph.query(DECIDE_NODE_EDGES, params({ id: input.nodeId, projectId: input.projectId, status: state === "retracted" ? "rejected" : "accepted", userId: input.userId, at }));
  // Picking one reading of a disputed passage settles the dispute
  if (detail.conflictWith && state === "human_approved") {
    await graph.query(RETRACT_CONFLICT_PARTNER, params({ id: detail.conflictWith, projectId: input.projectId, userId: input.userId, at, keepId: input.nodeId }));
  }
  await emit(graph, input.projectId, "queue_decided", { nodeId: input.nodeId, label: detail.label, decision: input.decision, by: input.userId });
  return { state, requeued: false };
}

export async function unmergeMethod(graph: Graph, input: { projectId: string; methodId: string; alias: string; userId: string }) {
  const [embedding] = await embedTexts([input.alias], "document");
  const newId = `method:${input.projectId.slice(0, 8)}:${nameKey(input.alias).replace(/\s+/g, "-").slice(0, 60)}:${Math.random().toString(36).slice(2, 6)}`;
  const res = await graph.query<{ id: string }>(
    UNMERGE_METHOD,
    params({ id: input.methodId, projectId: input.projectId, alias: input.alias, newId, nameKey: nameKey(input.alias), at: Date.now(), userId: input.userId, embedding }),
  );
  await emit(graph, input.projectId, "entity_unmerged", { methodId: input.methodId, alias: input.alias, newId, by: input.userId });
  return res.data?.[0]?.id ?? newId;
}

export async function nodeDetail(graph: Graph, projectId: string, id: string) {
  const [node, edges] = await Promise.all([
    graph.roQuery<Record<string, unknown> & { label: string }>(NODE_DETAIL, params({ id, projectId })).then((r) => r.data?.[0] ?? null),
    graph.roQuery<{ dir: "in" | "out"; type: string; label: string; otherId: string; otherText: string; status: string; otherState: string }>(NODE_EDGES, params({ id, projectId })).then((r) => r.data ?? []),
  ]);
  if (!node) return null;
  const mentions =
    node.label === "Method"
      ? ((await graph.roQuery<{ paperId: string; paperTitle: string; year: number | null; name: string; quote: string; page: number; state: string; parameters: string[]; chunkText: string }>(METHOD_MENTIONS, params({ id }))).data ?? [])
      : [];
  return { node, edges, mentions };
}
