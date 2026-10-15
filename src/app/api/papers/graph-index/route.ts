import { getWorkspaceGraph } from "@/lib/graph/client";
import { GRAPH_INDEX_PAPERS, GRAPH_INDEX_TOTALS } from "@/lib/graph/queries";
import { NextResponse } from "next/server";
import { requireWorkspaceMember } from "../_access";

export const runtime = "nodejs";

export interface GraphIndexPaper {
  paperId: string;
  pgPaperId: string | null;
  title: string;
  year: number | null;
  importedBy: string;
  source: string | null;
  chunks: number;
  links: number;
  unmatched: boolean;
}

export interface GraphIndexTotals {
  papers: number;
  library: number;
  suspect: number;
  citations: number;
  passages: number;
  authors: number;
  concepts: number;
  claims: number;
}

/**
 * GET /api/papers/graph-index?workspaceId=
 * What FalkorDB actually holds for this workspace: every paper a collaborator brought in
 * (including graph-only demo collaborators) plus graph-wide totals. Read straight from the
 * graph, so it is the source of truth for "what can the agents use?".
 */
export async function GET(req: Request) {
  const access = await requireWorkspaceMember(new URL(req.url).searchParams.get("workspaceId"));
  if ("error" in access) return access.error;
  try {
    const graph = await getWorkspaceGraph(access.workspaceId);
    const [papers, totals] = await Promise.all([
      graph.roQuery<GraphIndexPaper>(GRAPH_INDEX_PAPERS),
      graph.roQuery<GraphIndexTotals>(GRAPH_INDEX_TOTALS),
    ]);
    return NextResponse.json({ papers: papers.data ?? [], totals: totals.data?.[0] ?? null });
  } catch (err) {
    console.error("[papers] graph index unavailable", err);
    return NextResponse.json({ error: "The research graph (FalkorDB) is unreachable." }, { status: 503 });
  }
}
