import { requireWorkspaceMember } from "@/app/api/papers/_access";
import { runGhostWriter } from "@/lib/agents/ghost-writer";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** POST /api/agents/ghost { workspaceId, textBeforeCursor } → a short grounded continuation (or none). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { workspaceId?: string; textBeforeCursor?: string };
  const access = await requireWorkspaceMember(body.workspaceId);
  if ("error" in access) return access.error;
  try {
    return NextResponse.json(await runGhostWriter({ workspaceId: access.workspaceId, textBeforeCursor: body.textBeforeCursor ?? "" }));
  } catch (err) {
    console.error("[ghost] failed", err);
    return NextResponse.json({ text: null, skipped: "empty", sources: [], ms: 0 });
  }
}
