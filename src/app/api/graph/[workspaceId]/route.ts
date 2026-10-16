import { requireWorkspaceMember } from "@/app/api/papers/_access";
import { questionForRun, questionsAboutPaper } from "@/lib/chat/mirror";
import { getWorkspaceGraph } from "@/lib/graph/client";
import {
  RECENT_RUNS,
  VIEW_BRIDGES,
  VIEW_CITES,
  VIEW_FOCUS,
  VIEW_NOTES_BY_ID,
  VIEW_PAPERS_BY_ID,
  VIEW_TEAM,
} from "@/lib/graph/queries";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export type GraphNodeKind = "user" | "paper" | "frontier" | "memory" | "idea" | "question";
export type GraphView = "team" | "focus" | "provenance";

export interface GraphViewNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  /** Owners (user ids) for team papers */
  owners?: string[];
  year?: number | null;
  chunks?: number;
  status?: string;
  /** Focus view: true for the paper at the centre */
  center?: boolean;
  /** Focus view: the centre paper cites this one (vs. this one cites the centre) */
  citedByCenter?: boolean;
  /** Team view: number of collaborators' libraries a bridge paper connects */
  bridges?: number;
  /** Focus view: questions from the team chat whose answer named this paper */
  asked?: { text: string; byName: string; at: number }[];
  /** Question nodes: who asked */
  byName?: string;
}

export interface GraphViewLink {
  source: string;
  target: string;
  kind: "imported" | "cites" | "about" | "grounded";
  /** Agent-written relationships that are still proposals */
  suggested?: boolean;
}

export interface AgentRunView {
  id: string;
  agent: string;
  at: number;
  ms: number;
  outcome: string;
  items: number;
  input: Record<string, unknown>;
  trace: { tool: string; ms: number; rows?: number; source?: string; cypher?: string; args?: Record<string, unknown> }[];
  highlight: string[];
}

export interface GraphViewResponse {
  view: GraphView;
  nodes: GraphViewNode[];
  links: GraphViewLink[];
  runs: AgentRunView[];
}

const parse = <T,>(s: string | null | undefined, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};

/**
 * GET /api/graph/[workspaceId]?view=team|focus|provenance&paperId=&runId=
 * Three focused views rather than one hairball:
 *  - team:       collaborators, their papers, and the papers that bridge their libraries
 *  - focus:      one paper's citation neighbourhood, with owners (radial)
 *  - provenance: exactly the nodes an agent run used, and the citations between them
 */
export async function GET(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const access = await requireWorkspaceMember(workspaceId);
  if ("error" in access) return access.error;
  const sp = new URL(req.url).searchParams;
  const view = (sp.get("view") ?? "team") as GraphView;

  const graph = await getWorkspaceGraph(workspaceId);
  const q = <T,>(cypher: string, p: Record<string, unknown> = {}) =>
    graph.roQuery<T>(cypher, { params: p as never }).then((r) => (r.data ?? []) as T[]);

  const [team, runRows] = await Promise.all([
    q<{ userId: string; userName: string; paperId: string; title: string; year: number | null; chunks: number }>(VIEW_TEAM),
    q<{ id: string; agent: string; at: number; ms: number; outcome: string; items: number; input: string; trace: string; highlight: string[] }>(
      RECENT_RUNS,
      { limit: 25 },
    ),
  ]);
  const runs: AgentRunView[] = runRows.map((r) => ({ ...r, input: parse(r.input, {}), trace: parse(r.trace, []), highlight: r.highlight ?? [] }));

  const ownersOf = new Map<string, string[]>();
  const users = new Map<string, string>();
  const teamPaper = new Map<string, { title: string; year: number | null; chunks: number }>();
  for (const r of team) {
    users.set(r.userId, r.userName);
    ownersOf.set(r.paperId, [...new Set([...(ownersOf.get(r.paperId) ?? []), r.userId])]);
    teamPaper.set(r.paperId, { title: r.title, year: r.year, chunks: r.chunks });
  }

  const nodes = new Map<string, GraphViewNode>();
  const links: GraphViewLink[] = [];
  const addUser = (id: string) => !nodes.has(id) && nodes.set(id, { id, kind: "user", label: users.get(id) ?? "Collaborator" });
  /** Add a paper; team papers also get their owners and IMPORTED links. */
  const addPaper = (id: string, title: string, year: number | null, extra: Partial<GraphViewNode> = {}) => {
    if (nodes.has(id)) return;
    const owners = ownersOf.get(id);
    nodes.set(id, {
      id,
      kind: owners ? "paper" : "frontier",
      label: title,
      year,
      owners,
      chunks: teamPaper.get(id)?.chunks,
      ...extra,
    });
    owners?.forEach((u) => {
      addUser(u);
      links.push({ source: u, target: id, kind: "imported" });
    });
  };

  if (view === "focus") {
    const paperId = sp.get("paperId") ?? "";
    const [center] = await q<{ paperId: string; title: string; year: number | null }>(VIEW_PAPERS_BY_ID, { ids: [paperId] });
    if (!center) return NextResponse.json({ error: "Paper not found in the graph" }, { status: 404 });
    addPaper(center.paperId, center.title, center.year, { center: true });
    const [neighbours, asked] = await Promise.all([
      q<{ paperId: string; title: string; year: number | null; outgoing: boolean }>(VIEW_FOCUS, { paperId, limit: 40 }),
      questionsAboutPaper(workspaceId, paperId),
    ]);
    if (asked.length) nodes.get(paperId)!.asked = asked.map((a) => ({ text: a.text, byName: a.byName, at: a.at }));
    for (const n of neighbours) {
      addPaper(n.paperId, n.title, n.year, { citedByCenter: n.outgoing });
      links.push(n.outgoing ? { source: paperId, target: n.paperId, kind: "cites" } : { source: n.paperId, target: paperId, kind: "cites" });
    }
  } else if (view === "provenance") {
    const run = runs.find((r) => r.id === sp.get("runId"));
    const ids = run?.highlight ?? [];
    const [papers, notes] = await Promise.all([
      q<{ paperId: string; title: string; year: number | null }>(VIEW_PAPERS_BY_ID, { ids }),
      q<{ id: string; label: string; kind: "idea" | "memory" | "question"; status: string; papers: string[] }>(VIEW_NOTES_BY_ID, { ids }),
    ]);
    papers.forEach((p) => addPaper(p.paperId, p.title, p.year));
    for (const n of notes) {
      nodes.set(n.id, { id: n.id, kind: n.kind, label: n.label, status: n.status });
      n.papers
        .filter((p) => nodes.has(p))
        .forEach((p) => links.push({ source: n.id, target: p, kind: n.kind === "idea" ? "grounded" : "about", suggested: n.status === "suggested" }));
    }
    // When the run was triggered from the team chat, show the question that started it
    const question = run ? await questionForRun(workspaceId, run.id) : null;
    if (question && !nodes.has(question.id)) {
      nodes.set(question.id, { id: question.id, kind: "question", label: question.text, byName: question.byName });
      question.papers.filter((p) => nodes.has(p)).forEach((p) => links.push({ source: question.id, target: p, kind: "about" }));
    }
  } else {
    for (const [id, p] of teamPaper) addPaper(id, p.title, p.year);
    const bridges = await q<{ paperId: string; title: string; year: number | null; owners: number }>(VIEW_BRIDGES, { limit: 30 });
    bridges.forEach((b) => addPaper(b.paperId, b.title, b.year, { bridges: b.owners }));
  }

  // Citations among everything shown
  const paperIds = [...nodes.values()].filter((n) => n.kind === "paper" || n.kind === "frontier").map((n) => n.id);
  const seen = new Set(links.filter((l) => l.kind === "cites").map((l) => `${l.source}>${l.target}`));
  for (const c of await q<{ source: string; target: string }>(VIEW_CITES, { ids: paperIds })) {
    if (seen.has(`${c.source}>${c.target}`)) continue;
    // Team map / focus: only citations that touch a team paper; outside↔outside links are noise there
    // (provenance keeps them — they are the chain the agent walked)
    if (view !== "provenance" && !teamPaper.has(c.source) && !teamPaper.has(c.target)) continue;
    links.push({ source: c.source, target: c.target, kind: "cites" });
  }

  return NextResponse.json({ view, nodes: [...nodes.values()], links, runs } satisfies GraphViewResponse);
}
