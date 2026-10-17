import { pauseProject } from "@/lib/adam/orchestrator";
import { NextResponse } from "next/server";
import { readBody, requireProject } from "../../_access";

export const runtime = "nodejs";

/** POST /api/adam/[projectId]/pause { workspaceId } — human hold: queued work waits, running jobs finish. */
export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const body = await readBody<Record<string, unknown>>(req);
  const access = await requireProject(req, projectId, body);
  if ("error" in access) return access.error;
  const project = await pauseProject(access.graph, projectId);
  return NextResponse.json({ project });
}
