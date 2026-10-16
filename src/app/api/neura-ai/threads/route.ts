import { requireWorkspaceMember } from "@/app/api/papers/_access";
import { createThread, getOrCreateDefaultThread, listThreads } from "@/lib/chat/store";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

/** GET /api/neura-ai/threads?workspaceId= — the workspace's chat threads; creates "Team chat" on first use. */
export async function GET(req: Request) {
  const access = await requireWorkspaceMember(new URL(req.url).searchParams.get("workspaceId"));
  if ("error" in access) return access.error;
  const defaultThread = await getOrCreateDefaultThread(access.workspaceId, access.userId);
  const threads = await listThreads(access.workspaceId);
  return NextResponse.json({ threads, defaultThreadId: defaultThread.id });
}

const CreateSchema = z.object({ workspaceId: z.string().uuid(), title: z.string().trim().min(1).max(120) });

/** POST /api/neura-ai/threads { workspaceId, title } — a new named thread. */
export async function POST(req: Request) {
  const parsed = CreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "workspaceId and title are required" }, { status: 400 });
  const access = await requireWorkspaceMember(parsed.data.workspaceId);
  if ("error" in access) return access.error;
  const thread = await createThread(access.workspaceId, access.userId, parsed.data.title);
  return NextResponse.json({ thread }, { status: 201 });
}
