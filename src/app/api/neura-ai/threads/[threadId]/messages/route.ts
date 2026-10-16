import { requireWorkspaceMember } from "@/app/api/papers/_access";
import { getThread, listMessages } from "@/lib/chat/store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/neura-ai/threads/[threadId]/messages?workspaceId=&after=<seq>&limit=
 * Oldest first. Without `after`: the newest `limit` (default 200). With `after`: only newer rows,
 * which is what the panels poll with, so a quiet thread costs one indexed query returning [].
 */
export async function GET(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const sp = new URL(req.url).searchParams;
  const access = await requireWorkspaceMember(sp.get("workspaceId"));
  if ("error" in access) return access.error;
  const thread = await getThread(threadId);
  if (!thread || thread.workspaceId !== access.workspaceId) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  const after = Number(sp.get("after") ?? 0) || undefined;
  const limit = Number(sp.get("limit") ?? 0) || undefined;
  const messages = await listMessages({ threadId, afterSeq: after, limit });
  const cursor = messages.length ? messages[messages.length - 1].seq : (after ?? 0);
  return NextResponse.json({ messages, cursor, thread });
}
