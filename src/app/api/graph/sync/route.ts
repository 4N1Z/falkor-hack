import { auth } from "@/auth";
import db from "@/db";
import { checkWorkspaceAccess } from "@/db/actions/authorization-check";
import { papers } from "@/db/schema";
import { getWorkspaceGraph } from "@/lib/graph/client";
import { ingestPaperRows } from "@/lib/graph/hooks";
import { GRAPH_STATS } from "@/lib/graph/queries";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { validate } from "uuid";

export const runtime = "nodejs"; // FalkorDB client needs TCP
export const maxDuration = 300;

/**
 * POST /api/graph/sync { workspaceId }
 * Rebuilds the workspace research graph from every paper in its library (idempotent).
 * Backs the "Build graph" button and backfills papers imported before the graph existed.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspaceId } = (await req.json().catch(() => ({}))) as { workspaceId?: string };
  if (!workspaceId || !validate(workspaceId)) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }
  if (!(await checkWorkspaceAccess(workspaceId, session.user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db.select().from(papers).where(eq(papers.workspaceId, workspaceId));
  const result = await ingestPaperRows(rows);
  const graph = await getWorkspaceGraph(workspaceId);
  const stats = (await graph.roQuery(GRAPH_STATS)).data?.[0] ?? null;

  return NextResponse.json({ papers: rows.length, result, stats });
}
