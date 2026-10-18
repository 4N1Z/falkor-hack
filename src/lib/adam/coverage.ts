// Coverage check — the Searcher's checker (spec "Checking at every step" → Search):
// what is missing? Are the seed papers' own key citations present? Are adjacent fields
// covered? The answer is stored on the project so the Sweep tab and the orchestrator share it.

import { ADAM_QUERY_TIMEOUT_MS } from "./types";
import type { Graph } from "falkordb";
import { ADJACENT_PRESENCE, CORE_PAPERS, CORE_REFERENCE_COVERAGE, GET_PROJECT_COVERAGE, SET_PROJECT_COVERAGE } from "./queries";
import type { QuestionPage } from "./question-page";
import { parseJson } from "./types";

/** Below this fraction of a core paper's top references, the citation ring re-runs for it. */
export const COVERAGE_THRESHOLD = 0.6;

export interface CoreCoverage {
  paperId: string;
  title: string;
  refs: number;
  covered: number;
  fraction: number;
}

export interface Coverage {
  at: number;
  pass: number;
  cores: CoreCoverage[];
  /** Core papers below the threshold (the ones a second citation round targets) */
  gaps: string[];
  adjacent: { term: string; field: string; papers: number }[];
  adjacentMissing: string[];
}

const params = <T>(p: T) => ({ params: p as never, TIMEOUT: ADAM_QUERY_TIMEOUT_MS });

export async function computeCoverage(graph: Graph, projectId: string, pass: number, page: QuestionPage): Promise<Coverage> {
  const [rows, cores, adjacency] = await Promise.all([
    graph.roQuery<{ paperId: string; title: string; refs: number; covered: number }>(CORE_REFERENCE_COVERAGE, params({ projectId })).then((r) => r.data ?? []),
    graph.roQuery<{ paperId: string; title: string }>(CORE_PAPERS, params({ projectId })).then((r) => r.data ?? []),
    graph.roQuery<{ via: string; n: number }>(ADJACENT_PRESENCE, params({ projectId })).then((r) => r.data ?? []),
  ]);
  const byId = new Map(rows.map((r) => [r.paperId, r]));
  const coreRows: CoreCoverage[] = cores.map((c) => {
    const r = byId.get(c.paperId);
    const refs = r?.refs ?? 0;
    const covered = r?.covered ?? 0;
    return { paperId: c.paperId, title: c.title, refs, covered, fraction: refs ? covered / refs : 1 };
  });
  const presence = new Map(adjacency.map((a) => [a.via.replace(/^adjacent:/, ""), a.n]));
  const adjacent = page.vocabulary.adjacentTerms.map((t) => ({ term: t.term, field: t.field, papers: presence.get(t.term) ?? 0 }));
  const coverage: Coverage = {
    at: Date.now(),
    pass,
    cores: coreRows,
    gaps: coreRows.filter((c) => c.refs > 0 && c.fraction < COVERAGE_THRESHOLD).map((c) => c.paperId),
    adjacent,
    adjacentMissing: adjacent.filter((a) => a.papers === 0).map((a) => a.term),
  };
  await graph.query(SET_PROJECT_COVERAGE, params({ id: projectId, coverage: JSON.stringify(coverage), at: Date.now() }));
  return coverage;
}

export async function getCoverage(graph: Graph, projectId: string): Promise<Coverage | null> {
  const row = (await graph.roQuery<{ coverage: string }>(GET_PROJECT_COVERAGE, params({ id: projectId }))).data?.[0];
  const parsed = parseJson<Partial<Coverage>>(row?.coverage, {});
  return Array.isArray(parsed.cores) ? (parsed as Coverage) : null;
}
