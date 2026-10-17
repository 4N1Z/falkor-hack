import { emit } from "@/lib/adam/events";
import * as jobs from "@/lib/adam/jobs";
import { PRIORITY } from "@/lib/adam/orchestrator";
import { METHODS_DOSSIER, SET_METHOD_HUNT_NOTE } from "@/lib/adam/queries-methods";
import { NextResponse } from "next/server";
import { readBody, requireProject } from "../../_access";

export const runtime = "nodejs";

type Params = { params: Promise<{ projectId: string }> };

export interface DossierRow {
  id: string;
  name: string;
  aliases: string[];
  state: string;
  claims: number;
  papers: number;
  dependents: number;
  loadBearing: boolean;
  chainsNeeding: number;
  huntedAt: number | null;
  procedureId: string | null;
  procedureName: string | null;
  runnability: "runnable" | "partial" | "unknown" | null;
  runnabilityNote: string | null;
  feasibility: string | null;
  feasibilityNote: string | null;
  missing: string[];
  inputs: string[];
  outputs: string[];
  equipment: string[];
  timeHours: number | null;
  costUsd: number | null;
  reliability: number | null;
  steps: string[];
  sources: string;
  procedureState: string | null;
  expected: string | null;
}

/** GET /api/adam/[projectId]/methods?workspaceId= — the methods dossier. */
export async function GET(req: Request, { params }: Params) {
  const { projectId } = await params;
  const access = await requireProject(req, projectId);
  if ("error" in access) return access.error;
  const rows = (await access.graph.roQuery<DossierRow>(METHODS_DOSSIER, { params: { projectId } as never })).data ?? [];
  return NextResponse.json({ methods: rows });
}

/** POST /api/adam/[projectId]/methods { workspaceId, methodId, note? } — hunt a method (again), with a note. */
export async function POST(req: Request, { params }: Params) {
  const { projectId } = await params;
  const body = await readBody<{ workspaceId?: string; methodId?: string; note?: string }>(req);
  const access = await requireProject(req, projectId, body);
  if ("error" in access) return access.error;
  if (!body.methodId) return NextResponse.json({ error: "methodId is required" }, { status: 400 });
  if (body.note) await access.graph.query(SET_METHOD_HUNT_NOTE, { params: { id: body.methodId, note: body.note } as never });
  const job = await jobs.enqueue(access.graph, {
    projectId,
    kind: "hunt_method",
    subject: body.methodId,
    payload: { methodId: body.methodId, note: body.note ?? "" },
    priority: PRIORITY.hunt_method,
    dedupeKey: `hunt_method:${projectId}:${body.methodId}:manual-${Date.now()}`,
    maxAttempts: 2,
  });
  await emit(access.graph, projectId, "job_requested", { kind: "hunt_method", subject: body.methodId, by: access.userId, created: job.created, note: body.note ?? "" });
  return NextResponse.json({ job });
}
