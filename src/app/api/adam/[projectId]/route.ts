import { deleteProject, updateProject } from "@/lib/adam/project";
import { NextResponse } from "next/server";
import { readBody, requireProject } from "../_access";

export const runtime = "nodejs";

type Params = { params: Promise<{ projectId: string }> };

/** GET /api/adam/[projectId]?workspaceId= */
export async function GET(req: Request, { params }: Params) {
  const { projectId } = await params;
  const access = await requireProject(req, projectId);
  if ("error" in access) return access.error;
  return NextResponse.json({ project: access.project });
}

/** PATCH /api/adam/[projectId] { workspaceId, title?, topic?, understanding?, constraints?, seeds?, budget?, maxConcurrency? } */
export async function PATCH(req: Request, { params }: Params) {
  const { projectId } = await params;
  const body = await readBody<Record<string, unknown>>(req);
  const access = await requireProject(req, projectId, body);
  if ("error" in access) return access.error;
  const project = await updateProject(access.graph, projectId, {
    title: body.title as string | undefined,
    topic: body.topic as string | undefined,
    understanding: body.understanding as string | undefined,
    constraints: body.constraints as never,
    seeds: body.seeds as never,
    budget: body.budget as never,
    maxConcurrency: typeof body.maxConcurrency === "number" ? Math.max(1, Math.min(8, body.maxConcurrency)) : undefined,
  });
  return NextResponse.json({ project });
}

/** DELETE /api/adam/[projectId] { workspaceId } — the project and every node it owns. */
export async function DELETE(req: Request, { params }: Params) {
  const { projectId } = await params;
  const body = await readBody<Record<string, unknown>>(req);
  const access = await requireProject(req, projectId, body);
  if ("error" in access) return access.error;
  await deleteProject(access.graph, projectId);
  return NextResponse.json({ deleted: true });
}
