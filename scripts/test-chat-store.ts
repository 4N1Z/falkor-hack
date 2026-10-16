/**
 * Round-trip test for the workspace chat: Postgres store + FalkorDB mirror.
 *
 *   node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/test-chat-store.ts <workspaceId> <userId>
 *
 * Creates (and removes) a test exchange in the default thread. Leaves the default thread in place.
 */
import { randomUUID } from "crypto";
import { eq, inArray } from "drizzle-orm";
import db from "../src/db";
import { chatMessages } from "../src/db/schema";
import { mirrorExchange, questionsAboutPaper, similarQuestions } from "../src/lib/chat/mirror";
import { getOrCreateDefaultThread, historyForModel, insertAssistantMessage, insertUserMessage, listMessages } from "../src/lib/chat/store";
import { getWorkspaceGraph } from "../src/lib/graph/client";

const ok = (cond: unknown, label: string) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${label}`);
  if (!cond) process.exitCode = 1;
};

async function main() {
  const [workspaceId, userId] = process.argv.slice(2);
  if (!workspaceId || !userId) throw new Error("Usage: test-chat-store.ts <workspaceId> <userId>");

  const t1 = await getOrCreateDefaultThread(workspaceId, userId);
  const t2 = await getOrCreateDefaultThread(workspaceId, userId);
  ok(t1.id === t2.id && t1.isDefault, `default thread is idempotent (${t1.id})`);

  const graph = await getWorkspaceGraph(workspaceId);
  const [paper] = (await graph.roQuery<{ paperId: string; title: string }>("MATCH (p:Paper {inLibrary: true}) RETURN p.paperId AS paperId, p.title AS title LIMIT 1")).data ?? [];
  const [run] = (await graph.roQuery<{ id: string }>("MATCH (r:AgentRun) RETURN r.id AS id ORDER BY r.at DESC LIMIT 1")).data ?? [];
  ok(paper && run, `graph has a library paper (${paper?.title?.slice(0, 40)}) and an AgentRun (${run?.id?.slice(0, 8)})`);

  const qId = `test-q-${randomUUID().slice(0, 8)}`;
  const aId = `test-a-${randomUUID().slice(0, 8)}`;
  const question = "Which of our papers compare dense passage retrieval with BM25 on open-domain QA?";
  await insertUserMessage({ id: qId, threadId: t1.id, workspaceId, userId, content: question });
  const before = await listMessages({ threadId: t1.id });
  const qRow = before.find((m) => m.id === qId);
  ok(qRow?.author?.name, `user row persisted with author "${qRow?.author?.name}" (seq ${qRow?.seq})`);

  const toolInvocations = [
    {
      state: "result",
      toolCallId: "call_test",
      toolName: "getResearchPaper",
      args: { keyword: "dense passage retrieval" },
      result: { status: "SUCCESS", papers: [{ paperId: paper.paperId, title: paper.title, authors: [{ name: "Test Author" }], year: 2020, source: "team", owners: ["Aniz"] }] },
    },
  ];
  await insertAssistantMessage({
    id: aId,
    threadId: t1.id,
    workspaceId,
    content: "**Team library**: Two papers compare them: " + paper.title,
    toolInvocations,
    parts: [{ type: "text", text: "…" }],
    route: "team_library",
    confidence: 0.98,
    runId: run.id,
  });

  const newer = await listMessages({ threadId: t1.id, afterSeq: qRow!.seq });
  ok(newer.length === 1 && newer[0].id === aId, `afterSeq returns only the assistant row (${newer.length})`);
  const inv = newer[0].toolInvocations as typeof toolInvocations | undefined;
  ok(inv?.[0]?.result?.papers?.[0]?.paperId === paper.paperId, "tool invocations round-trip with the paper intact");
  ok(newer[0].annotations?.[0]?.route === "team_library" && newer[0].annotations?.[0]?.runId === run.id, "annotations carry route and runId");

  const history = await historyForModel(t1.id, { maxMessages: 4 });
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  ok(typeof lastUser?.content === "string" && /^\[\w+\] /.test(lastUser.content as string), `history prefixes the asker: "${String(lastUser?.content).slice(0, 40)}"`);
  ok(history.every((m) => typeof m.content === "string"), "history is text only (no tool parts)");

  await mirrorExchange({
    workspaceId,
    threadId: t1.id,
    question: { id: qId, text: question, userId, userName: qRow?.author?.name ?? null, fileId: null },
    answer: { id: aId, text: "Two papers compare them.", route: "team_library", runId: run.id },
    paperIds: [paper.paperId],
  });
  const idx = (await graph.roQuery<{ label: string; options: Record<string, { dimension?: number }> }>("CALL db.indexes() YIELD label, options RETURN label, options")).data ?? [];
  const chatIdx = idx.find((r) => r.label === "ChatMessage");
  ok(chatIdx?.options?.embedding?.dimension === 1024, "ChatMessage vector index exists at 1024-d");
  const similar = await similarQuestions(workspaceId, { text: "papers comparing dense passage retrieval and BM25", limit: 3, maxDistance: 0.5 });
  ok(similar.some((s) => s.id === qId), `similar question found by paraphrase (distance ${similar.find((s) => s.id === qId)?.score?.toFixed(3) ?? "n/a"})`);
  const about = await questionsAboutPaper(workspaceId, paper.paperId);
  ok(about.some((q) => q.id === qId), "question listed under the paper it mentioned");
  const [linked] = (await graph.roQuery<{ n: number }>("MATCH (:ChatMessage {id: $aId})-[:FROM_RUN]->(r:AgentRun) RETURN count(r) AS n", { params: { aId } as never })).data ?? [];
  ok(linked?.n === 1, "answer linked to the AgentRun");

  // Clean up
  await db.delete(chatMessages).where(inArray(chatMessages.id, [qId, aId]));
  await graph.query("MATCH (m:ChatMessage) WHERE m.id IN $ids DETACH DELETE m", { params: { ids: [qId, aId] } as never });
  const after = await listMessages({ threadId: t1.id });
  ok(!after.some((m) => m.id === qId || m.id === aId), "test rows removed");
  void eq;
  process.exit(process.exitCode ?? 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
