// Access guard for project routes: the caller must be a member of the workspace that owns
// the project, and the project must exist in that workspace's graph. workspaceId comes from
// the query string (GET) or the JSON body (others), like the rest of the API.

import { getWorkspaceGraph } from "@/lib/graph/client";
import { getProject } from "@/lib/adam/project";
import { NextResponse } from "next/server";
import { requireWorkspaceMember } from "../papers/_access";

export async function readBody<T extends Record<string, unknown>>(req: Request): Promise<T> {
  return ((await req.json().catch(() => ({}))) ?? {}) as T;
}

export async function requireProject(req: Request, projectId: string, body?: Record<string, unknown>) {
  const workspaceId =
    (body?.workspaceId as string | undefined) ?? new URL(req.url).searchParams.get("workspaceId") ?? undefined;
  const access = await requireWorkspaceMember(workspaceId);
  if ("error" in access) return { error: access.error } as const;
  const graph = await getWorkspaceGraph(access.workspaceId);
  const project = await getProject(graph, projectId);
  if (!project || project.workspaceId !== access.workspaceId) {
    return { error: NextResponse.json({ error: "Project not found" }, { status: 404 }) } as const;
  }
  return { ...access, graph, project } as const;
}
