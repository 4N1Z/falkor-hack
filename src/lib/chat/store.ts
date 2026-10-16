// Postgres is the record for workspace chat threads and messages. Server-only.
// The graph mirror (src/lib/chat/mirror.ts) is written after these rows exist.

import type { CoreMessage, Message } from "ai";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import db from "@/db";
import { chatMessages, chatThreads, users } from "@/db/schema";
import { isRoute } from "./route-names";
import type { ChatAuthor, ChatMessageDTO, ChatThreadDTO } from "./types";

const now = () => new Date().toISOString();

const toThreadDTO = (t: typeof chatThreads.$inferSelect): ChatThreadDTO => ({
  id: t.id,
  workspaceId: t.workspaceId,
  title: t.title,
  isDefault: t.isDefault,
  createdAt: t.createdAt,
  lastMessageAt: t.lastMessageAt,
});

/** The workspace's "Team chat", created on first use. Safe under concurrent callers (partial unique index). */
export async function getOrCreateDefaultThread(workspaceId: string, userId: string | null): Promise<ChatThreadDTO> {
  await db.insert(chatThreads).values({ workspaceId, isDefault: true, title: "Team chat", createdBy: userId }).onConflictDoNothing();
  const [t] = await db
    .select()
    .from(chatThreads)
    .where(and(eq(chatThreads.workspaceId, workspaceId), eq(chatThreads.isDefault, true)))
    .limit(1);
  return toThreadDTO(t);
}

export async function listThreads(workspaceId: string): Promise<ChatThreadDTO[]> {
  const rows = await db
    .select()
    .from(chatThreads)
    .where(eq(chatThreads.workspaceId, workspaceId))
    .orderBy(desc(chatThreads.lastMessageAt), asc(chatThreads.createdAt));
  return rows.map(toThreadDTO);
}

export async function getThread(threadId: string): Promise<ChatThreadDTO | null> {
  const [t] = await db.select().from(chatThreads).where(eq(chatThreads.id, threadId)).limit(1);
  return t ? toThreadDTO(t) : null;
}

export async function createThread(workspaceId: string, userId: string, title: string): Promise<ChatThreadDTO> {
  const [t] = await db.insert(chatThreads).values({ workspaceId, title: title.slice(0, 120), createdBy: userId }).returning();
  return toThreadDTO(t);
}

export async function renameThread(threadId: string, title: string) {
  await db.update(chatThreads).set({ title: title.slice(0, 120) }).where(eq(chatThreads.id, threadId));
}

type Row = typeof chatMessages.$inferSelect;

function toDTO(m: Row, author: ChatAuthor | null): ChatMessageDTO {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    parts: (m.parts as Message["parts"]) ?? undefined,
    toolInvocations: (m.toolInvocations as Message["toolInvocations"]) ?? undefined,
    createdAt: new Date(m.createdAt),
    seq: m.seq,
    author: m.userId ? author : null,
    fileId: m.fileId,
    annotations: m.role === "assistant" ? [{ route: isRoute(m.route) ? m.route : "general", runId: m.runId, confidence: m.confidence }] : undefined,
  };
}

/** Messages in a thread, oldest first. Without `afterSeq` the newest `limit`; with it, only newer rows. */
export async function listMessages(opts: { threadId: string; afterSeq?: number; limit?: number }): Promise<ChatMessageDTO[]> {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const where = opts.afterSeq ? and(eq(chatMessages.threadId, opts.threadId), gt(chatMessages.seq, opts.afterSeq)) : eq(chatMessages.threadId, opts.threadId);
  const rows = await db
    .select({ m: chatMessages, author: { id: users.id, name: users.name, image: users.image } })
    .from(chatMessages)
    .leftJoin(users, eq(users.id, chatMessages.userId))
    .where(where)
    .orderBy(opts.afterSeq ? asc(chatMessages.seq) : desc(chatMessages.seq))
    .limit(limit);
  const ordered = opts.afterSeq ? rows : rows.reverse();
  return ordered.map((r) => toDTO(r.m, r.author?.id ? r.author : null));
}

async function touchThread(threadId: string) {
  await db.update(chatThreads).set({ lastMessageAt: now() }).where(eq(chatThreads.id, threadId));
}

export async function insertUserMessage(input: {
  id: string;
  threadId: string;
  workspaceId: string;
  userId: string;
  fileId?: string | null;
  content: string;
}) {
  // Replays of the same client id (retry after a dropped stream) must not duplicate the question
  await db
    .insert(chatMessages)
    .values({ id: input.id, threadId: input.threadId, workspaceId: input.workspaceId, role: "user", content: input.content, userId: input.userId, fileId: input.fileId ?? null })
    .onConflictDoNothing();
  await touchThread(input.threadId);
}

export async function insertAssistantMessage(input: {
  id: string;
  threadId: string;
  workspaceId: string;
  content: string;
  parts?: unknown;
  toolInvocations?: unknown;
  fileId?: string | null;
  route: string;
  confidence: number | null;
  runId: string | null;
}) {
  await db
    .insert(chatMessages)
    .values({
      id: input.id,
      threadId: input.threadId,
      workspaceId: input.workspaceId,
      role: "assistant",
      content: input.content,
      parts: input.parts ?? null,
      toolInvocations: input.toolInvocations ?? null,
      fileId: input.fileId ?? null,
      route: input.route,
      confidence: input.confidence,
      runId: input.runId,
    })
    .onConflictDoNothing();
  await touchThread(input.threadId);
}

/**
 * The thread as the model should see it: text only (never stored tool calls, which the provider
 * would reject as orphaned), user turns prefixed with the asker's first name so "what did Bea
 * ask" is answerable, oldest turns dropped to stay inside the budget.
 */
export async function historyForModel(threadId: string, opts: { maxMessages?: number; maxChars?: number } = {}): Promise<CoreMessage[]> {
  const maxMessages = opts.maxMessages ?? 40;
  const maxChars = opts.maxChars ?? 24_000;
  const rows = await db
    .select({ role: chatMessages.role, content: chatMessages.content, name: users.name })
    .from(chatMessages)
    .leftJoin(users, eq(users.id, chatMessages.userId))
    .where(eq(chatMessages.threadId, threadId))
    .orderBy(desc(chatMessages.seq))
    .limit(maxMessages);
  const out: CoreMessage[] = [];
  let chars = 0;
  for (const r of rows) {
    // newest first; stop when the budget is spent
    const text = r.content.trim();
    if (!text) continue;
    const first = r.name?.trim().split(/\s+/)[0];
    const content = r.role === "user" && first ? `[${first}] ${text}` : text;
    if (chars + content.length > maxChars && out.length) break;
    chars += content.length;
    out.push({ role: r.role, content });
  }
  return out.reverse();
}
