import { startProject } from "@/lib/adam/orchestrator";
import { NextResponse } from "next/server";
import { readBody, requireProject } from "../../_access";

export const runtime = "nodejs";

/** POST /api/adam/[projectId]/start { workspaceId } — run (or resume) the research loop. */
export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const body = await readBody<Record<string, unknown>>(req);
  const access = await requireProject(req, projectId, body);
  if ("error" in access) return access.error;
  const project = await startProject(access.graph, access.workspaceId, projectId);
  return NextResponse.json({ project });
}
