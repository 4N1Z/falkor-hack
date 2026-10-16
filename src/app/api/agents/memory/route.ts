import { requireWorkspaceMember } from "@/app/api/papers/_access";
import { auth } from "@/auth";
import { remember, setMemoryStatus, timeline, type MemoryKind, type MemoryStatus } from "@/lib/agents/historian";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const userName = async () => {
  const s = await auth();
  return s?.user?.name ?? s?.user?.email ?? null;
};

/** GET /api/agents/memory?workspaceId= — the team's research memory, newest first. */
export async function GET(req: Request) {
  const access = await requireWorkspaceMember(new URL(req.url).searchParams.get("workspaceId"));
  if ("error" in access) return access.error;
  return NextResponse.json({ items: await timeline(access.workspaceId) });
}

/** POST /api/agents/memory { workspaceId, text, kind?, fileId? } — remember a note (JEV classifies it). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { workspaceId?: string; text?: string; kind?: MemoryKind; fileId?: string };
  const access = await requireWorkspaceMember(body.workspaceId);
  if ("error" in access) return access.error;
  const text = (body.text ?? "").trim();
  if (text.length < 8) return NextResponse.json({ error: "Write a little more to remember" }, { status: 400 });
  const kind = body.kind && ["hypothesis", "finding", "question"].includes(body.kind) ? body.kind : undefined;
  const result = await remember({
    workspaceId: access.workspaceId,
    userId: access.userId,
    userName: await userName(),
    text,
    kind,
    fileId: body.fileId,
  });
  return NextResponse.json(result);
}

/** PATCH /api/agents/memory { workspaceId, id, status, reason?, becausePaperId? } — drop / confirm / reopen. */
export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    workspaceId?: string;
    id?: string;
    status?: MemoryStatus;
    reason?: string;
    becausePaperId?: string;
  };
  const access = await requireWorkspaceMember(body.workspaceId);
  if ("error" in access) return access.error;
  if (!body.id || !["active", "dropped", "confirmed"].includes(body.status ?? "")) {
    return NextResponse.json({ error: "id and status are required" }, { status: 400 });
  }
  await setMemoryStatus({
    workspaceId: access.workspaceId,
    id: body.id,
    status: body.status!,
    reason: body.reason?.slice(0, 500) ?? null,
    becausePaperId: body.becausePaperId ?? null,
    userName: await userName(),
  });
  return NextResponse.json({ ok: true });
}
