import { emit } from "@/lib/adam/events";
import * as jobs from "@/lib/adam/jobs";
import { PRIORITY } from "@/lib/adam/orchestrator";
import { editQuestionPage, getQuestionPage } from "@/lib/adam/question-page";
import { NextResponse } from "next/server";
import { readBody, requireProject } from "../../_access";

export const runtime = "nodejs";

type Params = { params: Promise<{ projectId: string }> };

/** GET /api/adam/[projectId]/question?workspaceId= — the current pass's Question page. */
export async function GET(req: Request, { params }: Params) {
  const { projectId } = await params;
  const access = await requireProject(req, projectId);
  if ("error" in access) return access.error;
  return NextResponse.json({ page: await getQuestionPage(access.graph, projectId) });
}

/** PATCH /api/adam/[projectId]/question { workspaceId, hunch?, why?, subquestions?, vocabulary?, scopeFence? } — researcher edits (human_approved). */
export async function PATCH(req: Request, { params }: Params) {
  const { projectId } = await params;
  const body = await readBody<Record<string, unknown>>(req);
  const access = await requireProject(req, projectId, body);
  if ("error" in access) return access.error;
  const page = await editQuestionPage(access.graph, projectId, access.project.pass, access.userId, {
    hunch: body.hunch as string | undefined,
    why: body.why as string | undefined,
    subquestions: body.subquestions as never,
    vocabulary: body.vocabulary as never,
    scopeFence: body.scopeFence as never,
  });
  if (!page) return NextResponse.json({ error: "No question page for this pass yet" }, { status: 404 });
  await emit(access.graph, projectId, "question_page_edited", { by: access.userId });
  return NextResponse.json({ page });
}

/** POST /api/adam/[projectId]/question { workspaceId, note? } — send the page back: the Scoper rewrites it with the note. */
export async function POST(req: Request, { params }: Params) {
  const { projectId } = await params;
  const body = await readBody<{ workspaceId?: string; note?: string }>(req);
  const access = await requireProject(req, projectId, body);
  if ("error" in access) return access.error;
  const job = await jobs.enqueue(access.graph, {
    projectId,
    kind: "scope",
    subject: `pass-${access.project.pass}`,
    payload: { note: body.note ?? "" },
    priority: PRIORITY.scope,
    dedupeKey: `scope:${projectId}:${access.project.pass}:${Date.now()}`,
  });
  await emit(access.graph, projectId, "question_page_sent_back", { note: body.note ?? "", by: access.userId });
  return NextResponse.json({ job });
}
