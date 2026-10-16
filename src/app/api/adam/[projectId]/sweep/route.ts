import { RINGS, type Ring, type TriageLabel } from "@/lib/adam/agents/searcher";
import { getCoverage } from "@/lib/adam/coverage";
import { emit } from "@/lib/adam/events";
import * as jobs from "@/lib/adam/jobs";
import { PRIORITY } from "@/lib/adam/orchestrator";
import { SET_TRIAGE_LABEL, TRIAGED_PAPERS } from "@/lib/adam/queries";
import { NextResponse } from "next/server";
import { readBody, requireProject } from "../../_access";

export const runtime = "nodejs";

type Params = { params: Promise<{ projectId: string }> };

export interface SweepPaper {
  paperId: string;
  pgPaperId: string | null;
  title: string;
  year: number | null;
  venue: string | null;
  citationCount: number;
  doi: string | null;
  arxivId: string | null;
  label: TriageLabel;
  agentLabel: TriageLabel | null;
  userLabel: "trusted" | "distrusted" | null;
  ring: Ring;
  via: string;
  clusterId: string | null;
  confidence: number;
  reason: string | null;
  decidedBy: string | null;
  at: number;
  nodesNew: number;
  nodesReused: number;
  accessStatus: "full_text" | "abstract_only" | "unavailable" | "unknown";
  chunks: number;
  chunkSchema: number;
  fullTextState: string | null;
  ingestState: string | null;
  adamState: string | null;
}

/** GET /api/adam/[projectId]/sweep?workspaceId= — triaged papers, coverage, and the rings' job state. */
export async function GET(req: Request, { params }: Params) {
  const { projectId } = await params;
  const access = await requireProject(req, projectId);
  if ("error" in access) return access.error;
  const [papers, coverage, ringJobs] = await Promise.all([
    access.graph.roQuery<SweepPaper>(TRIAGED_PAPERS, { params: { projectId } as never }).then((r) => r.data ?? []),
    getCoverage(access.graph, projectId),
    jobs.byKindAndStatus(access.graph, projectId, ["search_ring"], ["queued", "running", "done", "failed"]),
  ]);
  const rings = RINGS.map((ring) => {
    const js = ringJobs.filter((j) => j.payload.ring === ring && Number(j.payload.pass) === access.project.pass);
    const latest = js.sort((a, b) => Number(b.payload.round ?? 1) - Number(a.payload.round ?? 1))[0];
    return { ring, status: latest?.status ?? null, round: latest ? Number(latest.payload.round ?? 1) : 0, result: latest?.result ?? null, error: latest?.error ?? null };
  });
  return NextResponse.json({ papers, coverage, rings });
}

/** PATCH /api/adam/[projectId]/sweep { workspaceId, paperId, label?, userLabel? } — the researcher relabels a paper. */
export async function PATCH(req: Request, { params }: Params) {
  const { projectId } = await params;
  const body = await readBody<{ workspaceId?: string; paperId?: string; label?: TriageLabel; userLabel?: "trusted" | "distrusted" }>(req);
  const access = await requireProject(req, projectId, body);
  if ("error" in access) return access.error;
  if (!body.paperId) return NextResponse.json({ error: "paperId is required" }, { status: 400 });
  const res = await access.graph.query<{ label: string }>(SET_TRIAGE_LABEL, {
    params: { projectId, paperId: body.paperId, label: body.label ?? null, userLabel: body.userLabel ?? null, userId: access.userId, at: Date.now() } as never,
  });
  if (!res.data?.length) return NextResponse.json({ error: "paper is not in this project's sweep" }, { status: 404 });
  await emit(access.graph, projectId, "triage_changed", { paperId: body.paperId, label: body.label ?? null, userLabel: body.userLabel ?? null, by: access.userId });
  return NextResponse.json({ label: res.data[0].label });
}

/** POST /api/adam/[projectId]/sweep { workspaceId, ring } — run a ring again by hand (a new round). */
export async function POST(req: Request, { params }: Params) {
  const { projectId } = await params;
  const body = await readBody<{ workspaceId?: string; ring?: Ring }>(req);
  const access = await requireProject(req, projectId, body);
  if ("error" in access) return access.error;
  if (!body.ring || !RINGS.includes(body.ring)) return NextResponse.json({ error: "ring must be seed, citation or adjacent" }, { status: 400 });
  const existing = await jobs.byKindAndStatus(access.graph, projectId, ["search_ring"], ["queued", "running", "done", "failed"]);
  const round = existing.filter((j) => j.payload.ring === body.ring && Number(j.payload.pass) === access.project.pass).length + 1;
  const job = await jobs.enqueue(access.graph, {
    projectId,
    kind: "search_ring",
    subject: `${body.ring} · round ${round} · pass ${access.project.pass}`,
    payload: { ring: body.ring, round, pass: access.project.pass },
    priority: PRIORITY.search_ring,
    dedupeKey: `search_ring:${projectId}:${access.project.pass}:${body.ring}:${round}`,
    maxAttempts: 2,
  });
  await emit(access.graph, projectId, "job_requested", { kind: "search_ring", subject: body.ring, by: access.userId, created: job.created });
  return NextResponse.json({ job, round });
}
