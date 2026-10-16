import { requireWorkspaceMember } from "@/app/api/papers/_access";
import { runCiteScout } from "@/lib/agents/cite-scout";
import { getWorkspaceGraph } from "@/lib/graph/client";
import { DECIDE_CITE_PROPOSAL } from "@/lib/graph/queries";
import { claimId } from "@/lib/graph/sync-document";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** POST /api/agents/cite-scout { workspaceId, fileId?, paragraph } → suggestions with provenance. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { workspaceId?: string; fileId?: string; paragraph?: string };
  const access = await requireWorkspaceMember(body.workspaceId);
  if ("error" in access) return access.error;
  const paragraph = (body.paragraph ?? "").slice(0, 4000);
  if (paragraph.trim().length < 30) return NextResponse.json({ error: "Paragraph too short" }, { status: 400 });
  try {
    const result = await runCiteScout({
      workspaceId: access.workspaceId,
      userId: access.userId,
      paragraph,
      fileId: body.fileId,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cite-scout] failed", err);
    return NextResponse.json({ error: "Cite Scout is unavailable right now." }, { status: 503 });
  }
}

/**
 * PATCH /api/agents/cite-scout { workspaceId, fileId, sentence, paperId, decision }
 * Accept or dismiss a suggestion. Dismissed papers are never suggested for that sentence again.
 */
export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    workspaceId?: string;
    fileId?: string;
    sentence?: string;
    paperId?: string;
    decision?: "accepted" | "rejected";
  };
  const access = await requireWorkspaceMember(body.workspaceId);
  if ("error" in access) return access.error;
  if (!body.fileId || !body.sentence || !body.paperId || !["accepted", "rejected"].includes(body.decision ?? "")) {
    return NextResponse.json({ error: "fileId, sentence, paperId and decision are required" }, { status: 400 });
  }
  const graph = await getWorkspaceGraph(access.workspaceId);
  const res = await graph.query<{ n: number }>(DECIDE_CITE_PROPOSAL, {
    params: {
      claimId: claimId(body.fileId, body.sentence),
      paperId: body.paperId,
      decision: body.decision,
      userId: access.userId,
      at: Date.now(),
    } as never,
  });
  return NextResponse.json({ recorded: (res.data?.[0]?.n ?? 0) > 0 });
}
