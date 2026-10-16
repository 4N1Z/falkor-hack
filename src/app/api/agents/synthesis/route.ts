import { requireWorkspaceMember } from "@/app/api/papers/_access";
import db from "@/db";
import { files } from "@/db/schema";
import { runSynthesis } from "@/lib/agents/synthesis";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * POST /api/agents/synthesis { workspaceId, topic?, fileId? }
 * Drafts a literature review of the team's papers into a new file and returns it.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { workspaceId?: string; topic?: string; fileId?: string };
  const access = await requireWorkspaceMember(body.workspaceId);
  if ("error" in access) return access.error;
  try {
    const result = await runSynthesis({ workspaceId: access.workspaceId, userId: access.userId, topic: body.topic, fileId: body.fileId });
    const [file] = result.fileId ? await db.select().from(files).where(eq(files.id, result.fileId)) : [];
    return NextResponse.json({ ...result, file: file ?? null });
  } catch (err) {
    console.error("[synthesis] failed", err);
    return NextResponse.json({ error: "Couldn't draft the review right now." }, { status: 503 });
  }
}
