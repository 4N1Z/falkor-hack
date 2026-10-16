import { requireWorkspaceMember } from "@/app/api/papers/_access";
import { auth } from "@/auth";
import { runNextSteps } from "@/lib/agents/next-steps";
import { getWorkspaceGraph } from "@/lib/graph/client";
import { RECENT_IDEAS, SET_IDEA_STATUS } from "@/lib/graph/queries";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const IDEA_STATUSES = ["accepted", "suggested", "rejected"] as const;

/**
 * GET /api/agents/next-steps?workspaceId=&statuses=accepted,suggested
 * Ideas by status: the research plan (accepted) by default; `suggested` adds earlier
 * proposals nobody has decided on yet, so the Notebook opens with something to act on.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const access = await requireWorkspaceMember(sp.get("workspaceId"));
  if ("error" in access) return access.error;
  const wanted = (sp.get("statuses") ?? "accepted").split(",").filter((s): s is (typeof IDEA_STATUSES)[number] => (IDEA_STATUSES as readonly string[]).includes(s));
  const statuses = wanted.length ? wanted : ["accepted"];
  const graph = await getWorkspaceGraph(access.workspaceId);
  const ideas = (await graph.roQuery(RECENT_IDEAS, { params: { statuses, limit: 40 } as never })).data ?? [];
  return NextResponse.json({ ideas });
}

/** POST /api/agents/next-steps { workspaceId, fileId? } — three grounded next steps. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { workspaceId?: string; fileId?: string };
  const access = await requireWorkspaceMember(body.workspaceId);
  if ("error" in access) return access.error;
  try {
    return NextResponse.json(await runNextSteps({ workspaceId: access.workspaceId, userId: access.userId, fileId: body.fileId }));
  } catch (err) {
    console.error("[next-steps] failed", err);
    return NextResponse.json({ error: "Couldn't suggest next steps right now." }, { status: 503 });
  }
}

/** PATCH /api/agents/next-steps { workspaceId, id, status: accepted|rejected } */
export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { workspaceId?: string; id?: string; status?: string };
  const access = await requireWorkspaceMember(body.workspaceId);
  if ("error" in access) return access.error;
  if (!body.id || !["accepted", "rejected"].includes(body.status ?? "")) {
    return NextResponse.json({ error: "id and status are required" }, { status: 400 });
  }
  const s = await auth();
  const graph = await getWorkspaceGraph(access.workspaceId);
  await graph.query(SET_IDEA_STATUS, {
    params: { id: body.id, status: body.status, userName: s?.user?.name ?? s?.user?.email ?? null, at: Date.now() } as never,
  });
  return NextResponse.json({ ok: true });
}
