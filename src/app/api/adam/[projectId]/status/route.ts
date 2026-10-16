import { projectStatus } from "@/lib/adam/status";
import { NextResponse } from "next/server";
import { requireProject } from "../../_access";

export const runtime = "nodejs";

/** GET /api/adam/[projectId]/status?workspaceId= — phase, jobs, node counts, queue size, recent events. */
export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const access = await requireProject(req, projectId);
  if ("error" in access) return access.error;
  return NextResponse.json(await projectStatus(access.graph, access.project));
}
