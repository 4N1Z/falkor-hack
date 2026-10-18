// The human in the loop (spec: "Human in the loop"). Agents never ask a person to review
// everything: the Verifier does the first pass, and people see what it flagged (conflicts,
// low confidence, load-bearing items, anything unsourced) with the quoted passage beside the
// output and one-click decisions. A person's decision outranks every agent write.

import { ADAM_QUERY_TIMEOUT_MS } from "./types";
import type { Graph } from "falkordb";
import { embedTexts } from "../graph/embeddings";
import { emit } from "./events";
import * as jobs from "./jobs";
import { PRIORITY } from "./orchestrator";
import { nameKey } from "./resolve";
import {
  APPLY_SUGGESTIONS,
  DECIDE_NODE,
  DECIDE_NODE_EDGES,
  DECIDE_NODES_BATCH,
  METHOD_MENTIONS,
  NODE_DETAIL,
  NODE_EDGES,
  PAPER_ABSTRACTS,
  QUEUE_ITEMS,
  QUEUE_PASSAGES,
  RETRACT_CONFLICT_PARTNER,
  SET_NODE_EMBEDDING,
  UNMERGE_METHOD,
} from "./queries-review";

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
  /** Auto-review's proposal, if it has run: approve / reject, or null when it was unsure */
  autoSuggestion: "approve" | "reject" | null;
  autoConfidence: number;
  autoReason: string;
}

export type Suggestion = "approve" | "reject" | "none";

export const kindOf = (it: { state: string; reason: string; loadBearing: boolean }): QueueKind =>
  it.reason === "quote_not_found" ? "unsourced" : it.state === "conflict" ? "conflict" : it.state === "low_confidence" ? "low_confidence" : "load_bearing";

const KIND_ORDER: QueueKind[] = ["conflict", "unsourced", "load_bearing", "low_confidence"];
const params = <T>(p: T) => ({ params: p as never, TIMEOUT: ADAM_QUERY_TIMEOUT_MS });

type QueueRow = Omit<QueueItem, "kind" | "partner" | "chunkText" | "chunkSection" | "chunkPage">;

/** All open items, deduplicated per conflict pair, sorted worst-first; no passage text. */
async function openItems(graph: Graph, projectId: string): Promise<Omit<QueueItem, "chunkText" | "chunkSection" | "chunkPage">[]> {
  const rows = (await graph.roQuery<QueueRow>(QUEUE_ITEMS, params({ projectId }))).data ?? [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const items = rows.map((r) => {
    const partner = r.conflictWith ? byId.get(r.conflictWith) : null;
    return { ...r, kind: kindOf(r), partner: partner ? { id: partner.id, text: partner.text, state: partner.state, slot: partner.slot } : null };
  });
  const seen = new Set<string>();
  const out: typeof items = [];
  for (const it of items.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.dependents - a.dependents || a.createdAt - b.createdAt)) {
    if (seen.has(it.id)) continue;
    if (it.kind === "conflict" && it.partner) seen.add(it.partner.id);
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

/** Attach the quoted passage (or the paper's abstract) to a page of items. */
async function withPassages<T extends { chunkId: string | null; paperId: string | null }>(graph: Graph, items: T[]): Promise<(T & { chunkText: string; chunkSection: string; chunkPage: number })[]> {
  const chunkIds = [...new Set(items.map((i) => i.chunkId).filter((x): x is string => !!x))];
  // Abstract-only papers were read from a virtual passage that is not a stored chunk: fall back to the abstract
  const paperIds = [...new Set(items.filter((i) => i.paperId).map((i) => i.paperId!))];
  const [chunks, abstracts] = await Promise.all([
    chunkIds.length ? graph.roQuery<{ id: string; text: string; section: string; page: number }>(QUEUE_PASSAGES, params({ ids: chunkIds })).then((r) => r.data ?? []) : Promise.resolve([]),
    paperIds.length ? graph.roQuery<{ id: string; abstract: string }>(PAPER_ABSTRACTS, params({ ids: paperIds })).then((r) => r.data ?? []) : Promise.resolve([]),
  ]);
  const chunkOf = new Map(chunks.map((c) => [c.id, c]));
  const abstractOf = new Map(abstracts.map((a) => [a.id, a.abstract]));
  return items.map((i) => {
    const ch = i.chunkId ? chunkOf.get(i.chunkId) : undefined;
    return { ...i, chunkText: ch?.text ?? (i.paperId ? abstractOf.get(i.paperId) ?? "" : ""), chunkSection: ch?.section ?? "", chunkPage: ch?.page ?? 0 };
  });
}

export interface QueuePage {
  items: QueueItem[];
  total: number;
  counts: Partial<Record<QueueKind, number>>;
  papers: { paperId: string; title: string; n: number }[];
  /** Auto-review's open proposals: how many it would approve, reject, or could not call */
  suggestions: { approve: number; reject: number; none: number; reviewed: number };
}

/**
 * One page of the exception queue, filtered and sorted on the server so the client only ever
 * holds what it shows. `suggestion` filters by auto-review's proposal.
 */
export async function queuePage(
  graph: Graph,
  projectId: string,
  opts: { kind?: QueueKind | "all"; paperId?: string | "all"; suggestion?: Suggestion | "all"; offset?: number; limit?: number } = {},
): Promise<QueuePage> {
  const all = await openItems(graph, projectId);
  const counts: Partial<Record<QueueKind, number>> = {};
  const paperCounts = new Map<string, { title: string; n: number }>();
  const suggestions = { approve: 0, reject: 0, none: 0, reviewed: 0 };
  for (const it of all) {
    counts[it.kind] = (counts[it.kind] ?? 0) + 1;
    if (it.paperId) paperCounts.set(it.paperId, { title: it.paperTitle, n: (paperCounts.get(it.paperId)?.n ?? 0) + 1 });
    if (it.autoReason) {
      suggestions.reviewed++;
      if (it.autoSuggestion === "approve") suggestions.approve++;
      else if (it.autoSuggestion === "reject") suggestions.reject++;
      else suggestions.none++;
    }
  }
  const matchesSuggestion = (it: QueueItem) =>
    !opts.suggestion || opts.suggestion === "all" || (opts.suggestion === "none" ? !!it.autoReason && !it.autoSuggestion : it.autoSuggestion === opts.suggestion);
  const filtered = all.filter(
    (it) => (!opts.kind || opts.kind === "all" || it.kind === opts.kind) && (!opts.paperId || opts.paperId === "all" || it.paperId === opts.paperId) && matchesSuggestion(it as QueueItem),
  );
  const offset = Math.max(0, opts.offset ?? 0);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 40));
  const page = await withPassages(graph, filtered.slice(offset, offset + limit));
  return {
    items: page as QueueItem[],
    total: filtered.length,
    counts,
    papers: [...paperCounts.entries()].map(([paperId, v]) => ({ paperId, title: v.title, n: v.n })).sort((a, b) => b.n - a.n),
    suggestions,
  };
}

/** The researcher applies auto-review's proposals of one kind, all at once. They become their decisions. */
export async function applySuggestions(graph: Graph, input: { projectId: string; userId: string; suggestion: "approve" | "reject" }) {
  const at = Date.now();
  const rows =
    (await graph.query<{ n: number }>(
      APPLY_SUGGESTIONS,
      params({
        projectId: input.projectId,
        suggestion: input.suggestion,
        state: input.suggestion === "approve" ? "human_approved" : "retracted",
        reason: input.suggestion === "approve" ? null : "rejected",
        edgeStatus: input.suggestion === "approve" ? "accepted" : "rejected",
        userId: input.userId,
        at,
      }),
    )).data ?? [];
  const n = rows.reduce((s, r) => s + (r.n ?? 0), 0);
  await emit(graph, input.projectId, "suggestions_applied", { suggestion: input.suggestion, n, by: input.userId });
  return n;
}

/** Kept for callers that want everything (the auto-review job). */
export async function queueItems(graph: Graph, projectId: string): Promise<QueueItem[]> {
  return withPassages(graph, await openItems(graph, projectId)) as Promise<QueueItem[]>;
}

/** Bulk approve / reject in one round trip (corrections and send-backs go through `decide`). */
export async function decideMany(graph: Graph, input: { projectId: string; userId: string; rows: { nodeId: string; decision: "approve" | "reject" }[] }) {
  if (!input.rows.length) return 0;
  const at = Date.now();
  const rows = input.rows.map((r) => ({
    id: r.nodeId,
    state: r.decision === "approve" ? "human_approved" : "retracted",
    reason: r.decision === "approve" ? null : "rejected",
    edgeStatus: r.decision === "approve" ? "accepted" : "rejected",
  }));
  let n = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const r = await graph.query<{ n: number }>(DECIDE_NODES_BATCH, params({ projectId: input.projectId, userId: input.userId, at, rows: rows.slice(i, i + 100) }));
    n += r.data?.[0]?.n ?? 0;
  }
  await emit(graph, input.projectId, "queue_decided_batch", { approved: rows.filter((r) => r.state === "human_approved").length, rejected: rows.filter((r) => r.state === "retracted").length, by: input.userId });
  return n;
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
