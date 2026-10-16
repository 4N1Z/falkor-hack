// Search the papers a workspace's collaborators brought in (the team library in FalkorDB).
// Three signals, merged with reciprocal-rank fusion so a paper strong on any one ranks well:
//   1. vector similarity on title+abstract (Paper.embedding)
//   2. vector similarity on full-text passages (Chunk.embedding) — also gives the evidence snippet
//   3. full-text keyword match on title/abstract

import { getWorkspaceGraph } from "./client";
import { embedText } from "./embeddings";
import {
  TEAM_CHUNK_SEARCH,
  TEAM_FULLTEXT_SEARCH,
  TEAM_PAPER_DETAILS,
  TEAM_VECTOR_SEARCH,
} from "./queries";

export interface TeamPaper {
  paperId: string;
  title: string;
  year: number | null;
  doi: string | null;
  arxivId: string | null;
  abstract: string | null;
  /** Full-text passages indexed for this paper */
  chunks: number;
  /** Who brought it into the workspace */
  owners: string[];
  ownerIds: string[];
  /** Authors in byline order */
  authors: string[];
  /** Best matching full-text passage for the query, when there is one */
  passage: { chunkId: string; text: string; distance: number } | null;
}

const STOPWORDS = new Set(
  "a an and are as at be by for from has have in is it of on or that the this to was were will with we our their its can".split(" "),
);

/** RediSearch query from free text: alphanumeric terms OR'd together (special chars dropped). */
function toFulltextQuery(q: string): string | null {
  const terms = [...new Set(q.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])].filter((t) => !STOPWORDS.has(t)).slice(0, 12);
  return terms.length ? terms.join(" | ") : null;
}

type Raw = Omit<TeamPaper, "authors" | "passage"> & { authorRows: { name: string; pos: number }[] };

export async function searchTeamLibrary(
  workspaceId: string,
  query: string,
  opts: { limit?: number; vector?: number[]; exclude?: string[] } = {},
): Promise<TeamPaper[]> {
  const q = query.trim().slice(0, 1500);
  if (q.length < 3) return [];
  const limit = opts.limit ?? 8;
  const graph = await getWorkspaceGraph(workspaceId);
  const ft = toFulltextQuery(q);
  const v = opts.vector ?? (await embedText(q));

  const [papers, chunks, fulltext] = await Promise.all([
    graph.roQuery<{ paperId: string }>(TEAM_VECTOR_SEARCH, { params: { v, k: 60, limit: 20 } as never }).then((r) => r.data ?? []),
    graph
      .roQuery<{ paperId: string; score: number; chunkId: string; text: string }>(TEAM_CHUNK_SEARCH, {
        params: { v, k: 80, limit: 40 } as never,
      })
      .then((r) => r.data ?? []),
    ft
      ? graph
          .roQuery<{ paperId: string }>(TEAM_FULLTEXT_SEARCH, { params: { q: ft, limit: 20 } as never })
          .then((r) => r.data ?? [])
          .catch(() => []) // a malformed term must never break search
      : Promise.resolve([]),
  ]);

  // Best passage per paper (results are ordered by distance)
  const passage = new Map<string, TeamPaper["passage"]>();
  for (const c of chunks) if (!passage.has(c.paperId)) passage.set(c.paperId, { chunkId: c.chunkId, text: c.text, distance: c.score });

  const exclude = new Set(opts.exclude ?? []);
  const score = new Map<string, number>();
  const fuse = (ids: string[]) => ids.forEach((id, i) => !exclude.has(id) && score.set(id, (score.get(id) ?? 0) + 1 / (60 + i)));
  fuse(papers.map((r) => r.paperId));
  fuse([...passage.keys()]);
  fuse(fulltext.map((r) => r.paperId));

  const ids = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
  if (!ids.length) return [];

  const details = (await graph.roQuery<Raw>(TEAM_PAPER_DETAILS, { params: { ids } as never })).data ?? [];
  const byId = new Map(details.map((d) => [d.paperId, d]));
  return ids
    .map((id) => byId.get(id))
    .filter((d): d is Raw => !!d)
    .map(({ authorRows, ...d }) => ({
      ...d,
      authors: [...authorRows].sort((a, b) => a.pos - b.pos).map((a) => a.name),
      passage: passage.get(d.paperId) ?? null,
    }));
}

// Citation formatting lives in src/lib/citations.ts (shared with the browser editor)
export { citationHref, citationLabel } from "../citations";
