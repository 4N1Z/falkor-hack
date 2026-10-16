// The human gates (spec: "Three mandatory gates"). Agents cannot pass these; a person
// decides, the decision is recorded on the node, and the orchestrator resumes.

import { emit } from "@/lib/adam/events";
import { startProject } from "@/lib/adam/orchestrator";
import { approveQuestionPage } from "@/lib/adam/question-page";
import { SELECT_BRIEFS, SIGN_KILL_CRITERIA } from "@/lib/adam/queries-hypotheses";
import { APPROVE_PLAN } from "@/lib/adam/queries-experiments";
import type { Gate } from "@/lib/adam/types";
import { NextResponse } from "next/server";
import { readBody, requireProject } from "../../_access";

export const runtime = "nodejs";

/**
 * POST /api/adam/[projectId]/gate { workspaceId, gate, ... }
 *  - scope:  approve the Question page for this pass (gate 1)
 *  - select: { hypothesisIds }   choose which briefs to pursue (gate 2)
 *  - kill:   { hypothesisId, killCriteria }   sign the kill criteria (gate 3)
 *  - plan:   { planId }   approve an experiment plan
 */
export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const body = await readBody<{ workspaceId?: string; gate?: Gate } & Record<string, unknown>>(req);
  const access = await requireProject(req, projectId, body);
  if ("error" in access) return access.error;
  const { graph, project, userId } = access;

  switch (body.gate) {
    case "scope": {
      const page = await approveQuestionPage(graph, projectId, project.pass, userId);
      if (!page) return NextResponse.json({ error: "No question page to approve" }, { status: 404 });
      await emit(graph, projectId, "gate_passed", { gate: "scope", pass: project.pass, by: userId });
      const resumed = await startProject(graph, access.workspaceId, projectId);
      return NextResponse.json({ page, project: resumed });
    }
    case "select": {
      const ids = Array.isArray(body.hypothesisIds) ? (body.hypothesisIds as string[]).filter((x) => typeof x === "string") : [];
      if (!ids.length) return NextResponse.json({ error: "Select at least one hypothesis" }, { status: 400 });
      await graph.query(SELECT_BRIEFS, { params: { projectId, pass: project.pass, ids, userId, at: Date.now() } as never });
      await emit(graph, projectId, "gate_passed", { gate: "select", pass: project.pass, by: userId, hypothesisIds: ids });
      const resumed = await startProject(graph, access.workspaceId, projectId);
      return NextResponse.json({ selected: ids, project: resumed });
    }
    case "kill": {
      const id = typeof body.hypothesisId === "string" ? body.hypothesisId : null;
      if (!id) return NextResponse.json({ error: "hypothesisId is required" }, { status: 400 });
      const kill = typeof body.killCriteria === "string" && body.killCriteria.trim().length > 10 ? body.killCriteria.trim() : null;
      await graph.query(SIGN_KILL_CRITERIA, { params: { id, killCriteria: kill, userId, at: Date.now() } as never });
      await emit(graph, projectId, "gate_passed", { gate: "kill", hypothesisId: id, by: userId });
      const resumed = await startProject(graph, access.workspaceId, projectId);
      return NextResponse.json({ signed: id, project: resumed });
    }
    case "plan": {
      const id = typeof body.planId === "string" ? body.planId : null;
      if (!id) return NextResponse.json({ error: "planId is required" }, { status: 400 });
      const r = await graph.query<{ id: string; hypothesisId: string }>(APPROVE_PLAN, { params: { id, projectId, userId, at: Date.now() } as never });
      if (!r.data?.length) return NextResponse.json({ error: "plan not found" }, { status: 404 });
      await emit(graph, projectId, "gate_passed", { gate: "plan", planId: id, hypothesisId: r.data[0].hypothesisId, by: userId });
      const resumed = await startProject(graph, access.workspaceId, projectId);
      return NextResponse.json({ approved: id, project: resumed });
    }
    default:
      return NextResponse.json({ error: "gate must be scope, select, kill or plan" }, { status: 400 });
  }
}
