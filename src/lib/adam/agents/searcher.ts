// Searcher — one job: find the papers the question page needs, in three rings, and triage
// each one (spec, Phase 1 · Sweep).
//   seed      the researcher's trusted papers, plus per sub-question: relevance, most-cited,
//             most-recent, and reviews, plus the field's own vocabulary
//   citation  backward (references of core papers, favouring those several core papers cite)
//             and forward (works citing core papers)
//   adjacent  the same problem under other names: the Scoper's adjacent-field terms, and
//             papers sharing concepts with core papers but with no citation link to them
// Every paper is triaged core / method_only / contradicts / background / out_of_scope (the
// last is not written) and assigned to the sub-question it is closest to (its cluster, used
// by the saturation bar). Core, contradicting and method papers become library papers and are
// read in full by the Librarian; background papers are metadata-only nodes.

import { eq, and, inArray } from "drizzle-orm";
import type { Graph } from "falkordb";
import db from "@/db";
import { papers } from "@/db/schema";
import { startRun, type AgentRunRecorder } from "../../agents/base";
import { embedTexts, paperEmbeddingText } from "../../graph/embeddings";
import { ingestPaperRows, type PaperRow } from "../../graph/ingest-rows";
import { getCitingSweepWorks, getRecentCitingWorks, OpenAlexBudgetError, searchWorksFiltered, titleKey, type SweepWork } from "../../graph/openalex";
import { PAPERS_BY_PG_ID, TEAM_PAPER_DETAILS } from "../../graph/queries";
import { classifyMany } from "../../jev";
import { spend } from "../project";
import { BACKWARD_CANDIDATES, CONCEPT_OVERLAP_CANDIDATES, CORE_PAPERS, TRIAGED_IDS, UPSERT_SWEEP_PAPERS, UPSERT_TRIAGED } from "../queries";
import type { QuestionPage } from "../question-page";
import type { AdamProject } from "../types";

export type Ring = "seed" | "citation" | "adjacent";
export const RINGS: Ring[] = ["seed", "citation", "adjacent"];

export type TriageLabel = "core" | "method_only" | "contradicts" | "background" | "out_of_scope";
const TRIAGE_LABELS: Record<TriageLabel, string> = {
  core: "Directly addresses a sub-question; its claims or results are evidence the project needs",
  method_only: "Useful for its methods or procedures, not for its claims",
  contradicts: "Argues against the hunch, or against the premise of a sub-question",
  background: "Relevant context the researcher should know, but not evidence for or against",
  out_of_scope: "Outside the scope fence, or about something else",
};
/** Labels whose papers are read in full (library rows + Librarian). */
const READ_FULLY: TriageLabel[] = ["core", "contradicts", "method_only"];

/** How many new full-text papers a ring may add per pass (the rest are background nodes). */
const RING_CAPS: Record<Ring, number> = { seed: 40, citation: 60, adjacent: 30 };
const MAX_CANDIDATES = 260;
const FORWARD_PER_CORE = 20;
const MAX_CORE_EXPANDED = 25;

interface Candidate {
  /** OpenAlex id for new works, or the graph paperId for papers already in the graph */
  id: string;
  title: string;
  abstract: string | null;
  year: number | null;
  venue: string | null;
  citationCount: number;
  doi: string | null;
  arxivId: string | null;
  pdfUrl: string | null;
  paperType: SweepWork["paperType"];
  ring: Ring;
  /** What found it: a sub-question id, a vocabulary term, or a parent paper id */
  via: string;
  inGraph: boolean;
  pgPaperId: string | null;
  clusterHint: string | null;
}

const fromWork = (w: SweepWork, ring: Ring, via: string): Candidate => ({
  id: w.openalexId,
  title: w.title,
  abstract: w.abstract,
  year: w.year,
  venue: w.venue,
  citationCount: w.citationCount,
  doi: w.doi,
  arxivId: w.doi?.match(/^10\.48550\/arxiv\.(.+)$/i)?.[1] ?? null,
  pdfUrl: w.pdfUrl,
  paperType: w.paperType,
  ring,
  via,
  inGraph: false,
  pgPaperId: null,
  clusterHint: null,
});

type GraphRow = {
  paperId: string;
  title: string;
  abstract: string | null;
  year: number | null;
  venue: string | null;
  citationCount: number;
  doi: string | null;
  arxivId: string | null;
  pgPaperId: string | null;
  via: string;
  clusterId: string;
};
const isUuid = (s: string | null | undefined) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const fromGraph = (r: GraphRow, ring: Ring): Candidate => ({
  id: r.paperId,
  title: r.title,
  abstract: r.abstract,
  year: r.year,
  venue: r.venue,
  citationCount: r.citationCount,
  doi: r.doi,
  arxivId: r.arxivId,
  pdfUrl: r.arxivId ? `https://arxiv.org/pdf/${r.arxivId}` : null,
  paperType: r.arxivId ? "preprint" : "other",
  ring,
  via: r.via,
  inGraph: true,
  // Seeded demo papers carry ids like "seed-2212.10496" with no Postgres row behind them
  pgPaperId: isUuid(r.pgPaperId) ? r.pgPaperId : null,
  clusterHint: r.clusterId || null,
});

const params = <T>(p: T) => ({ params: p as never });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- gathering

async function gatherSeed(graph: Graph, project: AdamProject, page: QuestionPage, run: AgentRunRecorder, skipClusters: string[] = []): Promise<Candidate[]> {
  const out: Candidate[] = [];
  // Trusted / distrusted seeds are already graph papers
  if (project.seeds.length) {
    const rows = (await graph.roQuery<{ paperId: string; title: string; abstract: string | null; year: number | null; doi: string | null; arxivId: string | null }>(
      TEAM_PAPER_DETAILS,
      params({ ids: project.seeds.map((s) => s.paperId) }),
    )).data ?? [];
    for (const r of rows) out.push(fromGraph({ ...r, venue: null, citationCount: 0, pgPaperId: null, via: "seed", clusterId: "" }, "seed"));
  }
  const twoYearsAgo = new Date(Date.now() - 2 * 365 * 86400_000).toISOString().slice(0, 10);
  for (const sq of page.subquestions) {
    // Saturation rule: a cluster whose last papers added nothing new is not searched again this pass
    if (skipClusters.includes(sq.id)) continue;
    const q = sq.text.length > 220 ? sq.text.slice(0, 220) : sq.text;
    const batches = await run.step(
      `openalex.seed.${sq.id}`,
      async () => {
        const a = await searchWorksFiltered(q, { perPage: 15 });
        await sleep(120);
        const b = await searchWorksFiltered(q, { perPage: 10, sort: "cited_by_count:desc" });
        await sleep(120);
        const c = await searchWorksFiltered(q, { perPage: 8, sort: "publication_date:desc", filter: [`from_publication_date:${twoYearsAgo}`] });
        await sleep(120);
        const d = await searchWorksFiltered(q, { perPage: 5, filter: ["type:review"] });
        return [a, b, c, d];
      },
      { source: "graph" },
    );
    for (const w of batches.flat()) out.push(fromWork(w, "seed", sq.id));
    await sleep(150);
  }
  // The field's own vocabulary, a few results per term (sequential: OpenAlex rate-limits bursts)
  const terms = page.vocabulary.terms.slice(0, 12);
  const byTerm = await run.step("openalex.seed.vocabulary", () => searchEach(terms.map((t) => t), 6), { source: "graph" });
  terms.forEach((t, i) => byTerm[i].forEach((w) => out.push(fromWork(w, "seed", `term:${t}`))));
  return out;
}

/** One search at a time with a short pause: the polite pool allows ~10 requests/s and bursts get 429s. */
async function searchEach(queries: string[], perPage: number): Promise<SweepWork[][]> {
  const out: SweepWork[][] = [];
  for (const q of queries) {
    // One odd term may 400; a spent budget is the ring's problem, not the term's, so it propagates
    out.push(
      await searchWorksFiltered(q, { perPage }).catch((err) => {
        if (err instanceof OpenAlexBudgetError) throw err;
        return [];
      }),
    );
    await sleep(150);
  }
  return out;
}

async function gatherCitation(graph: Graph, project: AdamProject, run: AgentRunRecorder, onlyPaperIds?: string[], recentSince?: string): Promise<Candidate[]> {
  const out: Candidate[] = [];
  // Re-sweep: only what has cited the core since the last sweep (one request per 50 core papers)
  if (recentSince) {
    const cores = ((await graph.roQuery<{ paperId: string; clusterId: string | null }>(CORE_PAPERS, params({ projectId: project.id }))).data ?? []).filter((c) => /^W\d+$/.test(c.paperId));
    const recent = await run.step("openalex.recentCiting", () => getRecentCitingWorks(cores.map((c) => c.paperId), recentSince, 200), { source: "graph" });
    for (const w of recent) {
      const parent = cores.find((c) => w.references.includes(c.paperId));
      const c = fromWork({ ...w, references: w.references, concepts: [], publicationDate: w.publicationDate }, "citation", parent?.paperId ?? "resweep");
      c.clusterHint = parent?.clusterId ?? null;
      out.push(c);
    }
    return out;
  }
  // Backward: references already in the graph via the Librarian's CITES fan-out
  const backward = await run.step(
    "graph.backwardCandidates",
    async () => (await graph.roQuery<GraphRow & { citedByCore: number }>(BACKWARD_CANDIDATES, params({ projectId: project.id, limit: 150 }))).data ?? [],
    { source: "graph", cypher: "BACKWARD_CANDIDATES" },
  );
  for (const r of backward) out.push(fromGraph(r, "citation"));
  // Forward: works citing each core paper (OpenAlex)
  let cores = (await graph.roQuery<{ paperId: string; title: string; clusterId: string | null }>(CORE_PAPERS, params({ projectId: project.id }))).data ?? [];
  if (onlyPaperIds?.length) cores = cores.filter((c) => onlyPaperIds.includes(c.paperId));
  cores = cores.filter((c) => /^W\d+$/.test(c.paperId)).slice(0, MAX_CORE_EXPANDED);
  for (const core of cores) {
    const citing = await run.step(`openalex.citing.${core.paperId}`, () => getCitingSweepWorks(core.paperId, FORWARD_PER_CORE), { source: "graph" });
    for (const w of citing) {
      const c = fromWork(w, "citation", core.paperId);
      c.clusterHint = core.clusterId;
      out.push(c);
    }
    await sleep(120);
  }
  return out;
}

async function gatherAdjacent(graph: Graph, project: AdamProject, page: QuestionPage, run: AgentRunRecorder): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const terms = page.vocabulary.adjacentTerms.slice(0, 12);
  const byTerm = await run.step("openalex.adjacentTerms", () => searchEach(terms.map((t) => `${t.term} ${t.field}`), 10), { source: "graph" });
  terms.forEach((t, i) => byTerm[i].forEach((w) => out.push(fromWork(w, "adjacent", `adjacent:${t.term}`))));
  const overlap = await run.step(
    "graph.conceptOverlap",
    async () => (await graph.roQuery<GraphRow & { shared: number }>(CONCEPT_OVERLAP_CANDIDATES, params({ projectId: project.id, limit: 60 }))).data ?? [],
    { source: "graph", cypher: "CONCEPT_OVERLAP_CANDIDATES" },
  );
  for (const r of overlap) out.push({ ...fromGraph(r, "adjacent"), via: `concepts:${r.via}` });
  return out;
}

// ---------------------------------------------------------------- triage

function questionContext(page: QuestionPage): string {
  return [
    `Hunch: ${page.hunch}`,
    `Sub-questions:\n${page.subquestions.map((q) => `- (${q.id}) ${q.text}`).join("\n")}`,
    `In scope: ${page.scopeFence.inside.join("; ")}`,
    `Out of scope: ${page.scopeFence.outside.join("; ")}`,
  ].join("\n\n");
}

const cosine = (a: number[], b: number[]) => {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};

/** Assign each candidate to the sub-question it is closest to (its cluster for the saturation bar). */
async function assignClusters(page: QuestionPage, candidates: Candidate[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!candidates.length || !page.subquestions.length) return out;
  const sqVecs = await embedTexts(page.subquestions.map((q) => q.text), "query");
  for (let i = 0; i < candidates.length; i += 90) {
    const batch = candidates.slice(i, i + 90);
    const vecs = await embedTexts(batch.map((c) => paperEmbeddingText(c.title, c.abstract)), "document");
    batch.forEach((c, j) => {
      let best = 0,
        bestSim = -1;
      sqVecs.forEach((v, k) => {
        const s = cosine(vecs[j], v);
        if (s > bestSim) {
          bestSim = s;
          best = k;
        }
      });
      out.set(c.id, c.clusterHint ?? page.subquestions[best].id);
    });
  }
  return out;
}

async function triage(page: QuestionPage, candidates: Candidate[], run: AgentRunRecorder) {
  const context = questionContext(page);
  const labels = new Map<string, { label: TriageLabel; confidence: number }>();
  for (let i = 0; i < candidates.length; i += 20) {
    const batch = candidates.slice(i, i + 20);
    const judged = await run.step(
      `triage.${i / 20 + 1}`,
      () =>
        classifyMany(
          context,
          batch.map((c) => ({ id: c.id, text: `${c.title}${c.year ? ` (${c.year})` : ""}\n${c.abstract ?? "(no abstract)"}` })),
          "Triage this paper for the research question above. Pick the single best label.",
          TRIAGE_LABELS,
        ),
      { source: "jev", args: { n: batch.length } },
    );
    for (const [id, v] of judged.result) labels.set(id, v);
  }
  return labels;
}

// ---------------------------------------------------------------- writing

/** Library rows for papers that must be read in full. Existing rows (same title or OpenAlex id) are reused. */
async function ensureLibraryRows(project: AdamProject, cands: Candidate[]): Promise<PaperRow[]> {
  if (!cands.length) return [];
  const newWorks = cands.filter((c) => !c.pgPaperId);
  const existing = newWorks.length
    ? await db
        .select()
        .from(papers)
        .where(and(eq(papers.workspaceId, project.workspaceId), inArray(papers.externalId, newWorks.map((c) => c.id))))
    : [];
  const haveExternal = new Set(existing.map((p) => p.externalId));
  const toInsert = newWorks.filter((c) => !haveExternal.has(c.id));
  const inserted = toInsert.length
    ? await db
        .insert(papers)
        .values(
          toInsert.map((c) => ({
            title: c.title.slice(0, 500),
            type: c.paperType,
            source: "other" as const,
            externalSource: "adam",
            externalId: c.id,
            abstract: c.abstract,
            doi: c.doi && c.doi.startsWith("10.") ? c.doi : null,
            uploadUrl: c.pdfUrl,
            fileType: c.pdfUrl ? "pdf" : null,
            userId: project.createdBy,
            workspaceId: project.workspaceId,
          })),
        )
        .onConflictDoNothing()
        .returning()
    : [];
  // Title conflicts: the paper is already in the library under another record
  const insertedTitles = new Set(inserted.map((p) => p.title));
  const conflicted = toInsert.filter((c) => !insertedTitles.has(c.title.slice(0, 500)));
  const byTitle = conflicted.length
    ? await db
        .select()
        .from(papers)
        .where(and(eq(papers.workspaceId, project.workspaceId), inArray(papers.title, conflicted.map((c) => c.title.slice(0, 500)))))
    : [];
  const withRows = cands.filter((c) => c.pgPaperId);
  const rowsById = withRows.length ? await db.select().from(papers).where(inArray(papers.id, withRows.map((c) => c.pgPaperId!))) : [];
  const all = [...existing, ...inserted, ...byTitle, ...rowsById];
  return all.map((p) => ({ id: p.id, title: p.title, abstract: p.abstract, doi: p.doi, userId: p.userId, workspaceId: p.workspaceId, source: p.source, uploadUrl: p.uploadUrl }));
}

export interface RingResult {
  ring: Ring;
  candidates: number;
  triaged: Record<TriageLabel, number>;
  readFully: number;
  newPapers: number;
}

export async function runSearchRing(
  graph: Graph,
  workspaceId: string,
  project: AdamProject,
  page: QuestionPage,
  ring: Ring,
  opts: { round?: number; onlyPaperIds?: string[]; recentSince?: string; skipClusters?: string[]; heartbeat?: (p: Record<string, unknown>) => Promise<void>; log?: (m: string) => void } = {},
): Promise<RingResult> {
  const run = await startRun("adam-searcher", workspaceId, { projectId: project.id, pass: project.pass, ring, round: opts.round ?? 1 });
  const beat = opts.heartbeat ?? (async () => {});
  const log = opts.log ?? (() => {});

  // 1. Gather
  let raw =
    ring === "seed" ? await gatherSeed(graph, project, page, run, opts.skipClusters) : ring === "citation" ? await gatherCitation(graph, project, run, opts.onlyPaperIds, opts.recentSince) : await gatherAdjacent(graph, project, page, run);
  await beat({ step: "gathered", n: raw.length });

  // Dedupe (first finder wins), drop already-triaged, cap
  const already = new Set(((await graph.roQuery<{ paperId: string }>(TRIAGED_IDS, params({ projectId: project.id }))).data ?? []).map((r) => r.paperId));
  const seen = new Set<string>();
  const seenTitles = new Set<string>();
  const candidates: Candidate[] = [];
  for (const c of raw) {
    const tk = titleKey(c.title);
    if (seen.has(c.id) || seenTitles.has(tk) || already.has(c.id)) continue;
    seen.add(c.id);
    seenTitles.add(tk);
    candidates.push(c);
    if (candidates.length >= MAX_CANDIDATES) break;
  }
  raw = [];
  log(`${ring}: ${candidates.length} candidates to triage`);

  // 2. Triage + clusters
  const labels = await triage(page, candidates, run);
  await beat({ step: "triaged", n: candidates.length });
  const clusters = await run.step("embed.clusters", () => assignClusters(page, candidates), { source: "llm" });

  const counts: Record<TriageLabel, number> = { core: 0, method_only: 0, contradicts: 0, background: 0, out_of_scope: 0 };
  const kept = candidates.filter((c) => {
    const l = labels.get(c.id)?.label ?? "out_of_scope";
    counts[l]++;
    return l !== "out_of_scope";
  });

  // 3. Full-text papers: library rows + Librarian (sequential batches of 10, heartbeat between)
  const toRead = kept.filter((c) => READ_FULLY.includes(labels.get(c.id)!.label)).sort((a, b) => b.citationCount - a.citationCount).slice(0, RING_CAPS[ring]);
  const rows = await ensureLibraryRows(project, toRead);
  const pgIdByCandidate = new Map<string, string>();
  for (const c of toRead) {
    const row = rows.find((r) => (c.pgPaperId && r.id === c.pgPaperId) || r.title === c.title.slice(0, 500));
    if (row) pgIdByCandidate.set(c.id, row.id);
  }
  const needIngest = rows.filter((r) => !toRead.some((c) => c.pgPaperId === r.id && c.inGraph));
  let newPapers = 0;
  for (let i = 0; i < needIngest.length; i += 10) {
    const batch = needIngest.slice(i, i + 10);
    await run.step(`librarian.${i / 10 + 1}`, () => ingestPaperRows(batch, { maxChunks: 150 }), { source: "graph", args: { papers: batch.length } });
    newPapers += batch.length;
    await beat({ step: "ingest", done: i + batch.length, of: needIngest.length });
  }
  await spend(graph, project.id, { papers: newPapers });

  // Map library rows to their graph nodes (the Librarian may have merged versions)
  const nodeByPg = new Map<string, string>();
  if (pgIdByCandidate.size) {
    const nodes = (await graph.roQuery<{ pgPaperId: string; paperId: string }>(PAPERS_BY_PG_ID, params({ pgIds: [...new Set(pgIdByCandidate.values())] }))).data ?? [];
    for (const n of nodes) nodeByPg.set(n.pgPaperId, n.paperId);
  }

  // 4. Background papers (and read-fully overflow): metadata-only nodes
  const metadataOnly = kept.filter((c) => !c.inGraph && !pgIdByCandidate.has(c.id));
  if (metadataOnly.length) {
    await run.step(
      "graph.upsertSweepPapers",
      () =>
        graph.query(
          UPSERT_SWEEP_PAPERS,
          params({
            rows: metadataOnly.map((c) => ({
              paperId: c.id,
              title: c.title,
              titleKey: titleKey(c.title),
              abstract: c.abstract,
              year: c.year,
              venue: c.venue,
              citationCount: c.citationCount,
              doi: c.doi,
              arxivId: c.arxivId,
            })),
          }),
        ),
      { source: "graph", cypher: "UPSERT_SWEEP_PAPERS" },
    );
  }

  // 5. Triage edges
  const triagedRows = kept.map((c) => {
    const pg = pgIdByCandidate.get(c.id);
    const nodeId = (pg && nodeByPg.get(pg)) ?? c.id;
    const seed = project.seeds.find((s) => s.paperId === c.id);
    return {
      paperId: nodeId,
      label: labels.get(c.id)!.label,
      confidence: labels.get(c.id)!.confidence,
      reason: null,
      ring,
      via: c.via,
      clusterId: clusters.get(c.id) ?? null,
      userLabel: seed?.label ?? null,
    };
  });
  for (let i = 0; i < triagedRows.length; i += 100) {
    await graph.query(UPSERT_TRIAGED, params({ projectId: project.id, rows: triagedRows.slice(i, i + 100), at: Date.now(), pass: project.pass, runId: run.runId }));
  }
  for (const r of triagedRows) run.highlight.add(r.paperId);

  const result: RingResult = { ring, candidates: candidates.length, triaged: counts, readFully: toRead.length, newPapers };
  await run.finish("ANSWERED", [result], project.createdBy);
  return result;
}
