import { decide, queueItems, unmergeMethod, type Decision } from "@/lib/adam/review";
import { NextResponse } from "next/server";
import { readBody, requireProject } from "../../_access";

export const runtime = "nodejs";

type Params = { params: Promise<{ projectId: string }> };

/** GET /api/adam/[projectId]/queue?workspaceId= — the exception queue: what needs a person. */
export async function GET(req: Request, { params }: Params) {
  const { projectId } = await params;
  const access = await requireProject(req, projectId);
  if ("error" in access) return access.error;
  return NextResponse.json({ items: await queueItems(access.graph, projectId) });
}

/**
 * POST /api/adam/[projectId]/queue { workspaceId, nodeId, decision: approve|correct|reject|send_back, text?, note? }
 * POST /api/adam/[projectId]/queue { workspaceId, unmerge: { methodId, alias } }
 */
export async function POST(req: Request, { params }: Params) {
  const { projectId } = await params;
  const body = await readBody<{ workspaceId?: string; nodeId?: string; decision?: Decision; text?: string; note?: string; unmerge?: { methodId: string; alias: string } }>(req);
  const access = await requireProject(req, projectId, body);
  if ("error" in access) return access.error;
  try {
    if (body.unmerge) {
      const id = await unmergeMethod(access.graph, { projectId, methodId: body.unmerge.methodId, alias: body.unmerge.alias, userId: access.userId });
      return NextResponse.json({ unmerged: id });
    }
    if (!body.nodeId || !body.decision) return NextResponse.json({ error: "nodeId and decision are required" }, { status: 400 });
    const result = await decide(access.graph, {
      projectId,
      workspaceId: access.workspaceId,
      nodeId: body.nodeId,
      decision: body.decision,
      text: body.text,
      note: body.note,
      userId: access.userId,
      pass: access.project.pass,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "decision failed" }, { status: 400 });
  }
}
