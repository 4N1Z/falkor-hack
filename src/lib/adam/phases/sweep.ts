// Phase 1 · Sweep. Three rings in order, then the coverage check; core papers whose key
// references are missing get one more citation round. Ends when the rings are done and
// nothing below the coverage threshold is left to chase (or the second round has run).
// The saturation rule (spec) refines this per cluster on later passes.

import { RINGS, type Ring } from "../agents/searcher";
import { getCoverage } from "../coverage";
import * as jobs from "../jobs";
import { PRIORITY, type PhaseStep } from "../orchestrator";
import { clusterStats } from "../saturation";

const MAX_CITATION_ROUNDS = 2;

export const sweepStep: PhaseStep = async ({ graph, project }) => {
  const all = await jobs.byKindAndStatus(graph, project.id, ["search_ring"], ["queued", "running", "done", "failed", "cancelled"]);
  const forPass = all.filter((j) => Number(j.payload.pass) === project.pass).sort((a, b) => b.createdAt - a.createdAt);
  // The latest job for a ring and round: a retry supersedes the failed run it replaces
  const find = (ring: Ring, round: number) => forPass.find((j) => j.payload.ring === ring && Number(j.payload.round ?? 1) === round);

  let enqueued = 0;
  const notes: string[] = [];

  // Saturation rule (pass 2+): clusters whose last papers added nothing new are not searched again
  const skipClusters = project.pass > 1 ? (await clusterStats(graph, project.id)).filter((s) => s.saturated).map((s) => s.clusterId) : [];

  // Rings run in order; each waits for the previous one
  for (const ring of RINGS) {
    const job = find(ring, 1);
    if (!job) {
      const { created } = await jobs.enqueue(graph, {
        projectId: project.id,
        kind: "search_ring",
        subject: `${ring} · pass ${project.pass}`,
        payload: { ring, round: 1, pass: project.pass, skipClusters },
        priority: PRIORITY.search_ring,
        dedupeKey: `search_ring:${project.id}:${project.pass}:${ring}:1`,
        maxAttempts: 2,
      });
      return { enqueued: created ? 1 : 0 };
    }
    if (job.status === "queued" || job.status === "running") return { enqueued: 0 };
    if (job.status === "cancelled") {
      notes.push(`The ${ring} ring was cancelled; skipping it for this pass`);
      continue;
    }
    if (job.status === "failed") {
      // One retry per pass; a second failure (usually an OpenAlex rate limit) skips the ring with a note
      const attemptsForRing = forPass.filter((j) => j.payload.ring === ring && Number(j.payload.round ?? 1) === 1).length;
      if (attemptsForRing >= 2) {
        notes.push(`The ${ring} ring failed twice (${job.error ?? "unknown error"}); skipping it for this pass. It runs again on the next pass.`);
        continue;
      }
      // A failed ring is not "nothing to find": stop and let the researcher look (resume re-runs it)
      const { created } = await jobs.enqueue(graph, {
        projectId: project.id,
        kind: "search_ring",
        subject: `${ring} · retry · pass ${project.pass}`,
        payload: { ring, round: 1, pass: project.pass },
        priority: PRIORITY.search_ring,
        dedupeKey: `search_ring:${project.id}:${project.pass}:${ring}:1:retry-${job.attempts}`,
        maxAttempts: 2,
      });
      return { enqueued: created ? 1 : 0, pause: `The ${ring} ring failed: ${job.error ?? "unknown error"}. It is queued to run again when you resume.` };
    }
  }

  // Coverage: one more citation round for core papers below the threshold
  const coverage = await getCoverage(graph, project.id);
  if (coverage?.gaps.length) {
    const round2 = find("citation", 2);
    if (round2 && (round2.status === "failed" || round2.status === "cancelled")) {
      notes.push(`The second citation round did not complete (${round2.error ?? round2.status}); ${coverage.gaps.length} core paper(s) keep thin reference coverage this pass`);
    } else if (!round2 && MAX_CITATION_ROUNDS >= 2) {
      const { created } = await jobs.enqueue(graph, {
        projectId: project.id,
        kind: "search_ring",
        subject: `citation · round 2 · pass ${project.pass}`,
        payload: { ring: "citation", round: 2, pass: project.pass, paperIds: coverage.gaps },
        priority: PRIORITY.search_ring,
        dedupeKey: `search_ring:${project.id}:${project.pass}:citation:2`,
        maxAttempts: 2,
      });
      enqueued += created ? 1 : 0;
      notes.push(`${coverage.gaps.length} core paper(s) have most of their key references missing; running the citation ring again for them`);
      return { enqueued, notes };
    }
    if (round2 && (round2.status === "queued" || round2.status === "running")) return { enqueued: 0 };
  }
  if (coverage?.adjacentMissing.length) notes.push(`No papers found for adjacent terms: ${coverage.adjacentMissing.join(", ")}`);

  return { enqueued, advance: true, notes };
};
