// POST /api/adam/[projectId]/pdf — "supply this PDF": the researcher uploads the file for a
// paper the sweep could only read as an abstract. The library row gets the file and the
// Librarian re-reads it in full (section-aware passages), after the response.
//   multipart/form-data: file, workspaceId, pgPaperId

import db from "@/db";
import { papers } from "@/db/schema";
import { emit } from "@/lib/adam/events";
import { scheduleLibraryIngest } from "@/lib/graph/hooks";
import { uploadPapersToStorage } from "@/lib/storage";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireProject } from "../../_access";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const form = await req.formData();
  const workspaceId = String(form.get("workspaceId") ?? "");
  const pgPaperId = String(form.get("pgPaperId") ?? "");
  const file = form.get("file");
  const access = await requireProject(req, projectId, { workspaceId });
  if ("error" in access) return access.error;
  if (!(file instanceof File) || !pgPaperId) return NextResponse.json({ error: "file and pgPaperId are required" }, { status: 400 });

  const [row] = await db.select().from(papers).where(eq(papers.id, pgPaperId));
  if (!row || row.workspaceId !== access.workspaceId) return NextResponse.json({ error: "paper not found" }, { status: 404 });

  const uploaded = await uploadPapersToStorage(file, `${access.workspaceId}/${Date.now()}-${file.name}`, file.type);
  if (!uploaded?.success || !uploaded.url) return NextResponse.json({ error: "upload failed" }, { status: 500 });
  const [updated] = await db.update(papers).set({ uploadUrl: uploaded.url, fileType: file.type || "pdf" }).where(eq(papers.id, pgPaperId)).returning();

  scheduleLibraryIngest([updated]);
  await emit(access.graph, projectId, "pdf_supplied", { pgPaperId, title: row.title, by: access.userId });
  return NextResponse.json({ queued: true, url: uploaded.url });
}
