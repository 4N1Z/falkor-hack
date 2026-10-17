// Read-only MCP server over the research graph, so Claude Desktop / Claude Code / Cursor can
// ask the same questions the agents do. Streamable HTTP transport, stateless: every POST is
// one JSON-RPC message answered with plain JSON. Tools are fixed, parameterised Cypher
// templates (never free-form queries) and nothing writes to the graph.
//
//   claude mcp add --transport http neura http://localhost:3000/api/mcp \
//     --header "Authorization: Bearer $MCP_TOKEN"

import { timingSafeEqual } from "crypto";
import { timeline } from "@/lib/agents/historian";
import { getFalkor, getWorkspaceGraph } from "@/lib/graph/client";
import {
  BRIDGE_PAPERS,
  CITATION_PATH,
  FIND_PAPERS_BY_TITLE,
  GRAPH_STATS,
  IMPORTS_PER_USER,
  INFLUENTIAL_UNREAD,
  LITERATURE_GAPS,
  VIEW_FOCUS,
} from "@/lib/graph/queries";
import { searchTeamLibrary } from "@/lib/graph/team-search";
import { hypothesisQuery } from "@/lib/adam/hypothesis-query";
import { getProject, listProjects } from "@/lib/adam/project";
import { METHODS_DOSSIER } from "@/lib/adam/queries-methods";
import { PAPER_CLAIMS } from "@/lib/adam/queries-review";
import { OPEN_QUESTIONS } from "@/lib/adam/queries-saturation";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const PROTOCOL = "2025-06-18";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Json = Record<string, unknown>;
interface Tool {
  description: string;
  properties: Record<string, { type: string; description: string }>;
  required: string[];
  run: (args: Json) => Promise<unknown>;
}

const ws = { type: "string", description: "Workspace id (from list_workspaces)" };
const str = (v: unknown, max = 500) => (typeof v === "string" ? v.slice(0, max) : "");
async function graphFor(args: Json) {
  const id = str(args.workspaceId);
  if (!UUID.test(id)) throw new Error("workspaceId must be a workspace id from list_workspaces");
  return getWorkspaceGraph(id);
}
async function ro<T>(args: Json, cypher: string, params: Json = {}) {
  const g = await graphFor(args);
  return ((await g.roQuery<T>(cypher, { params: params as never })).data ?? []) as T[];
}

const TOOLS: Record<string, Tool> = {
  list_workspaces: {
    description: "List the research workspaces in this Neura Query instance, with how many papers each graph holds.",
    properties: {},
    required: [],
    run: async () => {
      const names = (await (await getFalkor()).list()).filter((n) => n.startsWith("ws:"));
      return Promise.all(
        names.map(async (n) => {
          const workspaceId = n.slice(3);
          const [stats] = await ro<Json>({ workspaceId }, GRAPH_STATS);
          const people = await ro<Json>({ workspaceId }, IMPORTS_PER_USER);
          return { workspaceId, ...stats, collaborators: people };
        }),
      );
    },
  },
  search_team_library: {
    description:
      "Search the papers the team has imported (title, abstract and full-text passages; hybrid vector + keyword). Returns who owns each paper and the best matching passage.",
    properties: { workspaceId: ws, query: { type: "string", description: "Topic, claim or question" }, limit: { type: "number", description: "Max results (default 8)" } },
    required: ["workspaceId", "query"],
    run: async (a) => {
      await graphFor(a);
      const found = await searchTeamLibrary(str(a.workspaceId), str(a.query, 1500), { limit: Math.min(Number(a.limit) || 8, 20) });
      return found.map((p) => ({
        paperId: p.paperId,
        title: p.title,
        year: p.year,
        authors: p.authors.slice(0, 6),
        owners: p.owners,
        doi: p.doi,
        passage: p.passage?.text.replace(/\s+/g, " ").slice(0, 600) ?? null,
      }));
    },
  },
  find_papers: {
    description: "Find papers in the graph (library or cited) whose title contains the given text, to get their ids.",
    properties: { workspaceId: ws, title: { type: "string", description: "Part of the title" } },
    required: ["workspaceId", "title"],
    run: (a) => ro(a, FIND_PAPERS_BY_TITLE, { q: str(a.title, 200) }),
  },
  paper_neighbourhood: {
    description: "Papers that a given paper cites and that cite it, within the team's graph (library papers first).",
    properties: { workspaceId: ws, paperId: { type: "string", description: "Paper id (OpenAlex W…)" } },
    required: ["workspaceId", "paperId"],
    run: (a) => ro(a, VIEW_FOCUS, { paperId: str(a.paperId, 100), limit: 40 }),
  },
  citation_path: {
    description: "Shortest citation chain between two papers (either direction), e.g. to explain how two lines of work connect.",
    properties: { workspaceId: ws, fromPaperId: { type: "string", description: "Paper id" }, toPaperId: { type: "string", description: "Paper id" } },
    required: ["workspaceId", "fromPaperId", "toPaperId"],
    run: async (a) => (await ro(a, CITATION_PATH, { a: str(a.fromPaperId, 100), b: str(a.toPaperId, 100) }))[0] ?? { path: null, note: "No citation path within 5 hops" },
  },
  research_frontier: {
    description:
      "Where the team's research could go next: concepts the surrounding literature covers but the team's papers don't, papers that bridge several collaborators' libraries, and the most central papers nobody has imported (PageRank).",
    properties: { workspaceId: ws },
    required: ["workspaceId"],
    run: async (a) => {
      const [gaps, bridges, influential] = await Promise.all([
        ro(a, LITERATURE_GAPS),
        ro(a, BRIDGE_PAPERS),
        ro(a, INFLUENTIAL_UNREAD, { sinceYear: 2019 }),
      ]);
      return { gaps, bridges, influential };
    },
  },
  adam_projects: {
    description: "Adam research projects in a workspace: phase, status, pass, and what gate (if any) is waiting on a person.",
    properties: { workspaceId: ws },
    required: ["workspaceId"],
    run: async (a) => {
      await graphFor(a);
      return (await listProjects(str(a.workspaceId))).map((p) => ({ projectId: p.id, title: p.title, topic: p.topic.slice(0, 300), phase: p.phase, status: p.status, pass: p.pass, gate: p.gate, llmCalls: p.spent.llmCalls }));
    },
  },
  paper_claims: {
    description: "The verified claims Adam extracted from one paper, each with its page, section, conditions and the quoted passage, plus the methods each claim used.",
    properties: { workspaceId: ws, paperId: { type: "string", description: "Paper id (OpenAlex W…)" } },
    required: ["workspaceId", "paperId"],
    run: (a) => ro(a, PAPER_CLAIMS, { paperId: str(a.paperId, 100) }),
  },
  methods_dossier: {
    description: "Adam's methods dossier for a project: each technique the literature uses, its filled-in procedure (inputs, outputs, steps, equipment, time, cost), whether a lab could run it as written, and what is still missing.",
    properties: { workspaceId: ws, projectId: { type: "string", description: "Project id (from adam_projects)" } },
    required: ["workspaceId", "projectId"],
    run: async (a) => (await ro<Json>(a, METHODS_DOSSIER, { projectId: str(a.projectId, 100) })).map((m) => ({ ...m, sources: undefined })),
  },
  open_questions: {
    description: "Gaps Adam found for a project: steps no procedure exists for, things papers say nobody has tested, and untested assumptions many claims depend on.",
    properties: { workspaceId: ws, projectId: { type: "string", description: "Project id (from adam_projects)" } },
    required: ["workspaceId", "projectId"],
    run: (a) => ro(a, OPEN_QUESTIONS, { projectId: str(a.projectId, 100) }),
  },
  hypothesis_query: {
    description:
      "Hypothesis as a query: state a hypothesis and get, from the graph of known steps, the evidence for and against it, the conditions under which it should hold or fail, the candidate chains of procedures that could test it (with each step's status), the gaps, rival chains, and the cheapest chain whose failure would kill it.",
    properties: { workspaceId: ws, projectId: { type: "string", description: "Project id (from adam_projects); the latest project when omitted" }, hypothesis: { type: "string", description: "The hypothesis, a sentence or two" } },
    required: ["workspaceId", "hypothesis"],
    run: async (a) => {
      const g = await graphFor(a);
      const projects = await listProjects(str(a.workspaceId));
      const project = (a.projectId ? await getProject(g, str(a.projectId, 100)) : projects[0]) ?? null;
      if (!project) throw new Error("No Adam project in this workspace yet");
      const r = await hypothesisQuery(g, str(a.workspaceId), project, { text: str(a.hypothesis, 2000) });
      return { ...r, chains: r.chains.slice(0, 5), rivals: r.rivals.slice(0, 3) };
    },
  },
  team_memory: {
    description: "The team's research notebook over time: hypotheses (active or dropped, with the reason), findings and open questions.",
    properties: { workspaceId: ws, limit: { type: "number", description: "Max entries (default 30)" } },
    required: ["workspaceId"],
    run: async (a) => {
      await graphFor(a);
      return (await timeline(str(a.workspaceId), Math.min(Number(a.limit) || 30, 100))).map((m) => ({
        kind: m.kind,
        status: m.status,
        text: m.text,
        by: m.byName,
        since: new Date(m.validFrom).toISOString().slice(0, 10),
        reason: m.reason ?? null,
      }));
    },
  },
};

function authorized(req: Request) {
  const token = process.env.MCP_TOKEN;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token || got.length !== token.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(token));
}

const result = (id: unknown, r: unknown) => NextResponse.json({ jsonrpc: "2.0", id, result: r });
const failure = (id: unknown, code: number, message: string) => NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } });

export async function POST(req: Request) {
  if (!process.env.MCP_TOKEN) return NextResponse.json({ error: "MCP is disabled: set MCP_TOKEN" }, { status: 503 });
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const msg = (await req.json().catch(() => null)) as { id?: unknown; method?: string; params?: Json } | null;
  if (!msg || typeof msg.method !== "string") return failure(null, -32700, "Parse error");
  // Notifications (no id) need no response body
  if (msg.id === undefined) return new NextResponse(null, { status: 202 });

  switch (msg.method) {
    case "initialize":
      return result(msg.id, {
        protocolVersion: PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: "neura-query-graph", version: "1.0.0" },
        instructions:
          "Read-only access to a research team's FalkorDB graph: their imported papers, citations, collaborators and research notebook. Start with list_workspaces.",
      });
    case "ping":
      return result(msg.id, {});
    case "tools/list":
      return result(msg.id, {
        tools: Object.entries(TOOLS).map(([name, t]) => ({
          name,
          description: t.description,
          inputSchema: { type: "object", properties: t.properties, required: t.required },
          annotations: { readOnlyHint: true },
        })),
      });
    case "tools/call": {
      const name = str(msg.params?.name, 100);
      const tool = TOOLS[name];
      if (!tool) return failure(msg.id, -32602, `Unknown tool: ${name}`);
      try {
        const out = await tool.run((msg.params?.arguments as Json) ?? {});
        return result(msg.id, { content: [{ type: "text", text: JSON.stringify(out, null, 1) }] });
      } catch (err) {
        return result(msg.id, { content: [{ type: "text", text: err instanceof Error ? err.message : "Tool failed" }], isError: true });
      }
    }
    default:
      return failure(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

/** No server-initiated stream: this server is stateless. */
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
