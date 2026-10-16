import db from "@/db";
import { papers } from "@/db/schema";
import { scheduleLibraryIngest } from "@/lib/graph/hooks";
import { getSearchResultsByIds } from "@/lib/graph/openalex";
import { NextResponse } from "next/server";
import { requireWorkspaceMember } from "../_access";

export const runtime = "nodejs";

/**
 * POST /api/papers/import { workspaceId, openalexIds: string[] }
 * Adds OpenAlex works to the workspace library. The open-access PDF (when there is one) is
 * stored as the paper's file, then the Librarian indexes everything into the graph:
 * citations/authors/concepts plus full-text passages, so collaborators' agents can use it.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { workspaceId?: string; openalexIds?: string[] };
  const access = await requireWorkspaceMember(body.workspaceId);
  if ("error" in access) return access.error;

  const ids = [...new Set((body.openalexIds ?? []).filter((id) => /^W\d+$/.test(id)))].slice(0, 25);
  if (!ids.length) return NextResponse.json({ error: "Select at least one paper" }, { status: 400 });

  const works = await getSearchResultsByIds(ids);
  const inserted = await db
    .insert(papers)
    .values(
      works.map((w) => ({
        title: w.title.slice(0, 500),
        type: w.paperType,
        source: "other" as const,
        externalSource: "openalex",
        externalId: w.openalexId,
        abstract: w.abstract,
        doi: w.doi && w.doi.startsWith("10.") ? w.doi : null,
        uploadUrl: w.pdfUrl,
        fileType: w.pdfUrl ? "pdf" : null,
        userId: access.userId,
        workspaceId: access.workspaceId,
      })),
    )
    // Same title already in this workspace (unique per workspace): it's already in the library
    .onConflictDoNothing()
    .returning();

  scheduleLibraryIngest(inserted);
  return NextResponse.json({
    imported: inserted.map((p) => ({ id: p.id, title: p.title, hasPdf: !!p.uploadUrl })),
    skipped: works.length - inserted.length,
  });
}
