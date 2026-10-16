// The human gates (spec: "Three mandatory gates"). Agents cannot pass these; a person
// decides, the decision is recorded on the node, and the orchestrator resumes.

import { emit } from "@/lib/adam/events";
import { startProject } from "@/lib/adam/orchestrator";
import { approveQuestionPage } from "@/lib/adam/question-page";
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
    case "select":
    case "kill":
    case "plan":
      return NextResponse.json({ error: `gate ${body.gate} is not open for this project yet (phase ${project.phase})` }, { status: 409 });
    default:
      return NextResponse.json({ error: "gate must be scope, select, kill or plan" }, { status: 400 });
  }
}
