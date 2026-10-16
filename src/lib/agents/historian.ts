// Historian — one job: remember what the team believed, found and asked, and when.
// Notes become (Memory {kind, status, validFrom, validTo}) nodes linked to the papers they're
// about. Dropping a hypothesis stamps validTo (+ the paper that killed it), so other agents can
// warn before suggesting a dead end again: "your team dropped this on Oct 3 because of X".

import { randomUUID } from "crypto";
import { getWorkspaceGraph } from "../graph/client";
import { embedText } from "../graph/embeddings";
import {
  CREATE_MEMORY,
  LINK_DROPPED_BECAUSE,
  MEMORY_TIMELINE,
  SET_MEMORY_STATUS,
  SIMILAR_MEMORIES,
} from "../graph/queries";
import { searchTeamLibrary } from "../graph/team-search";
import { classify } from "../jev";
import { startRun } from "./base";

export type MemoryKind = "hypothesis" | "finding" | "question";
export type MemoryStatus = "active" | "dropped" | "confirmed";

export interface MemoryItem {
  id: string;
  kind: MemoryKind;
  text: string;
  status: MemoryStatus;
  validFrom: number;
  validTo: number | null;
  reason: string | null;
  byName: string;
  about: string[];
  droppedBecause: string[];
}

export interface SimilarMemory {
  id: string;
  kind: MemoryKind;
  text: string;
  status: MemoryStatus;
  validFrom: number;
  validTo: number | null;
  reason: string | null;
  byName: string;
  /** cosine distance (lower = closer) */
  score: number;
}

/** Below this distance two statements are about the same idea (text-embedding-3-small). */
export const SAME_IDEA_DISTANCE = 0.32;

export async function remember(input: {
  workspaceId: string;
  userId: string;
  userName: string | null;
  text: string;
  kind?: MemoryKind;
  fileId?: string;
}) {
  const run = await startRun("historian", input.workspaceId, { action: "remember", text: input.text.slice(0, 300) });
  const text = input.text.trim().slice(0, 1000);

  // What kind of note is it? (JEV choice, unless the user said)
  let kind = input.kind;
  let classifiedBy: "user" | "jev" | "fallback" = "user";
  if (!kind) {
    const c = await run.step("jev.classify", () =>
      classify(text, "What kind of research note is this?", {
        hypothesis: "A claim or idea the team believes and intends to test or rely on",
        finding: "A result the team has observed or established",
        question: "An open question the team wants answered",
      }),
    );
    kind = c.result.label;
    classifiedBy = c.source;
  }

  const v = await embedText(text);
  // Link to the team papers it's most about (top 3 by meaning)
  const about = await run.step("graph.searchTeamLibrary", () =>
    searchTeamLibrary(input.workspaceId, text, { limit: 3, vector: v }),
  );
  const id = randomUUID();
  await run.step("graph.createMemory", () =>
    run.graph.query(CREATE_MEMORY, {
      params: {
        id,
        kind,
        text,
        status: "active",
        at: Date.now(),
        fileId: input.fileId ?? null,
        userId: input.userId,
        userName: input.userName,
        classifiedBy,
        v,
        aboutIds: about.map((a) => a.paperId),
      } as never,
    }).then((r) => r.data ?? []),
  );
  await run.finish("ANSWERED", [{ id }], input.userId);
  return { id, kind, classifiedBy, about: about.map((a) => a.title) };
}

export async function timeline(workspaceId: string, limit = 100): Promise<MemoryItem[]> {
  const graph = await getWorkspaceGraph(workspaceId);
  return ((await graph.roQuery<MemoryItem>(MEMORY_TIMELINE, { params: { limit } as never })).data ?? []) as MemoryItem[];
}

export async function setMemoryStatus(input: {
  workspaceId: string;
  id: string;
  status: MemoryStatus;
  reason?: string | null;
  becausePaperId?: string | null;
  userName: string | null;
}) {
  const graph = await getWorkspaceGraph(input.workspaceId);
  await graph.query(SET_MEMORY_STATUS, {
    params: { id: input.id, status: input.status, reason: input.reason ?? null, userName: input.userName, at: Date.now() } as never,
  });
  if (input.status === "dropped" && input.becausePaperId) {
    await graph.query(LINK_DROPPED_BECAUSE, { params: { id: input.id, paperId: input.becausePaperId } as never });
  }
}

/** Memories similar to `text` — e.g. dropped hypotheses to warn about. */
export async function recall(input: {
  workspaceId: string;
  text?: string;
  vector?: number[];
  kind?: MemoryKind | null;
  status?: MemoryStatus | null;
  limit?: number;
  maxDistance?: number;
}): Promise<SimilarMemory[]> {
  const graph = await getWorkspaceGraph(input.workspaceId);
  const v = input.vector ?? (await embedText(input.text ?? ""));
  const rows =
    (await graph
      .roQuery<SimilarMemory>(SIMILAR_MEMORIES, {
        params: { v, k: 50, limit: input.limit ?? 5, kind: input.kind ?? null, status: input.status ?? null } as never,
      })
      .catch(() => ({ data: [] as SimilarMemory[] }))).data ?? [];
  return rows.filter((r) => r.score <= (input.maxDistance ?? 1));
}
