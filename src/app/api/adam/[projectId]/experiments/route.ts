import { emit } from "@/lib/adam/events";
import { hypothesisQuery, type HypothesisQueryResult } from "@/lib/adam/hypothesis-query";
import * as jobs from "@/lib/adam/jobs";
import { PRIORITY } from "@/lib/adam/orchestrator";
import { PLANS } from "@/lib/adam/queries-experiments";
import { parseJson } from "@/lib/adam/types";
import { NextResponse } from "next/server";
import { readBody, requireProject } from "../../_access";

export const runtime = "nodejs";
export const maxDuration = 120;

type Params = { params: Promise<{ projectId: string }> };

export interface PlanView {
  id: string;
  hypothesisId: string;
  statement: string;
  hypothesisStatus: string;
  steps: { procedureId: string | null; name: string; purpose: string; status: string; gap: boolean; control: string | null }[];
  controls: { rival: string; control: string }[];
  rationale: string;
  killTest: string;
  costToKill: number;
  rank: number;
  designCheck: { passes?: boolean; issues?: string[]; note?: string };
  designPasses: boolean;
  state: string;
  approvedBy: string | null;
  approvedAt: number | null;
  version: number;
  createdAt: number;
}

/** GET /api/adam/[projectId]/experiments?workspaceId= — the experiment plans. */
export async function GET(req: Request, { params }: Params) {
  const { projectId } = await params;
  const access = await requireProject(req, projectId);
  if ("error" in access) return access.error;
  const rows = (await access.graph.roQuery<Omit<PlanView, "steps" | "controls" | "designCheck"> & { steps: string; controls: string; designCheck: string }>(PLANS, { params: { projectId } as never })).data ?? [];
  const plans: PlanView[] = rows.map((r) => ({ ...r, steps: parseJson(r.steps, []), controls: parseJson(r.controls, []), designCheck: parseJson(r.designCheck, {}) }));
  return NextResponse.json({ plans });
}

/**
 * POST /api/adam/[projectId]/experiments
 *   { workspaceId, query: "<hypothesis text>", hypothesisId? }   hypothesis as a query (synchronous)
 *   { workspaceId, redesign: "<hypothesisId>" }                  run the Designer again for a brief
 */
export async function POST(req: Request, { params }: Params) {
  const { projectId } = await params;
  const body = await readBody<{ workspaceId?: string; query?: string; hypothesisId?: string; redesign?: string }>(req);
  const access = await requireProject(req, projectId, body);
  if ("error" in access) return access.error;
  if (body.redesign) {
    const job = await jobs.enqueue(access.graph, { projectId, kind: "design_experiment", subject: body.redesign, payload: { hypothesisId: body.redesign, rank: 1 }, priority: PRIORITY.design_experiment, dedupeKey: `design_experiment:${projectId}:${body.redesign}:manual-${Date.now()}`, maxAttempts: 2 });
    await emit(access.graph, projectId, "job_requested", { kind: "design_experiment", subject: body.redesign, by: access.userId, created: job.created });
    return NextResponse.json({ job });
  }
  const text = (body.query ?? "").trim();
  if (text.length < 12) return NextResponse.json({ error: "Type a hypothesis (a sentence or two)" }, { status: 400 });
  try {
    const result: HypothesisQueryResult = await hypothesisQuery(access.graph, access.workspaceId, access.project, { text, hypothesisId: body.hypothesisId ?? null, userId: access.userId });
    await emit(access.graph, projectId, "hypothesis_queried", { text: text.slice(0, 200), chains: result.chains.length, rivals: result.rivals.length, gaps: result.gaps.length, by: access.userId });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "query failed" }, { status: 500 });
  }
}
