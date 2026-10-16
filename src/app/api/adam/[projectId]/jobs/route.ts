import { emit } from "@/lib/adam/events";
import * as jobs from "@/lib/adam/jobs";
import { PRIORITY } from "@/lib/adam/orchestrator";
import type { JobKind } from "@/lib/adam/types";
import { NextResponse } from "next/server";
import { readBody, requireProject } from "../../_access";

export const runtime = "nodejs";

/** Kinds a person may enqueue by hand (the orchestrator enqueues the rest). */
const MANUAL: JobKind[] = ["noop", "scope", "index_paper", "extract_paper", "verify_card", "hunt_method", "analyze_graph", "write_hypotheses", "falsify", "design_experiment", "saturation"];

/** GET /api/adam/[projectId]/jobs?workspaceId= — recent jobs. */
export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const access = await requireProject(req, projectId);
  if ("error" in access) return access.error;
  return NextResponse.json({ jobs: await jobs.recent(access.graph, projectId, 100) });
}

/**
 * POST /api/adam/[projectId]/jobs { workspaceId, kind, subject?, payload?, force? }
 * Enqueue one job by hand (re-extract a paper, re-run the Scoper with a note…). `force`
 * adds a timestamp to the dedupe key so a job that already ran runs again.
 */
export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const body = await readBody<{ workspaceId?: string; kind?: JobKind; subject?: string; payload?: Record<string, unknown>; force?: boolean }>(req);
  const access = await requireProject(req, projectId, body);
  if ("error" in access) return access.error;
  if (!body.kind || !MANUAL.includes(body.kind)) return NextResponse.json({ error: "kind is not one you can enqueue by hand" }, { status: 400 });
  const subject = body.subject ?? null;
  const job = await jobs.enqueue(access.graph, {
    projectId,
    kind: body.kind,
    subject,
    payload: body.payload,
    priority: PRIORITY[body.kind] ?? 100,
    dedupeKey: body.force ? `${body.kind}:${projectId}:${subject ?? "-"}:${Date.now()}` : undefined,
  });
  await emit(access.graph, projectId, "job_requested", { kind: body.kind, subject, by: access.userId, created: job.created });
  return NextResponse.json({ job });
}
