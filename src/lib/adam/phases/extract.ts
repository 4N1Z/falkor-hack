// Phase 2 · Extract. Every core, contradicting and method paper gets an extraction card
// (two independent cards for core and contradicting papers), then a verification. Ends when
// every such paper has a verified card for its current text version.

import * as jobs from "../jobs";
import { PRIORITY, type PhaseStep } from "../orchestrator";
import { PAPERS_TO_EXTRACT } from "../queries-extract";

interface Row {
  paperId: string;
  title: string;
  label: "core" | "contradicts" | "method_only";
  chunks: number;
  textVersion: number;
  hasAbstract: boolean;
  adamState: string | null;
}

export const extractStep: PhaseStep = async ({ graph, project }) => {
  const papers = (await graph.roQuery<Row>(PAPERS_TO_EXTRACT, { params: { projectId: project.id } as never })).data ?? [];
  const readable = papers.filter((p) => p.chunks > 0 || p.hasAbstract);
  if (!readable.length) return { enqueued: 0, advance: true, notes: ["No readable core, contradicting or method papers; nothing to extract"] };

  const existing = await jobs.byKindAndStatus(graph, project.id, ["extract_paper", "verify_card"], ["queued", "running", "done", "failed"]);
  const key = (kind: string, paperId: string, slot: string | null, v: number) => `${kind}:${project.id}:${paperId}:${slot ?? "-"}:v${v}`;
  const byKey = new Map(existing.map((j) => [j.dedupeKey, j]));

  let enqueued = 0;
  let pending = 0;
  let failed = 0;
  for (const p of readable) {
    const slots: ("a" | "b")[] = p.label === "method_only" ? ["a"] : ["a", "b"];
    const extractJobs = slots.map((s) => byKey.get(key("extract_paper", p.paperId, s, p.textVersion)));
    for (const [i, s] of slots.entries()) {
      if (!extractJobs[i]) {
        const { created } = await jobs.enqueue(graph, {
          projectId: project.id,
          kind: "extract_paper",
          subject: p.paperId,
          payload: { paperId: p.paperId, slot: s, title: p.title },
          priority: PRIORITY.extract_paper,
          dedupeKey: key("extract_paper", p.paperId, s, p.textVersion),
          maxAttempts: 2,
        });
        if (created) enqueued++;
        pending++;
      } else if (extractJobs[i]!.status === "queued" || extractJobs[i]!.status === "running") pending++;
      else if (extractJobs[i]!.status === "failed") failed++;
    }
    const extractsDone = extractJobs.every((j) => j && (j.status === "done" || j.status === "failed")) && extractJobs.some((j) => j?.status === "done");
    if (!extractsDone) continue;
    const verify = byKey.get(key("verify_card", p.paperId, null, p.textVersion));
    if (!verify) {
      const { created } = await jobs.enqueue(graph, {
        projectId: project.id,
        kind: "verify_card",
        subject: p.paperId,
        payload: { paperId: p.paperId, title: p.title },
        priority: PRIORITY.verify_card,
        dedupeKey: key("verify_card", p.paperId, null, p.textVersion),
        maxAttempts: 2,
      });
      if (created) enqueued++;
      pending++;
    } else if (verify.status === "queued" || verify.status === "running") pending++;
    else if (verify.status === "failed") failed++;
  }

  if (pending > 0) return { enqueued };
  // The saturation bar is recomputed after each extraction batch
  await jobs.enqueue(graph, { projectId: project.id, kind: "saturation", subject: `pass-${project.pass}`, payload: { pass: project.pass }, priority: PRIORITY.saturation, dedupeKey: `saturation:${project.id}:pass${project.pass}:${readable.length}`, maxAttempts: 2 });
  const notes = failed ? [`${failed} extraction or verification job(s) failed; continuing with the verified cards`] : [];
  return { enqueued, advance: true, notes };
};
