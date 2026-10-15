// Thin OpenAlex client used by the Librarian to build the research graph.
// OpenAlex is free and keyless (~10 req/s, 100k/day); `mailto` puts us in the polite pool.
// Known data-quality caveat: some records carry a wrong title/topics, so for papers in a
// user's library we keep the user's own title/abstract and take edges/authors from here.

const BASE = "https://api.openalex.org";
const MAILTO = process.env.OPENALEX_MAILTO ?? "dev@neuraquery.com";

const WORK_FIELDS = [
  "id",
  "doi",
  "ids",
  "title",
  "publication_year",
  "cited_by_count",
  "authorships",
  "primary_location",
  "keywords",
  "referenced_works",
  "abstract_inverted_index",
].join(",");

/** Max ids per `filter=openalex:a|b|…` request (OpenAlex allows up to 100 OR'd values). */
const BATCH_SIZE = 50;

export interface OpenAlexWork {
  id: string;
  doi: string | null;
  ids?: { openalex?: string; doi?: string; mag?: string; pmid?: string; arxiv?: string };
  title: string | null;
  publication_year: number | null;
  cited_by_count: number;
  authorships?: { author: { id: string; display_name: string } }[];
  primary_location?: { source?: { display_name?: string } | null } | null;
  keywords?: { display_name: string; score?: number }[];
  referenced_works?: string[];
  abstract_inverted_index?: Record<string, number[]> | null;
}

/** Normalised paper shape the graph writer consumes. */
export interface GraphPaper {
  paperId: string;
  doi: string | null;
  arxivId: string | null;
  title: string;
  abstract: string | null;
  year: number | null;
  venue: string | null;
  citationCount: number;
  authors: { authorId: string; name: string }[];
  concepts: string[];
  references: string[];
}

export const shortId = (openAlexUrl: string) => openAlexUrl.split("/").pop()!;

export const normalizeDoi = (doi?: string | null) =>
  doi
    ? doi
        .trim()
        .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
        .replace(/^doi:/i, "")
        .toLowerCase()
    : null;

const ARXIV_DOI = /^10\.48550\/arxiv\.(.+)$/i;

/** "10.48550/arXiv.2005.11401" → "2005.11401" */
export const arxivIdFromDoi = (doi?: string | null) => normalizeDoi(doi)?.match(ARXIV_DOI)?.[1] ?? null;

function abstractFromInvertedIndex(index?: Record<string, number[]> | null): string | null {
  if (!index) return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const pos of positions) words[pos] = word;
  }
  const text = words.filter(Boolean).join(" ").trim();
  return text || null;
}

export function toGraphPaper(work: OpenAlexWork): GraphPaper {
  const doi = normalizeDoi(work.doi ?? work.ids?.doi);
  const arxivFromDoi = doi?.match(ARXIV_DOI)?.[1] ?? null;
  return {
    paperId: shortId(work.id),
    doi,
    arxivId: arxivFromDoi,
    title: work.title ?? "Untitled",
    abstract: abstractFromInvertedIndex(work.abstract_inverted_index),
    year: work.publication_year,
    venue: work.primary_location?.source?.display_name ?? null,
    citationCount: work.cited_by_count ?? 0,
    authors: (work.authorships ?? [])
      .filter((a) => a.author?.id)
      .map((a) => ({ authorId: shortId(a.author.id), name: a.author.display_name })),
    // Keywords were accurate where topics were not (see header note); keep the strong ones
    concepts: (work.keywords ?? [])
      .filter((k) => (k.score ?? 1) >= 0.3)
      .slice(0, 5)
      .map((k) => k.display_name.toLowerCase()),
    references: (work.referenced_works ?? []).map(shortId),
  };
}

async function openAlexFetch<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("mailto", MAILTO);

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.ok) return (await res.json()) as T;
    if (res.status === 404) return null;
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      continue;
    }
    throw new Error(`OpenAlex ${res.status} for ${url.pathname}`);
  }
  throw new Error(`OpenAlex kept failing for ${url.pathname}`);
}

export async function getWorkByDoi(doi: string): Promise<OpenAlexWork | null> {
  const clean = normalizeDoi(doi);
  if (!clean) return null;
  return openAlexFetch<OpenAlexWork>(`/works/doi:${clean}`, { select: WORK_FIELDS });
}

/** Normalised title, used to match and to dedupe versions of the same paper (preprint vs. published). */
export const titleKey = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Every OpenAlex work whose title matches exactly (after normalisation), most-cited first. */
export async function findWorksByExactTitle(title: string): Promise<OpenAlexWork[]> {
  const query = title.replace(/[:,|]/g, " ").trim();
  if (query.length < 8) return [];
  const res = await openAlexFetch<{ results: OpenAlexWork[] }>("/works", {
    filter: `title.search:${query}`,
    sort: "cited_by_count:desc",
    "per-page": "10",
    select: WORK_FIELDS,
  });
  const wanted = titleKey(title);
  return res?.results.filter((w) => w.title && titleKey(w.title) === wanted) ?? [];
}

/** Title lookup that only accepts a near-exact title match (OpenAlex fuzzy search is unreliable). */
export async function matchWorkByTitle(title: string): Promise<OpenAlexWork | null> {
  return (await findWorksByExactTitle(title))[0] ?? null;
}

export async function getWorksByIds(ids: string[]): Promise<OpenAlexWork[]> {
  const unique = [...new Set(ids)];
  const out: OpenAlexWork[] = [];
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const chunk = unique.slice(i, i + BATCH_SIZE);
    const res = await openAlexFetch<{ results: OpenAlexWork[] }>("/works", {
      filter: `openalex:${chunk.join("|")}`,
      "per-page": String(BATCH_SIZE),
      select: WORK_FIELDS,
    });
    out.push(...(res?.results ?? []));
  }
  return out;
}

/** Most-cited works that cite `workId` (the "cited by" frontier). */
export async function getCitingWorks(workId: string, limit: number): Promise<OpenAlexWork[]> {
  const res = await openAlexFetch<{ results: OpenAlexWork[] }>("/works", {
    filter: `cites:${workId}`,
    sort: "cited_by_count:desc",
    "per-page": String(limit),
    select: WORK_FIELDS,
  });
  return res?.results ?? [];
}
