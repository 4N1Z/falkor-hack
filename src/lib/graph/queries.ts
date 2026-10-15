// Every Cypher statement the app runs lives here, parameterised. Agents get tools built
// from these templates; they never write free-form Cypher.

// ---------------------------------------------------------------- Librarian (writes)

/**
 * Upsert papers. Library papers (inLibrary=true) keep the title/abstract the user imported;
 * frontier papers never overwrite a library paper's text. `inLibrary` only ever flips to true.
 */
export const UPSERT_PAPERS = `
UNWIND $papers AS r
MERGE (p:Paper {paperId: r.paperId})
ON CREATE SET p.inLibrary = false, p.createdAt = timestamp()
WITH p, r, p.inLibrary AS wasLibrary
SET p.titleKey = r.titleKey,
    p.metaSuspect = r.metaSuspect,
    p.doi = coalesce(r.doi, p.doi),
    p.arxivId = coalesce(r.arxivId, p.arxivId),
    p.s2Id = coalesce(r.s2Id, p.s2Id),
    p.year = coalesce(r.year, p.year),
    p.venue = coalesce(r.venue, p.venue),
    p.citationCount = coalesce(r.citationCount, p.citationCount),
    p.pgPaperId = coalesce(r.pgPaperId, p.pgPaperId),
    p.title = CASE WHEN wasLibrary AND NOT r.inLibrary THEN p.title ELSE r.title END,
    p.abstract = CASE WHEN wasLibrary AND NOT r.inLibrary THEN p.abstract ELSE coalesce(r.abstract, p.abstract) END
SET p.inLibrary = wasLibrary OR r.inLibrary
RETURN count(p) AS n`;

export const UPSERT_AUTHORS = `
UNWIND $rows AS r
MATCH (p:Paper {paperId: r.paperId})
MERGE (a:Author {authorId: r.authorId})
SET a.name = r.name
MERGE (a)-[:WROTE]->(p)
RETURN count(*) AS n`;

export const UPSERT_CONCEPTS = `
UNWIND $rows AS r
MATCH (p:Paper {paperId: r.paperId})
MERGE (c:Concept {name: r.name})
MERGE (p)-[:ABOUT]->(c)
RETURN count(*) AS n`;

export const UPSERT_VENUES = `
UNWIND $rows AS r
MATCH (p:Paper {paperId: r.paperId})
MERGE (v:Venue {name: r.name})
MERGE (p)-[:PUBLISHED_IN]->(v)
RETURN count(*) AS n`;

export const UPSERT_CITES = `
UNWIND $rows AS r
MATCH (a:Paper {paperId: r.from}), (b:Paper {paperId: r.to})
MERGE (a)-[:CITES]->(b)
RETURN count(*) AS n`;

/** (User)-[:IMPORTED]->(Paper): who brought each paper into the workspace. */
export const UPSERT_IMPORTED = `
UNWIND $rows AS r
MERGE (u:User {id: r.userId})
SET u.name = coalesce(r.userName, u.name)
WITH u, r
MATCH (p:Paper {paperId: r.paperId})
MERGE (u)-[e:IMPORTED]->(p)
ON CREATE SET e.at = r.at, e.source = r.source
RETURN count(e) AS n`;

export const SET_EMBEDDINGS = `
UNWIND $rows AS r
MATCH (p:Paper {paperId: r.paperId})
SET p.embedding = vecf32(r.embedding)
RETURN count(p) AS n`;

export const PAPERS_MISSING_EMBEDDING = `
MATCH (p:Paper)
WHERE p.embedding IS NULL AND p.paperId IN $paperIds
RETURN p.paperId AS paperId, p.title AS title, p.abstract AS abstract`;

/** Existing nodes for a set of normalised titles (dedupes preprint vs. published versions). */
export const EXISTING_BY_TITLE_KEY = `
MATCH (p:Paper) WHERE p.titleKey IN $keys
RETURN p.titleKey AS titleKey, p.paperId AS paperId`;

/**
 * Flag OpenAlex records whose metadata can't be trusted, and keep them out of rankings and
 * suggestions. Two signals:
 *  - metaSuspect (set at ingest): the DOI names a year well after the paper's own year,
 *    i.e. an unrelated newer work's title/DOI was merged onto this record.
 *  - a paper can't be cited by papers older than itself (wrong year, often wrong title too).
 * Library papers carry the user's own metadata and are never flagged.
 */
export const FLAG_SUSPECT_PAPERS = `
MATCH (p:Paper)
OPTIONAL MATCH (q:Paper)-[:CITES]->(p)
WITH p, count(q) AS citers,
     sum(CASE WHEN q.year IS NOT NULL AND p.year IS NOT NULL AND q.year < p.year - 1 THEN 1 ELSE 0 END) AS older
SET p.suspect = (NOT p.inLibrary AND (coalesce(p.metaSuspect, false) OR (citers >= 3 AND older * 2 > citers)))
RETURN sum(CASE WHEN p.suspect THEN 1 ELSE 0 END) AS n`;

// ---------------------------------------------------------------- Full text (writes)

export const DELETE_PAPER_CHUNKS = `
MATCH (c:Chunk {paperId: $paperId})
DETACH DELETE c`;

export const UPSERT_CHUNKS = `
MATCH (p:Paper {paperId: $paperId})
UNWIND $rows AS r
MERGE (c:Chunk {id: r.id})
SET c.paperId = $paperId, c.idx = r.idx, c.text = r.text, c.embedding = vecf32(r.embedding)
MERGE (c)-[:CHUNK_OF]->(p)
RETURN count(c) AS n`;

export const SET_PAPER_INDEXED = `
MATCH (p:Paper {paperId: $paperId})
SET p.chunkCount = $chunks, p.indexedAt = $at
RETURN p.paperId AS paperId`;

/** Map Postgres paper ids to their (canonical) graph nodes. */
export const PAPERS_BY_PG_ID = `
MATCH (p:Paper) WHERE p.pgPaperId IN $pgIds
RETURN p.pgPaperId AS pgPaperId, p.paperId AS paperId`;

/**
 * Graph status for the library UI: matched?, full text indexed?, connections.
 * `ingestedAt` is written only after the whole pipeline (Librarian + full text) finishes,
 * so the UI keeps showing "Indexing" until passages are in too.
 */
export const LIBRARY_GRAPH_STATUS = `
MATCH (p:Paper) WHERE p.pgPaperId IN $pgIds
OPTIONAL MATCH (p)-[c:CITES]-(:Paper)
RETURN p.pgPaperId AS pgPaperId, p.paperId AS paperId, p.year AS year, p.venue AS venue,
       coalesce(p.chunkCount, 0) AS chunks, count(c) AS links, p.ingestedAt IS NOT NULL AS done`;

export const MARK_INGESTED = `
MATCH (p:Paper) WHERE p.pgPaperId IN $pgIds
SET p.ingestedAt = $at
RETURN count(p) AS n`;

// ---------------------------------------------------------------- Ingest status (index health)

/**
 * One IngestStatus per library paper, kept in the workspace graph itself so FalkorDB is
 * the record of what is (and isn't) indexed. state: indexing | done | failed.
 */
export const UPSERT_INGEST_STATUS = `
UNWIND $rows AS r
MERGE (s:IngestStatus {pgPaperId: r.pgPaperId})
SET s.state = r.state, s.error = r.error, s.fullText = coalesce(r.fullText, s.fullText), s.at = r.at
RETURN count(s) AS n`;

export const INGEST_STATUS_FOR = `
MATCH (s:IngestStatus) WHERE s.pgPaperId IN $pgIds
RETURN s.pgPaperId AS pgPaperId, s.state AS state, s.error AS error, s.fullText AS fullText, s.at AS at`;

/** Everything the graph holds for the team's libraries, straight from FalkorDB. */
export const GRAPH_INDEX_PAPERS = `
MATCH (u:User)-[i:IMPORTED]->(p:Paper)
OPTIONAL MATCH (p)-[c:CITES]-(:Paper)
WITH u, i, p, count(c) AS links
RETURN p.paperId AS paperId, p.pgPaperId AS pgPaperId, p.title AS title, p.year AS year,
       coalesce(u.name, 'Collaborator') AS importedBy, i.source AS source,
       coalesce(p.chunkCount, 0) AS chunks, links, p.paperId STARTS WITH 'local:' AS unmatched
ORDER BY i.at DESC`;

export const GRAPH_INDEX_TOTALS = `
MATCH (p:Paper)
WITH count(p) AS papers, sum(CASE WHEN p.inLibrary THEN 1 ELSE 0 END) AS library,
     sum(CASE WHEN p.suspect THEN 1 ELSE 0 END) AS suspect
OPTIONAL MATCH ()-[c:CITES]->()
WITH papers, library, suspect, count(c) AS citations
OPTIONAL MATCH (k:Chunk)
WITH papers, library, suspect, citations, count(k) AS passages
OPTIONAL MATCH (a:Author)
WITH papers, library, suspect, citations, passages, count(a) AS authors
OPTIONAL MATCH (t:Concept)
WITH papers, library, suspect, citations, passages, authors, count(t) AS concepts
OPTIONAL MATCH (cl:Claim)
RETURN papers, library, suspect, citations, passages, authors, concepts, count(cl) AS claims`;

// ---------------------------------------------------------------- Documents (writes)

export const UPSERT_DOCUMENT = `
MERGE (d:Document {fileId: $fileId})
SET d.title = $title, d.updatedAt = $at
MERGE (u:User {id: $userId})
SET u.name = coalesce($userName, u.name)
MERGE (u)-[e:EDITS]->(d)
SET e.lastAt = $at
RETURN d.fileId AS fileId`;

/** Sentences that no longer exist in the draft go away (with any verdicts attached). */
export const DELETE_STALE_CLAIMS = `
MATCH (d:Document {fileId: $fileId})-[:CONTAINS]->(c:Claim)
WHERE NOT c.id IN $ids
DETACH DELETE c`;

export const UPSERT_CLAIMS = `
MATCH (d:Document {fileId: $fileId})
UNWIND $claims AS r
MERGE (c:Claim {id: r.id})
SET c.text = r.text, c.order = r.order, c.fileId = $fileId, c.citedUrls = r.citedUrls
MERGE (d)-[:CONTAINS]->(c)
RETURN count(c) AS n`;

// Two statements on purpose: in FalkorDB, `MATCH … DELETE r WITH count(*) UNWIND … MERGE`
// silently creates nothing (verified Oct 15), although each half works on its own.
export const DELETE_CLAIM_CITES = `
MATCH (:Document {fileId: $fileId})-[:CONTAINS]->(:Claim)-[r:CITES]->(:Paper)
DELETE r`;

/** Citations the author inserted are user-made, so they are accepted facts, not proposals. */
export const INSERT_CLAIM_CITES = `
UNWIND $cites AS e
MATCH (c:Claim {id: e.claimId}), (p:Paper {paperId: e.paperId})
MERGE (c)-[r:CITES]->(p)
SET r.status = 'accepted', r.by = 'user'
RETURN count(r) AS n`;

export const RESOLVE_CITED_PAPERS = `
MATCH (p:Paper)
WHERE p.doi IN $dois OR p.arxivId IN $arxivIds OR p.s2Id IN $s2Ids
RETURN p.paperId AS paperId, p.doi AS doi, p.arxivId AS arxivId, p.s2Id AS s2Id`;

// ---------------------------------------------------------------- Agents

export const RECORD_AGENT_RUN = `
CREATE (r:AgentRun {id: $id, agent: $agent, at: $at, ms: $ms, outcome: $outcome,
                    userId: $userId, input: $input, trace: $trace, items: $items})
RETURN r.id AS id`;

/**
 * Proposal endpoints are matched on any node's id-like key (paperId / id / fileId), so the
 * same accept/reject works for Claim→Paper, Idea→Paper, Hypothesis→Paper, etc.
 */
const PROPOSAL_MATCH = `
MATCH (a)-[r {runId: $runId}]->(b)
WHERE coalesce(a.id, a.paperId, a.fileId) = $fromId
  AND coalesce(b.id, b.paperId, b.fileId) = $toId
  AND r.status = 'suggested'`;

export const ACCEPT_PROPOSAL = `${PROPOSAL_MATCH}
SET r.status = 'accepted', r.decidedBy = $userId, r.decidedAt = $at
RETURN count(r) AS n`;

/** Rejections are kept (not deleted) so agents don't re-suggest what a person turned down. */
export const REJECT_PROPOSAL = `${PROPOSAL_MATCH}
SET r.status = 'rejected', r.decidedBy = $userId, r.decidedAt = $at
RETURN count(r) AS n`;

// ---------------------------------------------------------------- Reads

export const GRAPH_STATS = `
MATCH (p:Paper)
WITH count(p) AS papers, sum(CASE WHEN p.inLibrary THEN 1 ELSE 0 END) AS library
OPTIONAL MATCH ()-[c:CITES]->()
WITH papers, library, count(c) AS cites
OPTIONAL MATCH (a:Author)
WITH papers, library, cites, count(a) AS authors
OPTIONAL MATCH (k:Concept)
RETURN papers, library, cites, authors, count(k) AS concepts`;

export const IMPORTS_PER_USER = `
MATCH (u:User)-[:IMPORTED]->(p:Paper)
RETURN u.id AS userId, u.name AS name, count(p) AS papers
ORDER BY papers DESC`;
