import { KNOWLEDGE_GRAPH_LINKS, KNOWLEDGE_GRAPH_NODES, KNOWLEDGE_NODES } from "@/lib/adam/queries-review";
import { nodeDetail } from "@/lib/adam/review";
import { NextResponse } from "next/server";
import { requireProject } from "../../_access";

export const runtime = "nodejs";

export interface KnowledgeNode {
  label: string;
  id: string;
  text: string;
  state: string;
  reason: string;
  confidence: number;
  loadBearing: boolean;
  dependents: number;
  section: string;
  page: number;
  speculative: boolean;
  paperId: string | null;
  paperTitle: string;
  year: number | null;
  createdAt: number;
  aliases: string[];
  slot: string;
}

export interface KnowledgeGraph {
  nodes: { label: string; id: string; text: string; state: string; weight: number; paperId: string | null }[];
  links: { source: string; target: string; type: string; status: string }[];
}

/**
 * GET /api/adam/[projectId]/knowledge?workspaceId=&view=table|graph|node&id=&includeRetracted=1
 *  table: every node the project holds (filtering happens client-side on a bounded list)
 *  graph: papers, claims, methods, assumptions, procedures, results and the edges between them
 *  node:  one node's provenance (properties, passage, paper, edges, mentions)
 */
export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const access = await requireProject(req, projectId);
  if ("error" in access) return access.error;
  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? "table";
  const p = <T>(x: T) => ({ params: x as never });

  if (view === "node") {
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const detail = await nodeDetail(access.graph, projectId, id);
    if (!detail) return NextResponse.json({ error: "node not found" }, { status: 404 });
    return NextResponse.json(detail);
  }
  if (view === "graph") {
    const [nodes, links] = await Promise.all([
      access.graph.roQuery<KnowledgeGraph["nodes"][number]>(KNOWLEDGE_GRAPH_NODES, p({ projectId })).then((r) => r.data ?? []),
      access.graph.roQuery<KnowledgeGraph["links"][number]>(KNOWLEDGE_GRAPH_LINKS, p({ projectId })).then((r) => r.data ?? []),
    ]);
    return NextResponse.json({ nodes, links } satisfies KnowledgeGraph);
  }
  const includeRetracted = url.searchParams.get("includeRetracted") === "1";
  const nodes = (await access.graph.roQuery<KnowledgeNode>(KNOWLEDGE_NODES, p({ projectId, includeRetracted }))).data ?? [];
  return NextResponse.json({ nodes });
}
