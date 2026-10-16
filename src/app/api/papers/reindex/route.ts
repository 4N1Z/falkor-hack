import db from "@/db";
import { papers } from "@/db/schema";
import { scheduleLibraryIngest, setIngestStatus } from "@/lib/graph/hooks";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireWorkspaceMember } from "../_access";

export const runtime = "nodejs";

/**
 * POST /api/papers/reindex { workspaceId, paperIds?: string[] }
 * Re-runs the full pipeline (Librarian + full text) for the given papers, or for the whole
 * library when paperIds is omitted. Idempotent: re-indexing replaces, never duplicates.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { workspaceId?: string; paperIds?: string[] };
  const access = await requireWorkspaceMember(body.workspaceId);
  if ("error" in access) return access.error;

  const where = body.paperIds?.length
    ? and(eq(papers.workspaceId, access.workspaceId), inArray(papers.id, body.paperIds.slice(0, 200)))
    : eq(papers.workspaceId, access.workspaceId);
  const rows = await db.select().from(papers).where(where);
  if (!rows.length) return NextResponse.json({ queued: 0 });

  // Mark as indexing now (not in the background job) so the UI flips immediately
  await setIngestStatus(access.workspaceId, rows.map((r) => ({ pgPaperId: r.id, state: "indexing" })));
  // Batches of 10 keep each run's OpenAlex fan-out and memory bounded
  for (let i = 0; i < rows.length; i += 10) scheduleLibraryIngest(rows.slice(i, i + 10));

  return NextResponse.json({ queued: rows.length });
}
