import { requireWorkspaceMember } from "@/app/api/papers/_access";
import { runScoutWatcher } from "@/lib/agents/scout-watcher";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/agents/scout-watcher { workspaceId, sinceMonths? } — recent papers that cite the team's work. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { workspaceId?: string; sinceMonths?: number };
  const access = await requireWorkspaceMember(body.workspaceId);
  if ("error" in access) return access.error;
  try {
    return NextResponse.json(await runScoutWatcher({ workspaceId: access.workspaceId, userId: access.userId, sinceMonths: body.sinceMonths }));
  } catch (err) {
    console.error("[scout-watcher] failed", err);
    return NextResponse.json({ error: "Couldn't check for new papers right now." }, { status: 503 });
  }
}
