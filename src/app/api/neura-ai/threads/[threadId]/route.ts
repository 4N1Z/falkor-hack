import { requireWorkspaceMember } from "@/app/api/papers/_access";
import { getThread, renameThread } from "@/lib/chat/store";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const RenameSchema = z.object({ workspaceId: z.string().uuid(), title: z.string().trim().min(1).max(120) });

/** PATCH /api/neura-ai/threads/[threadId] { workspaceId, title } — rename a thread. */
export async function PATCH(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const parsed = RenameSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "workspaceId and title are required" }, { status: 400 });
  const access = await requireWorkspaceMember(parsed.data.workspaceId);
  if ("error" in access) return access.error;
  const thread = await getThread(threadId);
  if (!thread || thread.workspaceId !== access.workspaceId) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  await renameThread(threadId, parsed.data.title);
  return NextResponse.json({ ok: true });
}
