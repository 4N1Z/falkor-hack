import db from "@/db";
import { papers, users } from "@/db/schema";
import { getWorkspaceGraph } from "@/lib/graph/client";
import { LIBRARY_GRAPH_STATUS } from "@/lib/graph/queries";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireWorkspaceMember } from "./_access";

export const runtime = "nodejs";

export interface LibraryPaper {
  id: string;
  title: string;
  doi: string | null;
  source: string;
  externalSource: string | null;
  uploadUrl: string | null;
  createdAt: string;
  importedBy: { id: string; name: string };
  /** Graph status: null while the Librarian hasn't processed it yet */
  graph: {
    matched: boolean;
    year: number | null;
    venue: string | null;
    links: number;
    chunks: number;
  } | null;
}

/** GET /api/papers?workspaceId= — the workspace library with each paper's graph status. */
export async function GET(req: Request) {
  const access = await requireWorkspaceMember(new URL(req.url).searchParams.get("workspaceId"));
  if ("error" in access) return access.error;

  const rows = await db
    .select({
      id: papers.id,
      title: papers.title,
      doi: papers.doi,
      source: papers.source,
      externalSource: papers.externalSource,
      uploadUrl: papers.uploadUrl,
      createdAt: papers.createdAt,
      userId: papers.userId,
      userName: users.name,
      userEmail: users.email,
    })
    .from(papers)
    .leftJoin(users, eq(users.id, papers.userId))
    .where(eq(papers.workspaceId, access.workspaceId))
    .orderBy(desc(papers.createdAt));

  const statusByPg = new Map<string, { paperId: string; year: number | null; venue: string | null; links: number; chunks: number }>();
  if (rows.length) {
    try {
      const graph = await getWorkspaceGraph(access.workspaceId);
      const res = await graph.roQuery<{ pgPaperId: string; paperId: string; year: number | null; venue: string | null; links: number; chunks: number }>(
        LIBRARY_GRAPH_STATUS,
        { params: { pgIds: rows.map((r) => r.id) } as never },
      );
      for (const s of res.data ?? []) statusByPg.set(s.pgPaperId, s);
    } catch (err) {
      console.error("[papers] graph status unavailable", err); // library still lists without it
    }
  }

  const library: LibraryPaper[] = rows.map((r) => {
    const s = statusByPg.get(r.id);
    return {
      id: r.id,
      title: r.title,
      doi: r.doi,
      source: r.source,
      externalSource: r.externalSource,
      uploadUrl: r.uploadUrl,
      createdAt: r.createdAt,
      importedBy: { id: r.userId, name: r.userName || r.userEmail || "Collaborator" },
      graph: s
        ? { matched: !s.paperId.startsWith("local:"), year: s.year, venue: s.venue, links: s.links, chunks: s.chunks }
        : null,
    };
  });
  return NextResponse.json({ papers: library });
}
