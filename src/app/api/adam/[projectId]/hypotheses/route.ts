import { emit } from "@/lib/adam/events";
import * as jobs from "@/lib/adam/jobs";
import { PRIORITY } from "@/lib/adam/orchestrator";
import { CANDIDATES } from "@/lib/adam/queries-analyst";
import { ATTACKS_FOR, BRIEF_EVIDENCE, BRIEF_SUPPORTS, BRIEFS, DECIDE_ATTACK, DROP_BRIEF, EDIT_BRIEF } from "@/lib/adam/queries-hypotheses";
import { parseJson } from "@/lib/adam/types";
import { NextResponse } from "next/server";
import { readBody, requireProject } from "../../_access";

export const runtime = "nodejs";

type Params = { params: Promise<{ projectId: string }> };

export interface BriefView {
  id: string;
  pass: number;
  version: number;
  statement: string;
  mechanism: string;
  boundaryHolds: string[];
  boundaryFails: string[];
  predictionIfTrue: string;
  predictionIfFalse: string;
  procedureHint: string;
  killCriteria: string;
  ready: boolean;
  status: "draft" | "selected" | "attacked" | "killed" | "survived";
  state: string;
  stateReason: string;
  confidence: number;
  selectedBy: string | null;
  selectedAt: number | null;
  killSignedBy: string | null;
  killSignedAt: number | null;
  convergenceRounds: number;
  decidedBy: string | null;
  createdAt: number;
  minimumExperiment: string | null;
  costToKill: number;
  evidence: { type: string; id: string; text: string; paper: string; year: number; page: number; section: string; state: string; conditions: string[]; speculative: boolean }[];
  supports: { type: string; label: string; id: string; text: string; dependents: number; loadBearing: boolean; kind: string }[];
  attacks: { id: string; kind: string; text: string; answer: string; status: string; round: number; cites: string[]; control: string; killCriterion: string; createdAt: number; decidedBy: string | null }[];
}

export interface CandidateView {
  id: string;
  kind: "hole" | "conflict" | "load_bearing";
  summary: string;
  detail: Record<string, unknown>;
  score: number;
  sane: boolean;
  saneReason: string;
  state: string;
  pass: number;
}

/** GET /api/adam/[projectId]/hypotheses?workspaceId= — candidates, briefs with evidence and the attack log. */
export async function GET(req: Request, { params }: Params) {
  const { projectId } = await params;
  const access = await requireProject(req, projectId);
  if ("error" in access) return access.error;
  const g = access.graph;
  const p = <T>(x: T) => ({ params: x as never });
  const [briefRows, candRows] = await Promise.all([
    g.roQuery<Omit<BriefView, "evidence" | "supports" | "attacks">>(BRIEFS, p({ projectId })).then((r) => r.data ?? []),
    g.roQuery<Omit<CandidateView, "detail"> & { detail: string }>(CANDIDATES, p({ projectId })).then((r) => r.data ?? []),
  ]);
  const briefs: BriefView[] = await Promise.all(
    briefRows.map(async (b) => {
      const [evidence, supports, attacks] = await Promise.all([
        g.roQuery<BriefView["evidence"][number]>(BRIEF_EVIDENCE, p({ id: b.id })).then((r) => r.data ?? []),
        g.roQuery<BriefView["supports"][number]>(BRIEF_SUPPORTS, p({ id: b.id })).then((r) => r.data ?? []),
        g.roQuery<BriefView["attacks"][number]>(ATTACKS_FOR, p({ id: b.id })).then((r) => r.data ?? []),
      ]);
      return { ...b, evidence, supports, attacks };
    }),
  );
  const candidates: CandidateView[] = candRows.map((c) => ({ ...c, detail: parseJson(c.detail, {}) }));
  return NextResponse.json({ briefs, candidates });
}

/**
 * PATCH /api/adam/[projectId]/hypotheses
 *   { workspaceId, id, statement?, mechanism?, boundaryHolds?, boundaryFails?, killCriteria? }   researcher edits a brief
 *   { workspaceId, attackId, status: answered|open|fatal, answer? }                                researcher decides an attack
 *   { workspaceId, id, drop: true, reason }                                                       researcher drops a brief
 */
export async function PATCH(req: Request, { params }: Params) {
  const { projectId } = await params;
  const body = await readBody<Record<string, unknown>>(req);
  const access = await requireProject(req, projectId, body);
  if ("error" in access) return access.error;
  const at = Date.now();
  const p = <T>(x: T) => ({ params: x as never });
  if (typeof body.attackId === "string") {
    const status = String(body.status ?? "");
    if (!["answered", "open", "fatal"].includes(status)) return NextResponse.json({ error: "status must be answered, open or fatal" }, { status: 400 });
    const r = await access.graph.query<{ id: string; hypothesisId: string }>(DECIDE_ATTACK, p({ id: body.attackId, projectId, status, answer: (body.answer as string | undefined) ?? null, userId: access.userId, at }));
    if (!r.data?.length) return NextResponse.json({ error: "attack not found" }, { status: 404 });
    await emit(access.graph, projectId, "attack_decided", { attackId: body.attackId, status, by: access.userId });
    return NextResponse.json({ ok: true });
  }
  if (typeof body.id !== "string") return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (body.drop) {
    await access.graph.query(DROP_BRIEF, p({ id: body.id, reason: String(body.reason ?? "dropped by researcher"), userId: access.userId, at }));
    await emit(access.graph, projectId, "brief_dropped", { id: body.id, reason: body.reason ?? "", by: access.userId });
    return NextResponse.json({ ok: true });
  }
  await access.graph.query(
    EDIT_BRIEF,
    p({
      id: body.id,
      statement: (body.statement as string | undefined) ?? null,
      mechanism: (body.mechanism as string | undefined) ?? null,
      boundaryHolds: (body.boundaryHolds as string[] | undefined) ?? null,
      boundaryFails: (body.boundaryFails as string[] | undefined) ?? null,
      killCriteria: (body.killCriteria as string | undefined) ?? null,
      userId: access.userId,
      at,
    }),
  );
  await emit(access.graph, projectId, "brief_edited", { id: body.id, by: access.userId });
  return NextResponse.json({ ok: true });
}

/** POST /api/adam/[projectId]/hypotheses { workspaceId, rewrite: true } | { workspaceId, attack: hypothesisId } — run the Writer again, or one more attack round. */
export async function POST(req: Request, { params }: Params) {
  const { projectId } = await params;
  const body = await readBody<{ workspaceId?: string; rewrite?: boolean; attack?: string }>(req);
  const access = await requireProject(req, projectId, body);
  if ("error" in access) return access.error;
  if (body.rewrite) {
    const job = await jobs.enqueue(access.graph, { projectId, kind: "write_hypotheses", subject: `pass-${access.project.pass}`, payload: { pass: access.project.pass }, priority: PRIORITY.write_hypotheses, dedupeKey: `write_hypotheses:${projectId}:pass${access.project.pass}:manual-${Date.now()}`, maxAttempts: 2 });
    await emit(access.graph, projectId, "job_requested", { kind: "write_hypotheses", by: access.userId, created: job.created });
    return NextResponse.json({ job });
  }
  if (body.attack) {
    const brief = ((await access.graph.roQuery<{ id: string; convergenceRounds: number }>(BRIEFS, { params: { projectId } as never })).data ?? []).find((b) => b.id === body.attack);
    if (!brief) return NextResponse.json({ error: "brief not found" }, { status: 404 });
    const round = brief.convergenceRounds + 1;
    const job = await jobs.enqueue(access.graph, { projectId, kind: "falsify", subject: brief.id, payload: { hypothesisId: brief.id, round }, priority: PRIORITY.falsify, dedupeKey: `falsify:${projectId}:${brief.id}:r${round}:manual-${Date.now()}`, maxAttempts: 2 });
    await emit(access.graph, projectId, "job_requested", { kind: "falsify", subject: brief.id, by: access.userId, created: job.created });
    return NextResponse.json({ job, round });
  }
  return NextResponse.json({ error: "rewrite or attack is required" }, { status: 400 });
}
