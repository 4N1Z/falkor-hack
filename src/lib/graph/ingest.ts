// The Librarian: turns papers people import into a connected research graph.
// For each library paper it resolves the work on OpenAlex, pulls its references and its
// most-cited citers (the "frontier"), and writes papers, authors, concepts, venues, CITES
// edges, (User)-[:IMPORTED]->(Paper) and embeddings into the workspace graph.
//
// OpenAlex data-quality guards (see docs/falkordb-hackathon-plan.md):
// - preprint and published versions are separate works → one node per normalised title
// - recent arXiv records often lack references → borrow them from other versions
// - some records carry a hijacked title → flagged `suspect` (cited by papers older than itself)

import type { Graph } from "falkordb";
import { getWorkspaceGraph } from "./client";
import { embedTexts, paperEmbeddingText } from "./embeddings";
import {
  type GraphPaper,
  type OpenAlexWork,
  arxivIdFromDoi,
  findWorksByExactTitle,
  getCitingWorks,
  getWorkByDoi,
  getWorksByIds,
  matchWorkByTitle,
  normalizeDoi,
  shortId,
  titleKey,
  toGraphPaper,
} from "./openalex";
import {
  EXISTING_BY_TITLE_KEY,
  FLAG_SUSPECT_PAPERS,
  PAPERS_MISSING_EMBEDDING,
  SET_EMBEDDINGS,
  UPSERT_AUTHORS,
  UPSERT_CITES,
  UPSERT_CONCEPTS,
  UPSERT_IMPORTED,
  UPSERT_PAPERS,
  UPSERT_VENUES,
} from "./queries";

export interface LibraryItem {
  /** papers.id in Postgres; also the fallback node key when the paper can't be matched */
  pgPaperId: string;
  title: string;
  abstract?: string | null;
  doi?: string | null;
  userId: string;
  userName?: string | null;
  source: "zotero" | "manual" | "other" | "seed";
  /** Extra concepts from the user (e.g. Zotero tags) */
  tags?: string[];
}

export interface IngestOptions {
  /** References kept per library paper (OpenAlex lists every reference; cap the fan-out) */
  maxReferences?: number;
  /** Most-cited citing works kept per library paper */
  maxCiting?: number;
  log?: (msg: string) => void;
}

export interface IngestResult {
  library: number;
  matched: number;
  unmatched: string[];
  frontier: number;
  merged: number;
  cites: number;
  embedded: number;
  suspect: number;
  ms: number;
}

type IngestPaper = GraphPaper & { inLibrary: boolean; pgPaperId: string | null };

const WRITE_CHUNK = 200;

/** DOI embeds a year (".2025.") well after the paper's year → title/DOI came from another work. */
function doiYearMismatch(doi: string | null, year: number | null): boolean {
  if (!doi || !year) return false;
  const doiYears = [...doi.matchAll(/[./](19\d{2}|20\d{2})(?=[./]|$)/g)].map((m) => Number(m[1]));
  return doiYears.some((y) => y >= year + 2);
}

async function writeRows(graph: Graph, query: string, key: string, rows: object[]) {
  for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
    await graph.query(query, { params: { [key]: rows.slice(i, i + WRITE_CHUNK) } as never });
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function resolveWork(item: LibraryItem): Promise<OpenAlexWork | null> {
  try {
    const work = (item.doi && (await getWorkByDoi(item.doi))) || (await matchWorkByTitle(item.title));
    if (work && !work.referenced_works?.length) {
      // Recent arXiv records often have no references; other versions of the paper usually do
      const versions = await findWorksByExactTitle(item.title).catch(() => []);
      work.referenced_works = [...new Set(versions.flatMap((v) => v.referenced_works ?? []))];
    }
    return work;
  } catch {
    return null;
  }
}

/** Ingest library papers into `ws:{workspaceId}`. Idempotent: safe to re-run for the same papers. */
export async function ingestLibrary(
  workspaceId: string,
  items: LibraryItem[],
  opts: IngestOptions = {},
): Promise<IngestResult> {
  const started = Date.now();
  const { maxReferences = 40, maxCiting = 15, log = () => {} } = opts;
  const graph = await getWorkspaceGraph(workspaceId);

  // 1. Resolve library papers on OpenAlex
  const works = await mapLimit(items, 4, resolveWork);
  const unmatched: string[] = [];
  const library: IngestPaper[] = items.map((item, i) => {
    const work = works[i];
    if (!work) unmatched.push(item.title);
    const base: GraphPaper = work
      ? toGraphPaper(work)
      : {
          paperId: `local:${item.pgPaperId}`,
          doi: normalizeDoi(item.doi),
          arxivId: null,
          title: item.title,
          abstract: null,
          year: null,
          venue: null,
          citationCount: 0,
          authors: [],
          concepts: [],
          references: [],
        };
    return {
      ...base,
      // The user's own metadata wins over OpenAlex for their library (OpenAlex titles can be wrong)
      title: item.title || base.title,
      // OpenAlex may resolve an arXiv DOI to the published version; keep the arXiv id so
      // arxiv.org citation links in drafts still resolve to this node
      arxivId: base.arxivId ?? arxivIdFromDoi(item.doi),
      abstract: item.abstract?.trim() || base.abstract,
      concepts: [...new Set([...base.concepts, ...(item.tags ?? []).map((t) => t.toLowerCase())])],
      inLibrary: true,
      pgPaperId: item.pgPaperId,
    };
  });
  log(`resolved ${items.length - unmatched.length}/${items.length} library papers`);

  // 2. Frontier: capped references + most-cited citers of each matched library paper
  const matched = library.filter((p) => !p.paperId.startsWith("local:"));
  const citingByLibrary = new Map<string, OpenAlexWork[]>();
  await mapLimit(matched, 4, async (p) => {
    citingByLibrary.set(p.paperId, maxCiting > 0 ? await getCitingWorks(p.paperId, maxCiting) : []);
  });

  const libraryIds = new Set(library.map((p) => p.paperId));
  const referenceIds = [
    ...new Set(matched.flatMap((p) => p.references.slice(0, maxReferences))),
  ].filter((id) => !libraryIds.has(id));
  const referenceWorks = await getWorksByIds(referenceIds);
  log(`fetched ${referenceWorks.length} referenced works`);

  const frontierById = new Map<string, IngestPaper>();
  for (const w of [...referenceWorks, ...[...citingByLibrary.values()].flat()]) {
    const gp = toGraphPaper(w);
    if (!libraryIds.has(gp.paperId)) frontierById.set(gp.paperId, { ...gp, inLibrary: false, pgPaperId: null });
  }

  // 3. One node per paper: collapse versions sharing a normalised title onto a canonical id.
  //    Priority: node already in the graph > library paper > most-cited version.
  const candidates = [...library, ...frontierById.values()];
  const keys = [...new Set(candidates.map((p) => titleKey(p.title)).filter((k) => k.length >= 12))];
  const existing = (
    await graph.roQuery<{ titleKey: string; paperId: string }>(EXISTING_BY_TITLE_KEY, {
      params: { keys } as never,
    })
  ).data ?? [];
  const canonicalByKey = new Map(existing.map((r) => [r.titleKey, r.paperId]));
  for (const p of [...candidates].sort((a, b) => Number(b.inLibrary) - Number(a.inLibrary) || b.citationCount - a.citationCount)) {
    const k = titleKey(p.title);
    if (k.length >= 12 && !canonicalByKey.has(k)) canonicalByKey.set(k, p.paperId);
  }
  const remap = new Map<string, string>();
  for (const p of candidates) {
    const k = titleKey(p.title);
    const canonical = k.length >= 12 ? canonicalByKey.get(k)! : p.paperId;
    if (canonical !== p.paperId) remap.set(p.paperId, canonical);
  }
  const canon = (id: string) => remap.get(id) ?? id;

  const papers = new Map<string, IngestPaper>();
  for (const p of candidates) {
    const id = canon(p.paperId);
    const prev = papers.get(id);
    if (!prev) {
      papers.set(id, { ...p, paperId: id });
    } else {
      // Merge versions: keep library text, union references/authors/concepts
      papers.set(id, {
        ...(prev.inLibrary ? prev : { ...p, paperId: id }),
        inLibrary: prev.inLibrary || p.inLibrary,
        pgPaperId: prev.pgPaperId ?? p.pgPaperId,
        doi: prev.doi ?? p.doi,
        arxivId: prev.arxivId ?? p.arxivId,
        citationCount: Math.max(prev.citationCount, p.citationCount),
        references: [...new Set([...prev.references, ...p.references])],
        concepts: [...new Set([...prev.concepts, ...p.concepts])],
        authors: prev.authors.length ? prev.authors : p.authors,
      });
    }
  }
  const allPapers = [...papers.values()];
  const allIds = new Set(allPapers.map((p) => p.paperId));
  if (remap.size) log(`merged ${remap.size} duplicate version(s)`);

  // 4. CITES edges between any two papers we know about (library→ref, citer→library,
  //    and frontier↔frontier, which is what makes co-citation / bridge queries interesting)
  const cites = new Set<string>();
  for (const p of allPapers) {
    for (const ref of p.references.map(canon)) {
      if (allIds.has(ref) && ref !== p.paperId) cites.add(`${p.paperId}>${ref}`);
    }
  }
  for (const [libId, citers] of citingByLibrary) {
    for (const w of citers) {
      const from = canon(shortId(w.id));
      const to = canon(libId);
      if (from !== to) cites.add(`${from}>${to}`);
    }
  }

  // 5. Write
  await writeRows(
    graph,
    UPSERT_PAPERS,
    "papers",
    allPapers.map((p) => ({
      paperId: p.paperId,
      titleKey: titleKey(p.title),
      metaSuspect: !p.inLibrary && doiYearMismatch(p.doi, p.year),
      doi: p.doi,
      arxivId: p.arxivId,
      s2Id: null,
      title: p.title,
      abstract: p.abstract,
      year: p.year,
      venue: p.venue,
      citationCount: p.citationCount,
      pgPaperId: p.pgPaperId,
      inLibrary: p.inLibrary,
    })),
  );
  await writeRows(
    graph,
    UPSERT_AUTHORS,
    "rows",
    // position keeps author order, so citations read "[FirstAuthor et al., Year]"
    allPapers.flatMap((p) => p.authors.slice(0, 12).map((a, position) => ({ paperId: p.paperId, ...a, position }))),
  );
  await writeRows(
    graph,
    UPSERT_CONCEPTS,
    "rows",
    allPapers.flatMap((p) => p.concepts.map((name) => ({ paperId: p.paperId, name }))),
  );
  await writeRows(
    graph,
    UPSERT_VENUES,
    "rows",
    allPapers.filter((p) => p.venue).map((p) => ({ paperId: p.paperId, name: p.venue })),
  );
  await writeRows(
    graph,
    UPSERT_CITES,
    "rows",
    [...cites].map((e) => {
      const [from, to] = e.split(">");
      return { from, to };
    }),
  );
  const now = Date.now();
  await writeRows(
    graph,
    UPSERT_IMPORTED,
    "rows",
    items.map((item, i) => ({
      userId: item.userId,
      userName: item.userName ?? null,
      paperId: canon(library[i].paperId),
      source: item.source,
      at: now,
    })),
  );
  const suspect =
    (await graph.query<{ n: number }>(FLAG_SUSPECT_PAPERS)).data?.[0]?.n ?? 0;
  log(`wrote ${allPapers.length} papers, ${cites.size} citations (${suspect} suspect records in graph)`);

  // 6. Embeddings for anything that doesn't have one yet
  const missing = (
    await graph.query<{ paperId: string; title: string; abstract: string | null }>(PAPERS_MISSING_EMBEDDING, {
      params: { paperIds: [...allIds] } as never,
    })
  ).data ?? [];
  if (missing.length) {
    const vectors = await embedTexts(missing.map((p) => paperEmbeddingText(p.title, p.abstract)));
    await writeRows(
      graph,
      SET_EMBEDDINGS,
      "rows",
      missing.map((p, i) => ({ paperId: p.paperId, embedding: vectors[i] })),
    );
  }
  log(`embedded ${missing.length} papers`);

  return {
    library: library.length,
    matched: matched.length,
    unmatched,
    frontier: allPapers.length - library.length,
    merged: remap.size,
    cites: cites.size,
    embedded: missing.length,
    suspect,
    ms: Date.now() - started,
  };
}
