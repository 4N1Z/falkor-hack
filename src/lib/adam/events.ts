// Project event log: what the orchestrator and agents did, in the graph, newest first.
// The status bar and the Activity tab read it; the orchestrator writes "phase advanced",
// "gate pending", "coverage gap", "budget spent" and the like.

import { randomUUID } from "crypto";
import type { Graph } from "falkordb";
import { EMIT_EVENT, RECENT_EVENTS } from "./queries";
import { parseJson, type AdamEvent } from "./types";

export async function emit(graph: Graph, projectId: string, kind: string, payload: Record<string, unknown> = {}) {
  await graph
    .query(EMIT_EVENT, {
      params: { id: randomUUID(), projectId, kind, payload: JSON.stringify(payload).slice(0, 4000), at: Date.now() } as never,
    })
    .catch((err) => console.error(`[adam] could not record event ${kind}`, err));
}

export async function recentEvents(graph: Graph, projectId: string, limit = 50): Promise<AdamEvent[]> {
  const rows = (await graph.roQuery<Omit<AdamEvent, "payload"> & { payload: string }>(RECENT_EVENTS, { params: { projectId, limit } as never })).data ?? [];
  return rows.map((r) => ({ ...r, payload: parseJson(r.payload, {}) }));
}
