import { emit } from "@/lib/adam/events";
import * as jobs from "@/lib/adam/jobs";
import { nextPass, scheduleResweep } from "@/lib/adam/loop";
import { PRIORITY } from "@/lib/adam/orchestrator";
import { clusterStats } from "@/lib/adam/saturation";
import { NextResponse } from "next/server";
import { readBody, requireProject } from "../../_access";

export const runtime = "nodejs";

type Params = { params: Promise<{ projectId: string }> };

/** GET /api/adam/[projectId]/saturation?workspaceId= — per-cluster saturation. */
export async function GET(req: Request, { params }: Params) {
  const { projectId } = await params;
  const access = await requireProject(req, projectId);
  if ("error" in access) return access.error;
  return NextResponse.json({ clusters: await clusterStats(access.graph, projectId) });
}

/**
 * POST /api/adam/[projectId]/saturation
 *   { workspaceId, recompute: true }        recompute the bar now
 *   { workspaceId, nextPass: true }         start the next pass (back to the question)
 *   { workspaceId, resweep: true, since? }  forward-cite re-sweep since a date (default: last sweep or 30 days)
 */
export async function POST(req: Request, { params }: Params) {
  const { projectId } = await params;
  const body = await readBody<{ workspaceId?: string; recompute?: boolean; nextPass?: boolean; resweep?: boolean; since?: string }>(req);
  const access = await requireProject(req, projectId, body);
  if ("error" in access) return access.error;
  if (body.nextPass) {
    const pass = await nextPass(access.graph, access.workspaceId, projectId, access.userId);
    return NextResponse.json({ pass });
  }
  if (body.resweep) {
    const since = body.since ? Date.parse(body.since) : Date.now() - 30 * 86400_000;
    const r = await scheduleResweep(access.graph, projectId, access.project.pass, access.userId, Number.isFinite(since) ? since : Date.now() - 30 * 86400_000);
    return NextResponse.json(r);
  }
  const job = await jobs.enqueue(access.graph, { projectId, kind: "saturation", subject: `pass-${access.project.pass}`, payload: { pass: access.project.pass }, priority: PRIORITY.saturation, dedupeKey: `saturation:${projectId}:manual-${Date.now()}`, maxAttempts: 2 });
  await emit(access.graph, projectId, "job_requested", { kind: "saturation", by: access.userId, created: job.created });
  return NextResponse.json({ job });
}
