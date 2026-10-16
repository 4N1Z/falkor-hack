import db from "@/db";
import { papers, users } from "@/db/schema";
import { getWorkspaceGraph } from "@/lib/graph/client";
import type { FullTextState } from "@/lib/graph/document-index";
import { INGEST_STATUS_FOR, LIBRARY_GRAPH_STATUS } from "@/lib/graph/queries";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireWorkspaceMember } from "./_access";

export const runtime = "nodejs";

/** An indexing run that hasn't reported back in this long is treated as failed. */
const STALE_MS = 15 * 60_000;

export type IndexState = "indexing" | "done" | "failed" | "not_indexed";

export interface PaperIndex {
  state: IndexState;
  /** Why indexing failed (state = failed) */
  error: string | null;
  /** Full-text outcome once done; null when unknown (indexed before status tracking) */
  fullText: FullTextState | null;
  matched: boolean;
  year: number | null;
  venue: string | null;
  links: number;
  chunks: number;
}

export interface LibraryPaper {
  id: string;
  title: string;
  doi: string | null;
  source: string;
  externalSource: string | null;
  uploadUrl: string | null;
  createdAt: string;
  importedBy: { id: string; name: string };
  index: PaperIndex;
}

type GraphRow = { pgPaperId: string; paperId: string; year: number | null; venue: string | null; links: number; chunks: number };
type StatusRow = { pgPaperId: string; state: "indexing" | "done" | "failed"; error: string | null; fullText: FullTextState | null; at: number };

/** GET /api/papers?workspaceId= — the workspace library with each paper's FalkorDB index status. */
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

  const graphByPg = new Map<string, GraphRow>();
  const statusByPg = new Map<string, StatusRow>();
  let graphReachable = true;
  if (rows.length) {
    try {
      const graph = await getWorkspaceGraph(access.workspaceId);
      const params = { params: { pgIds: rows.map((r) => r.id) } as never };
      const [g, s] = await Promise.all([
        graph.roQuery<GraphRow>(LIBRARY_GRAPH_STATUS, params),
        graph.roQuery<StatusRow>(INGEST_STATUS_FOR, params),
      ]);
      for (const r of g.data ?? []) graphByPg.set(r.pgPaperId, r);
      for (const r of s.data ?? []) statusByPg.set(r.pgPaperId, r);
    } catch (err) {
      graphReachable = false;
      console.error("[papers] graph status unavailable", err); // library still lists without it
    }
  }

  const now = Date.now();
  const library: LibraryPaper[] = rows.map((r) => {
    const g = graphByPg.get(r.id);
    const s = statusByPg.get(r.id);
    const age = now - new Date(r.createdAt).getTime();

    let state: IndexState;
    let error: string | null = null;
    if (s?.state === "indexing" && now - s.at > STALE_MS) {
      state = "failed";
      error = "Indexing didn't finish (the server may have restarted). Re-index to try again.";
    } else if (s) {
      state = s.state;
      error = s.error;
    } else if (g) {
      state = "done"; // indexed before status tracking existed
    } else {
      // Not picked up yet right after import; after that it was never indexed
      state = age < STALE_MS ? "indexing" : "not_indexed";
    }

    return {
      id: r.id,
      title: r.title,
      doi: r.doi,
      source: r.source,
      externalSource: r.externalSource,
      uploadUrl: r.uploadUrl,
      createdAt: r.createdAt,
      importedBy: { id: r.userId, name: r.userName || r.userEmail || "Collaborator" },
      index: {
        state,
        error,
        fullText: s?.fullText ?? (g ? (g.chunks > 0 ? "indexed" : r.uploadUrl ? null : "no_file") : null),
        matched: !!g && !g.paperId.startsWith("local:"),
        year: g?.year ?? null,
        venue: g?.venue ?? null,
        links: g?.links ?? 0,
        chunks: g?.chunks ?? 0,
      },
    };
  });
  return NextResponse.json({ papers: library, graphReachable });
}
