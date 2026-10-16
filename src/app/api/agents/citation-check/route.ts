import { requireWorkspaceMember } from "@/app/api/papers/_access";
import { runCitationCheck } from "@/lib/agents/citation-checker";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

/** POST /api/agents/citation-check { workspaceId, fileId } → a verdict for every claim in the draft. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { workspaceId?: string; fileId?: string };
  const access = await requireWorkspaceMember(body.workspaceId);
  if ("error" in access) return access.error;
  if (!body.fileId) return NextResponse.json({ error: "fileId is required" }, { status: 400 });
  try {
    return NextResponse.json(await runCitationCheck({ workspaceId: access.workspaceId, fileId: body.fileId, userId: access.userId }));
  } catch (err) {
    console.error("[citation-check] failed", err);
    return NextResponse.json({ error: "The Citation Checker is unavailable right now." }, { status: 503 });
  }
}
