import { writePassPaper } from "@/lib/adam/paper";
import { NextResponse } from "next/server";
import { readBody, requireProject } from "../../_access";

export const runtime = "nodejs";
export const maxDuration = 180;

/** POST /api/adam/[projectId]/paper { workspaceId } — write the current pass up as a document in the workspace's Adam folder. */
export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const body = await readBody<Record<string, unknown>>(req);
  const access = await requireProject(req, projectId, body);
  if ("error" in access) return access.error;
  try {
    const result = await writePassPaper(access.graph, access.workspaceId, access.project, access.userId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "write-up failed" }, { status: 500 });
  }
}
