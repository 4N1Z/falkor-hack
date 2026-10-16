import { requireWorkspaceMember } from "@/app/api/papers/_access";
import { auth } from "@/auth";
import db from "@/db";
import { checkWorkspaceAccess } from "@/db/actions/authorization-check";
import { files } from "@/db/schema";
import { routeMessage, type RoutedBrief } from "@/lib/agents/router";
import { chatModel } from "@/lib/ai/models";
import { mirrorExchange } from "@/lib/chat/mirror";
import { ROUTE_NAMES } from "@/lib/chat/route-names";
import { getThread, historyForModel, insertAssistantMessage, insertUserMessage } from "@/lib/chat/store";
import { formatEditorContent } from "@/utils/ai/format-editor-content";
import { researchTools, type ChatPaperResult } from "@/utils/ai/tools";
import {
  appendResponseMessages,
  createDataStreamResponse,
  InvalidToolArgumentsError,
  NoSuchToolError,
  streamText,
  ToolExecutionError,
  type CoreMessage,
  type Message,
} from "ai";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const GENERAL_SYSTEM = `You are Neura AI, a research assistant inside a team's writing workspace. Several collaborators share this chat; user turns are prefixed with the asker's first name.

- For any academic or scientific topic, call getResearchPaper before answering. It searches the team's own library (FalkorDB) first, then OpenAlex.
- Results with source "team" are papers a collaborator already has: name whose library they come from and quote the passage when it helps. Results with source "openalex" are not in the library yet; say so.
- Keep explanations short and concrete. Never invent papers, authors or years; only cite what the tool returned.
- For writing help with no research question, answer directly without searching.`;

const errorMessage = (error: unknown) => {
  if (NoSuchToolError.isInstance(error)) return "The model tried to call an unknown tool.";
  if (InvalidToolArgumentsError.isInstance(error)) return "The model called a tool with invalid arguments.";
  if (ToolExecutionError.isInstance(error)) return "An error occurred during tool execution. Please try rephrasing your query.";
  return "An unexpected error occurred. Please try again.";
};

const evidenceSystem = (name: string, brief: string) =>
  `You are Neura AI. The ${name} agent just ran over the team's research graph (FalkorDB) and returned the evidence below. ` +
  `Answer the user's last message using ONLY this evidence. Start with "**${name}**:" then a concise answer in Markdown. ` +
  `Name papers with their citation labels and say whose library they come from. If the evidence is empty, say so plainly. Never invent papers.\n\n` +
  `Evidence:\n${brief || "(none)"}`;

/** The document the question was asked from, trimmed so a long draft can't crowd out the thread. */
async function documentContext(fileId: string, workspaceId: string): Promise<string> {
  const [f] = await db
    .select({ data: files.data, title: files.title })
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.workspaceId, workspaceId)))
    .limit(1);
  if (!f?.data) return "";
  const text = formatEditorContent(f.data).trim();
  if (!text) return "";
  const trimmed = text.length > 12_000 ? `${text.slice(0, 9_000)}\n[…]\n${text.slice(-3_000)}` : text;
  return `\n\nThe user is writing the document "${f.title}". Its current text:\n${trimmed}`;
}

const TurnSchema = z.object({
  threadId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  fileId: z.string().uuid().optional(),
  message: z.object({ id: z.string().min(1).max(64), role: z.literal("user"), content: z.string().min(1).max(8000) }),
});

/** Team papers named by the tool results, for the graph mirror. */
function paperIdsFromTools(toolInvocations: Message["toolInvocations"]): string[] {
  const ids: string[] = [];
  for (const t of toolInvocations ?? []) {
    if (t.state !== "result") continue;
    const r = t.result as ChatPaperResult | undefined;
    for (const p of r?.papers ?? []) if (p.source === "team") ids.push(p.paperId);
  }
  return ids;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.threadId) return threadedTurn(body);
  return legacyTurn(body);
}

/**
 * Workspace chat: one user turn in a shared thread. The question is saved first, the thread's
 * history comes from Postgres (never from the client), the router picks an agent, the answer
 * streams, and on finish the answer is saved and the exchange is mirrored into the graph.
 */
async function threadedTurn(raw: Record<string, unknown>) {
  const parsed = TurnSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "threadId, workspaceId and message are required" }, { status: 400 });
  const { threadId, workspaceId, fileId, message } = parsed.data;
  const access = await requireWorkspaceMember(workspaceId);
  if ("error" in access) return access.error;
  const thread = await getThread(threadId);
  if (!thread || thread.workspaceId !== workspaceId) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  const text = message.content.trim();
  const session = await auth();
  const userName = session?.user?.name ?? session?.user?.email ?? null;

  // 1. The question is on record before anything else happens
  await insertUserMessage({ id: message.id, threadId, workspaceId, userId: access.userId, fileId: fileId ?? null, content: text });

  // 2. Context and history from the server side
  const [docContext, history] = await Promise.all([fileId ? documentContext(fileId, workspaceId) : Promise.resolve(""), historyForModel(threadId)]);
  const messages: CoreMessage[] = history.length && history[history.length - 1].role === "user" ? history : [...history, { role: "user", content: text }];

  // 3. Which agent, and what evidence
  let routed: RoutedBrief | null = null;
  try {
    routed = await routeMessage({ workspaceId, userId: access.userId, fileId, message: text });
  } catch (err) {
    console.error("[neura-ai] routing failed, answering generally", err);
  }
  const route = routed?.route ?? "general";
  const runId = routed?.runId ?? null;
  const confidence = routed?.confidence ?? null;
  const general = route === "general";

  // 4. Stream, then persist and mirror
  return createDataStreamResponse({
    execute: (ds) => {
      ds.writeMessageAnnotation({ route, runId, confidence });
      const result = streamText({
        model: chatModel(),
        temperature: general ? 0.4 : 0.2,
        system: general ? GENERAL_SYSTEM + docContext : evidenceSystem(ROUTE_NAMES[route], routed?.brief ?? ""),
        messages,
        ...(general ? { tools: researchTools(workspaceId), maxSteps: 5 } : {}),
        onFinish: async ({ response }) => {
          try {
            const userMessage: Message = { id: message.id, role: "user", content: text, createdAt: new Date() };
            const ui = appendResponseMessages({ messages: [userMessage], responseMessages: response.messages });
            const assistant = [...ui].reverse().find((m) => m.role === "assistant");
            if (!assistant) return;
            await insertAssistantMessage({
              id: assistant.id,
              threadId,
              workspaceId,
              content: assistant.content,
              parts: assistant.parts,
              toolInvocations: assistant.toolInvocations,
              fileId: fileId ?? null,
              route,
              confidence,
              runId,
            });
            await mirrorExchange({
              workspaceId,
              threadId,
              question: { id: message.id, text, userId: access.userId, userName, fileId: fileId ?? null },
              answer: { id: assistant.id, text: assistant.content, route, runId },
              paperIds: [...(routed?.paperIds ?? []), ...paperIdsFromTools(assistant.toolInvocations)],
            });
          } catch (err) {
            console.error("[neura-ai] persist failed", err);
          }
        },
      });
      // Keep consuming so onFinish runs even if the client disconnects mid-answer
      result.consumeStream();
      result.mergeIntoDataStream(ds);
    },
    onError: errorMessage,
  });
}

/** Stateless path (no thread): the caller supplies the messages; nothing is stored. */
async function legacyTurn(body: Record<string, unknown>) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { messages, workspaceId, fileId } = body as { messages?: CoreMessage[]; workspaceId?: string; fileId?: string };
  if (!Array.isArray(messages)) return NextResponse.json({ error: "messages are required" }, { status: 400 });

  const last = [...messages].reverse().find((m) => m.role === "user");
  const lastText = typeof last?.content === "string" ? last.content : "";
  if (workspaceId && lastText && (await checkWorkspaceAccess(workspaceId, session.user.id))) {
    try {
      const routed = await routeMessage({ workspaceId, userId: session.user.id, fileId, message: lastText });
      if (routed.route !== "general") {
        const result = streamText({ model: chatModel(), temperature: 0.2, system: evidenceSystem(ROUTE_NAMES[routed.route], routed.brief), messages });
        return result.toDataStreamResponse({ getErrorMessage: errorMessage });
      }
    } catch (err) {
      console.error("[neura-ai] routing failed, answering generally", err);
    }
  }
  const result = streamText({ model: chatModel(), system: GENERAL_SYSTEM, messages, maxSteps: 5, tools: researchTools(workspaceId), temperature: 0.4 });
  return result.toDataStreamResponse({ getErrorMessage: errorMessage });
}
