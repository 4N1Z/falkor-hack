import { emit } from "@/lib/adam/events";
import * as jobs from "@/lib/adam/jobs";
import { PRIORITY } from "@/lib/adam/orchestrator";
import { decide, decideMany, queuePage, unmergeMethod, type Decision, type QueueKind } from "@/lib/adam/review";
import { NextResponse } from "next/server";
import { readBody, requireProject } from "../../_access";

export const runtime = "nodejs";

type Params = { params: Promise<{ projectId: string }> };

/**
 * GET /api/adam/[projectId]/queue?workspaceId=&kind=&paperId=&offset=&limit=&view=open|auto
 * One page of the exception queue (passages included for that page only), the totals, and the
 * auto-review job in flight if any.
 */
export async function GET(req: Request, { params }: Params) {
  const { projectId } = await params;
  const access = await requireProject(req, projectId);
  if ("error" in access) return access.error;
  const q = new URL(req.url).searchParams;
  const [page, running] = await Promise.all([
    queuePage(access.graph, projectId, {
      kind: (q.get("kind") as QueueKind | "all") ?? "all",
      paperId: q.get("paperId") ?? "all",
      offset: Number(q.get("offset") ?? 0),
      limit: Number(q.get("limit") ?? 40),
      view: q.get("view") === "auto" ? "auto" : "open",
    }),
    jobs.byKindAndStatus(access.graph, projectId, ["auto_review"], ["queued", "running"]),
  ]);
  return NextResponse.json({ ...page, autoReview: running[0] ? { status: running[0].status, progress: running[0].progress } : null });
}

/**
 * POST /api/adam/[projectId]/queue
 *   { workspaceId, decisions: [{ nodeId, decision: approve|reject }] }                  bulk, one round trip
 *   { workspaceId, nodeId, decision: approve|correct|reject|send_back, text?, note? }  one item
 *   { workspaceId, autoReview: true, kinds?: QueueKind[] }                              optional JEV + graph pass
 *   { workspaceId, unmerge: { methodId, alias } }
 */
export async function POST(req: Request, { params }: Params) {
  const { projectId } = await params;
  const body = await readBody<{
    workspaceId?: string;
    nodeId?: string;
    decision?: Decision;
    text?: string;
    note?: string;
    decisions?: { nodeId: string; decision: "approve" | "reject" }[];
    autoReview?: boolean;
    kinds?: QueueKind[];
    unmerge?: { methodId: string; alias: string };
  }>(req);
  const access = await requireProject(req, projectId, body);
  if ("error" in access) return access.error;
  try {
    if (body.unmerge) {
      const id = await unmergeMethod(access.graph, { projectId, methodId: body.unmerge.methodId, alias: body.unmerge.alias, userId: access.userId });
      return NextResponse.json({ unmerged: id });
    }
    if (body.autoReview) {
      const job = await jobs.enqueue(access.graph, {
        projectId,
        kind: "auto_review",
        subject: `queue · ${access.project.pass}`,
        payload: { kinds: body.kinds ?? [] },
        priority: PRIORITY.auto_review,
        dedupeKey: `auto_review:${projectId}:${Date.now()}`,
        maxAttempts: 2,
      });
      await emit(access.graph, projectId, "job_requested", { kind: "auto_review", by: access.userId, created: job.created, kinds: body.kinds ?? [] });
      return NextResponse.json({ job });
    }
    if (Array.isArray(body.decisions)) {
      const rows = body.decisions.filter((d) => typeof d?.nodeId === "string" && (d.decision === "approve" || d.decision === "reject")).slice(0, 500);
      const n = await decideMany(access.graph, { projectId, userId: access.userId, rows });
      return NextResponse.json({ decided: n });
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
