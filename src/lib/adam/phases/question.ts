// Phase 0 · Question. Ends when the researcher approves the page (gate 1, mandatory).

import * as jobs from "../jobs";
import { PRIORITY, type PhaseStep } from "../orchestrator";
import { getQuestionPage } from "../question-page";

export const questionStep: PhaseStep = async ({ graph, project }) => {
  const page = await getQuestionPage(graph, project.id);
  if (page && page.pass === project.pass && page.approvedAt) return { enqueued: 0, advance: true };

  if (!page || page.pass < project.pass) {
    // No page for this pass yet: the Scoper writes one (deduped per pass)
    const { created } = await jobs.enqueue(graph, {
      projectId: project.id,
      kind: "scope",
      subject: `pass-${project.pass}`,
      priority: PRIORITY.scope,
      dedupeKey: `scope:${project.id}:${project.pass}`,
    });
    const running = await jobs.pending(graph, project.id, ["scope"]);
    return { enqueued: created ? 1 : 0, ...(running ? {} : { notes: ["Waiting for the Scoper"] }) };
  }
  // Page exists, not approved: the researcher decides (they can edit, send back, or approve)
  return { enqueued: 0, gate: "scope" };
};
