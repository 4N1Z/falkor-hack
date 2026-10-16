import { createProject, listProjects } from "@/lib/adam/project";
import { NextResponse } from "next/server";
import { requireWorkspaceMember } from "../../papers/_access";
import { readBody } from "../_access";

export const runtime = "nodejs";

/** GET /api/adam/projects?workspaceId= — the workspace's research projects, newest first. */
export async function GET(req: Request) {
  const access = await requireWorkspaceMember(new URL(req.url).searchParams.get("workspaceId"));
  if ("error" in access) return access.error;
  return NextResponse.json({ projects: await listProjects(access.workspaceId) });
}

/** POST /api/adam/projects { workspaceId, title, topic?, understanding?, constraints?, seeds? } */
export async function POST(req: Request) {
  const body = await readBody<{
    workspaceId?: string;
    title?: string;
    topic?: string;
    understanding?: string;
    constraints?: Record<string, unknown>;
    seeds?: { paperId: string; label: "trusted" | "distrusted" }[];
  }>(req);
  const access = await requireWorkspaceMember(body.workspaceId);
  if ("error" in access) return access.error;
  const title = (body.title ?? "").trim();
  if (title.length < 3) return NextResponse.json({ error: "Give the project a title" }, { status: 400 });
  const project = await createProject({
    workspaceId: access.workspaceId,
    userId: access.userId,
    title,
    topic: body.topic,
    understanding: body.understanding,
    constraints: body.constraints as never,
    seeds: body.seeds,
  });
  return NextResponse.json({ project });
}
