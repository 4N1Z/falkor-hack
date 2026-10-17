// Mirror of the workspace chat into the FalkorDB graph. Postgres stays the record; this is what
// lets agents recall what the team asked: (User)-[:ASKED]->(ChatMessage q)-[:ANSWERED_BY_MSG]->
// (ChatMessage a)-[:FROM_RUN]->(AgentRun), (a)-[:MENTIONS]->(Paper). Questions carry an embedding.
// Every function here is best effort and never throws into the caller.

import { getWorkspaceGraph } from "../graph/client";
import { embedText } from "../graph/embeddings";
import {
  LINK_CHAT_PAPERS,
  LINK_CHAT_RUN,
  QUESTION_FOR_RUN,
  QUESTIONS_ABOUT_PAPER,
  RECENT_QUESTIONS,
  SIMILAR_QUESTIONS,
  UPSERT_CHAT_EXCHANGE,
} from "../graph/queries";

export interface PastQuestion {
  id: string;
  text: string;
  at: number;
  byName: string;
  route?: string | null;
  answer?: string | null;
  /** Cosine distance when found by similarity */
  score?: number;
}

const params = <T>(p: T) => ({ params: p as never });

export async function mirrorExchange(input: {
  workspaceId: string;
  threadId: string;
  question: { id: string; text: string; userId: string; userName: string | null; fileId: string | null };
  answer: { id: string; text: string; route: string; runId: string | null };
  paperIds: string[];
}) {
  try {
    const graph = await getWorkspaceGraph(input.workspaceId);
    const v = await embedText(input.question.text.slice(0, 2000), "document");
    const at = Date.now();
    await graph.query(
      UPSERT_CHAT_EXCHANGE,
      params({
        qId: input.question.id,
        threadId: input.threadId,
        qText: input.question.text.slice(0, 4000),
        at,
        fileId: input.question.fileId,
        v,
        userId: input.question.userId,
        userName: input.question.userName,
        aId: input.answer.id,
        aText: input.answer.text.slice(0, 8000),
        route: input.answer.route,
      }),
    );
    if (input.answer.runId) await graph.query(LINK_CHAT_RUN, params({ aId: input.answer.id, runId: input.answer.runId }));
    const paperIds = [...new Set(input.paperIds)].slice(0, 20);
    if (paperIds.length) await graph.query(LINK_CHAT_PAPERS, params({ aId: input.answer.id, paperIds }));
  } catch (err) {
    console.error("[graph] chat mirror failed", err instanceof Error ? err.message : err);
  }
}

/** Past team questions closest to `text` (or a ready vector), within `maxDistance`. */
export async function similarQuestions(
  workspaceId: string,
  input: { text?: string; vector?: number[]; limit?: number; maxDistance?: number },
): Promise<PastQuestion[]> {
  try {
    const graph = await getWorkspaceGraph(workspaceId);
    const v = input.vector ?? (await embedText(input.text ?? ""));
    const rows = (await graph.roQuery<PastQuestion>(SIMILAR_QUESTIONS, params({ v, k: 30, limit: input.limit ?? 3 }))).data ?? [];
    // Cohere distances measured on this graph: same question 0.17, paraphrase 0.29, acronym variant 0.49, unrelated 0.84
    return rows.filter((r) => (r.score ?? 1) <= (input.maxDistance ?? 0.5));
  } catch {
    return [];
  }
}

export async function recentQuestions(workspaceId: string, limit = 6): Promise<PastQuestion[]> {
  try {
    const graph = await getWorkspaceGraph(workspaceId);
    return (await graph.roQuery<PastQuestion>(RECENT_QUESTIONS, params({ limit }))).data ?? [];
  } catch {
    return [];
  }
}

export async function questionsAboutPaper(workspaceId: string, paperId: string): Promise<PastQuestion[]> {
  try {
    const graph = await getWorkspaceGraph(workspaceId);
    return (await graph.roQuery<PastQuestion>(QUESTIONS_ABOUT_PAPER, params({ paperId }))).data ?? [];
  } catch {
    return [];
  }
}

/** The chat question behind an agent run, for the provenance view. */
export async function questionForRun(workspaceId: string, runId: string): Promise<{ id: string; text: string; byName: string; papers: string[] } | null> {
  try {
    const graph = await getWorkspaceGraph(workspaceId);
    const [row] = (await graph.roQuery<{ id: string; text: string; byName: string; papers: string[] }>(QUESTION_FOR_RUN, params({ runId }))).data ?? [];
    return row ?? null;
  } catch {
    return null;
  }
}
