// Scout Watcher — one job: find NEW papers the team should know about.
// "New and relevant" is defined by the graph, not by keywords: a recent paper qualifies only
// if it cites two or more of the team's papers (ideally from different collaborators'
// libraries) AND sits close to a team paper in the graph's vector index (citing two RAG papers
// in passing isn't enough). JEV then flags any that contradict the team paper they're closest
// to, so a result that challenges the team's work is surfaced first.
// Nothing is added automatically; the team decides what joins the library.

import { embedTexts } from "../graph/embeddings";
import { getRecentCitingWorks } from "../graph/openalex";
import { LIBRARY_STATUS, TEAM_PAGERANK, TEAM_VECTOR_SEARCH, VIEW_TEAM } from "../graph/queries";
import { challengesTeam } from "../jev";
import { startRun, type AgentResult } from "./base";

export interface NewPaper {
  openalexId: string;
  title: string;
  authors: string[];
  year: number | null;
  publicationDate: string | null;
  venue: string | null;
  doi: string | null;
  pdfUrl: string | null;
  citationCount: number;
  abstract: string | null;
  /** JEV: probability it contradicts or questions the closest team paper */
  challenge: number;
  /** Closest paper in the team library (vector index) */
  closest: { paperId: string; title: string } | null;
  /** 1 - cosine distance to the closest team paper */
  similarity: number;
  /** The team's papers it cites, with who owns them */
  cites: { paperId: string; title: string; owners: string[] }[];
  /** Distinct collaborators whose papers it cites */
  owners: string[];
}

const MIN_OVERLAP = 2;
const MAX_RESULTS = 8;
/** Candidates judged by JEV */
const MAX_CANDIDATES = 12;
/** Overlapping papers considered before the topical-fit check */
const MAX_POOL = 40;
/** Max cosine distance to the nearest team paper (vector index) to count as on-topic */
const NEAR = 0.45; // Cohere: on-topic citing papers measured 0.21–0.39, off-topic ≥ 0.55
/** JEV probability above which a paper is flagged as challenging the team's work */
const CHALLENGE = 0.7;

export async function runScoutWatcher(input: { workspaceId: string; userId: string; sinceMonths?: number }): Promise<AgentResult<NewPaper>> {
  const months = Math.min(Math.max(input.sinceMonths ?? 12, 1), 36);
  const since = new Date(Date.now() - months * 30 * 86400_000).toISOString().slice(0, 10);
  const run = await startRun("scout-watcher", input.workspaceId, { since });
  const g = run.graph;

  // 1. The team's papers (OpenAlex ids), most central first
  const [team, ranks] = await Promise.all([
    run.step(
      "graph.teamPapers",
      async () => (await g.roQuery<{ userName: string; paperId: string; title: string; year: number | null }>(VIEW_TEAM)).data ?? [],
      { source: "graph", cypher: "VIEW_TEAM" },
    ),
    run.step("graph.pageRank", async () => (await g.roQuery<{ paperId: string; score: number }>(TEAM_PAGERANK)).data ?? [], {
      source: "graph",
      cypher: "TEAM_PAGERANK (algo.pageRank)",
    }),
  ]);
  const ownersOf = new Map<string, string[]>();
  const teamPaper = new Map<string, { title: string; year: number | null }>();
  for (const r of team) {
    ownersOf.set(r.paperId, [...new Set([...(ownersOf.get(r.paperId) ?? []), r.userName])]);
    teamPaper.set(r.paperId, { title: r.title, year: r.year });
  }
  const rank = new Map(ranks.map((r) => [r.paperId, r.score]));
  const ids = [...teamPaper.keys()].filter((id) => /^W\d+$/.test(id)).sort((a, b) => (rank.get(b) ?? 0) - (rank.get(a) ?? 0)).slice(0, 100);
  if (ids.length < MIN_OVERLAP) return run.finish("NOT_IN_GRAPH", [], input.userId);

  // 2. Recent work citing them (OpenAlex), keep papers citing >= 2 team papers
  const citing = await run.step("openalex.recentCitingWorks", () => getRecentCitingWorks(ids, since), { args: { since, papers: ids.length } });
  const teamSet = new Set(ids);
  const overlapping = citing
    .map((w) => ({ w, hits: [...new Set(w.references.filter((r) => teamSet.has(r)))] }))
    .filter(({ hits }) => hits.length >= MIN_OVERLAP);

  // Drop papers already in the library
  const inLibrary = new Set(
    (
      await run.step(
        "graph.libraryStatus",
        async () => (await g.roQuery<{ paperId: string }>(LIBRARY_STATUS, { params: { ids: overlapping.map((o) => o.w.openalexId) } as never })).data ?? [],
        { source: "graph", cypher: "LIBRARY_STATUS" },
      )
    ).map((r) => r.paperId),
  );
  const ownersOfHits = (hits: string[]) => [...new Set(hits.flatMap((h) => ownersOf.get(h) ?? []))];
  const pool = overlapping
    .filter(({ w }) => !inLibrary.has(w.openalexId))
    // Papers that connect several collaborators' libraries first, then overlap, then citations
    .sort(
      (a, b) =>
        ownersOfHits(b.hits).length - ownersOfHits(a.hits).length || b.hits.length - a.hits.length || b.w.citationCount - a.w.citationCount,
    )
    .slice(0, MAX_POOL);
  if (!pool.length) return run.finish("NOT_IN_GRAPH", [], input.userId);

  // 3. Topical fit from the graph's vector index: distance to the nearest team paper.
  //    Citing two team papers in passing (e.g. a chatbot-ethics essay citing RAG) isn't enough.
  const vectors = await embedTexts(pool.map(({ w }) => `${w.title}\n${w.abstract ?? ""}`.slice(0, 2000)), "document");
  const nearest = await run.step(
    "graph.nearestTeamPaper",
    () =>
      Promise.all(
        vectors.map(async (v) => {
          const [hit] = (await g.roQuery<{ paperId: string; score: number }>(TEAM_VECTOR_SEARCH, { params: { v, k: 40, limit: 1 } as never })).data ?? [];
          return hit ?? null;
        }),
      ),
    { source: "graph", cypher: "TEAM_VECTOR_SEARCH (vector index)" },
  );
  const candidates = pool
    .map((c, i) => ({ ...c, near: nearest[i] }))
    .filter((c) => c.near && c.near.score <= NEAR)
    .slice(0, MAX_CANDIDATES);
  if (!candidates.length) return run.finish("NOT_IN_GRAPH", [], input.userId);

  // 4. Does any of them contradict the team paper it is closest to? (one JEV request)
  const verdict = await run.step("jev.challengesTeam", () =>
    challengesTeam(
      candidates.map(({ w, near }) => ({
        id: w.openalexId,
        title: w.title,
        abstract: `${w.abstract ?? ""}\nTeam paper it is compared with: ${teamPaper.get(near!.paperId)?.title ?? "n/a"}`,
      })),
    ),
  );
  run.trace[run.trace.length - 1].source = verdict.source;

  const items: NewPaper[] = candidates
    .map(({ w, hits, near }) => {
      return {
        openalexId: w.openalexId,
        title: w.title,
        authors: w.authors,
        year: w.year,
        publicationDate: w.publicationDate,
        venue: w.venue,
        doi: w.doi,
        pdfUrl: w.pdfUrl,
        citationCount: w.citationCount,
        abstract: w.abstract,
        challenge: verdict.result.get(w.openalexId)?.value ?? 0,
        closest: near ? { paperId: near.paperId, title: teamPaper.get(near.paperId)?.title ?? "" } : null,
        similarity: 1 - near!.score,
        cites: hits.map((id) => ({ paperId: id, title: teamPaper.get(id)!.title, owners: ownersOf.get(id) ?? [] })),
        owners: ownersOfHits(hits),
      };
    })
    // Papers that challenge the team's work first, then collaborator overlap, then topical fit
    .sort(
      (a, b) =>
        Number(b.challenge >= CHALLENGE) - Number(a.challenge >= CHALLENGE) ||
        b.owners.length - a.owners.length ||
        b.similarity - a.similarity,
    )
    .slice(0, MAX_RESULTS);

  items.forEach((p) => p.cites.forEach((c) => run.highlight.add(c.paperId)));
  return run.finish("ANSWERED", items, input.userId);
}
