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
MERGE (a)-[w:WROTE]->(p)
SET w.position = r.position
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
WHERE p.doi IN $dois OR p.arxivId IN $arxivIds OR p.s2Id IN $s2Ids OR p.paperId IN $paperIds
RETURN p.paperId AS paperId, p.doi AS doi, p.arxivId AS arxivId, p.s2Id AS s2Id`;

// ---------------------------------------------------------------- Agents

export const RECORD_AGENT_RUN = `
CREATE (r:AgentRun {id: $id, agent: $agent, at: $at, ms: $ms, outcome: $outcome,
                    userId: $userId, input: $input, trace: $trace, items: $items, highlight: $highlight})
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

// ---------------------------------------------------------------- Cite Scout

/**
 * Provenance: the shortest citation chain (≤2 hops, either direction) from each candidate to
 * a paper the requesting user brought in. Explains *why* a collaborator's paper matters to you.
 * Returns plain values per row (no collected lists) — see the FalkorDB null-list crash note.
 */
export const PATHS_TO_USER_LIBRARY = `
UNWIND $ids AS id
MATCH (p:Paper {paperId: id})
MATCH (:User {id: $userId})-[:IMPORTED]->(mine:Paper)
WHERE mine.paperId <> id
MATCH path = (p)-[:CITES*1..2]-(mine)
WHERE all(n IN nodes(path) WHERE coalesce(n.suspect, false) = false)
WITH id, path, length(path) AS hops
ORDER BY hops ASC
WITH id, head(collect(path)) AS best
RETURN id AS paperId,
       [n IN nodes(best) | n.paperId] AS nodeIds,
       [n IN nodes(best) | n.title] AS titles,
       [r IN relationships(best) | startNode(r).paperId] AS from`;

/** Papers already cited by the claim, and any the user dismissed for it (never re-suggest). */
export const CLAIM_EXCLUSIONS = `
MATCH (c:Claim {id: $claimId})-[r]->(p:Paper)
WHERE type(r) = 'CITES' OR (type(r) = 'SUGGESTS_CITE' AND r.status = 'rejected')
RETURN p.paperId AS paperId`;

/** Record Cite Scout's suggestions as proposals on the claim (status: suggested). */
export const UPSERT_CITE_PROPOSALS = `
MATCH (c:Claim {id: $claimId})
UNWIND $rows AS r
MATCH (p:Paper {paperId: r.paperId})
MERGE (c)-[s:SUGGESTS_CITE]->(p)
ON CREATE SET s.status = 'suggested'
SET s.by = 'agent:cite-scout', s.runId = $runId, s.at = $at, s.relevance = r.relevance, s.confidence = r.confidence
RETURN count(s) AS n`;

/** A person accepts or dismisses one Cite Scout suggestion (by claim + paper). */
export const DECIDE_CITE_PROPOSAL = `
MATCH (c:Claim {id: $claimId})
MATCH (p:Paper {paperId: $paperId})
MERGE (c)-[s:SUGGESTS_CITE]->(p)
SET s.status = $decision, s.decidedBy = $userId, s.decidedAt = $at, s.by = coalesce(s.by, 'agent:cite-scout')
RETURN count(s) AS n`;

// ---------------------------------------------------------------- Citation Checker

/** Every claim in a document with each paper it cites (one row per claim×paper; uncited → null paper). */
export const DOCUMENT_CLAIMS = `
MATCH (:Document {fileId: $fileId})-[:CONTAINS]->(c:Claim)
OPTIONAL MATCH (c)-[:CITES]->(p:Paper)
RETURN c.id AS claimId, c.text AS text, c.order AS ord, size(coalesce(c.citedUrls, [])) AS urlCount,
       p.paperId AS paperId, p.title AS title, p.abstract AS abstract, p.year AS year,
       [(u:User)-[:IMPORTED]->(p) | coalesce(u.name, 'Collaborator')] AS owners
ORDER BY ord`;

/** Best passage of each given paper for a claim vector (over-fetch, then keep the cited papers). */
export const BEST_PASSAGES_IN_PAPERS = `
CALL db.idx.vector.queryNodes('Chunk', 'embedding', $k, vecf32($v)) YIELD node, score
WHERE node.paperId IN $paperIds
RETURN node.paperId AS paperId, node.text AS text, score
ORDER BY score ASC`;

/** Record a verdict as a proposal edge (agents never assert; people decide). */
export const UPSERT_SUPPORT_VERDICT = `
MATCH (c:Claim {id: $claimId}), (p:Paper {paperId: $paperId})
MERGE (c)-[s:SUPPORTED_BY]->(p)
SET s.level = $level, s.score = $score, s.confidence = $confidence, s.runId = $runId,
    s.by = 'agent:citation-checker', s.at = $at, s.status = coalesce(s.status, 'suggested')
RETURN count(s) AS n`;

// ---------------------------------------------------------------- Historian (research memory)

/**
 * A memory is a hypothesis, finding or question someone recorded. Time-aware: validFrom when
 * recorded, validTo when a hypothesis is dropped (so agents can tell "what we believed when").
 */
export const CREATE_MEMORY = `
MERGE (u:User {id: $userId})
SET u.name = coalesce($userName, u.name)
CREATE (m:Memory {id: $id, kind: $kind, text: $text, status: $status, validFrom: $at,
                  fileId: $fileId, byName: $userName, classifiedBy: $classifiedBy, embedding: vecf32($v)})
CREATE (u)-[:RECORDED]->(m)
WITH m
UNWIND $aboutIds AS pid
MATCH (p:Paper {paperId: pid})
MERGE (m)-[:ABOUT]->(p)
RETURN count(*) AS n`;

export const MEMORY_TIMELINE = `
MATCH (m:Memory)
RETURN m.id AS id, m.kind AS kind, m.text AS text, m.status AS status, m.validFrom AS validFrom,
       m.validTo AS validTo, m.reason AS reason, coalesce(m.byName, 'Collaborator') AS byName,
       [(m)-[:ABOUT]->(p:Paper) | p.title] AS about,
       [(m)-[:DROPPED_BECAUSE]->(p:Paper) | p.title] AS droppedBecause
ORDER BY m.validFrom DESC
LIMIT $limit`;

export const SET_MEMORY_STATUS = `
MATCH (m:Memory {id: $id})
SET m.status = $status, m.reason = $reason, m.decidedBy = $userName,
    m.validTo = CASE WHEN $status = 'dropped' THEN $at ELSE null END
WITH m
OPTIONAL MATCH (m)-[old:DROPPED_BECAUSE]->()
DELETE old
RETURN m.id AS id`;

export const LINK_DROPPED_BECAUSE = `
MATCH (m:Memory {id: $id}), (p:Paper {paperId: $paperId})
MERGE (m)-[:DROPPED_BECAUSE]->(p)
RETURN m.id AS id`;

/** Memories closest in meaning to a text (filter by kind/status in the caller's WHERE). */
export const SIMILAR_MEMORIES = `
CALL db.idx.vector.queryNodes('Memory', 'embedding', $k, vecf32($v)) YIELD node, score
WHERE ($kind IS NULL OR node.kind = $kind) AND ($status IS NULL OR node.status = $status)
RETURN node.id AS id, node.kind AS kind, node.text AS text, node.status AS status,
       node.validFrom AS validFrom, node.validTo AS validTo, node.reason AS reason,
       coalesce(node.byName, 'Collaborator') AS byName, score
ORDER BY score ASC
LIMIT $limit`;

// ---------------------------------------------------------------- Next-Step (ideas)

/** Topics the team's neighbourhood of papers is about, that no team paper covers yet. */
export const LITERATURE_GAPS = `
MATCH (lib:Paper {inLibrary: true})-[:CITES]-(f:Paper)-[:ABOUT]->(c:Concept)
WHERE coalesce(f.inLibrary, false) = false AND coalesce(f.suspect, false) = false
  AND NOT (c)<-[:ABOUT]-(:Paper {inLibrary: true})
WITH c, count(DISTINCT f) AS papers, count(DISTINCT lib) AS near
WHERE papers >= 2
RETURN c.name AS concept, papers, near
ORDER BY papers DESC, near DESC
LIMIT 8`;

/** Papers outside the library that connect two or more collaborators' libraries. */
export const BRIDGE_PAPERS = `
MATCH (u:User)-[:IMPORTED]->(lib:Paper)-[:CITES]-(f:Paper)
WHERE coalesce(f.inLibrary, false) = false AND coalesce(f.suspect, false) = false
WITH f, count(DISTINCT u) AS owners, count(DISTINCT lib) AS links,
     collect(DISTINCT coalesce(u.name, 'Collaborator')) AS names
WHERE owners >= 2
RETURN f.paperId AS paperId, f.title AS title, f.year AS year, owners, links, names
ORDER BY owners DESC, links DESC
LIMIT 6`;

/** Most central recent papers the team hasn't added yet (PageRank over CITES). */
export const INFLUENTIAL_UNREAD = `
CALL algo.pageRank('Paper', 'CITES') YIELD node, score
WHERE coalesce(node.inLibrary, false) = false AND coalesce(node.suspect, false) = false
  AND node.year IS NOT NULL AND node.year >= $sinceYear
RETURN node.paperId AS paperId, node.title AS title, node.year AS year, score
ORDER BY score DESC
LIMIT 6`;

export const CREATE_IDEA = `
CREATE (i:Idea {id: $id, title: $title, text: $text, action: $action, kind: $kind, status: 'suggested',
                by: 'agent:next-steps', runId: $runId, at: $at, novelty: $novelty, feasibility: $feasibility})
WITH i
UNWIND $paperIds AS pid
MATCH (p:Paper {paperId: pid})
MERGE (i)-[:GROUNDED_IN]->(p)
RETURN count(*) AS n`;

export const LINK_IDEA_CONCEPTS = `
MATCH (i:Idea {id: $id})
UNWIND $concepts AS name
MATCH (c:Concept {name: name})
MERGE (i)-[:GROUNDED_IN]->(c)
RETURN count(*) AS n`;

export const SET_IDEA_STATUS = `
MATCH (i:Idea {id: $id})
SET i.status = $status, i.decidedBy = $userName, i.decidedAt = $at
RETURN i.id AS id`;

export const RECENT_IDEAS = `
MATCH (i:Idea) WHERE i.status IN $statuses
RETURN i.id AS id, i.title AS title, i.text AS text, i.action AS action, i.kind AS kind, i.status AS status,
       i.novelty AS novelty, i.feasibility AS feasibility, i.at AS at,
       [(i)-[:GROUNDED_IN]->(p:Paper) | p.title] AS papers,
       [(i)-[:GROUNDED_IN]->(c:Concept) | c.name] AS concepts
ORDER BY i.at DESC
LIMIT $limit`;

// ---------------------------------------------------------------- Research Graph page (reads)

export const VIEW_TEAM = `
MATCH (u:User)-[:IMPORTED]->(p:Paper)
RETURN u.id AS userId, coalesce(u.name, 'Collaborator') AS userName, p.paperId AS paperId, p.title AS title,
       p.year AS year, coalesce(p.chunkCount, 0) AS chunks`;

/** Papers outside the library that connect to several team papers (the useful neighbourhood). */
export const VIEW_FRONTIER = `
MATCH (t:Paper {inLibrary: true})-[:CITES]-(f:Paper)
WHERE coalesce(f.inLibrary, false) = false AND coalesce(f.suspect, false) = false
WITH f, count(DISTINCT t) AS deg
WHERE deg >= $minDeg
RETURN f.paperId AS paperId, f.title AS title, f.year AS year, deg
ORDER BY deg DESC
LIMIT $limit`;

export const VIEW_CITES = `
MATCH (a:Paper)-[:CITES]->(b:Paper)
WHERE a.paperId IN $ids AND b.paperId IN $ids
RETURN a.paperId AS source, b.paperId AS target`;

export const VIEW_MEMORY = `
MATCH (m:Memory)
RETURN m.id AS id, m.kind AS kind, m.status AS status, m.text AS text,
       [(m)-[:ABOUT]->(p:Paper) | p.paperId] AS about`;

export const VIEW_IDEAS = `
MATCH (i:Idea) WHERE i.status <> 'rejected'
RETURN i.id AS id, i.title AS title, i.status AS status,
       [(i)-[:GROUNDED_IN]->(p:Paper) | p.paperId] AS grounded`;

/** Team map: papers outside the library that connect 2+ collaborators' libraries. */
export const VIEW_BRIDGES = `
MATCH (u:User)-[:IMPORTED]->(lib:Paper)-[:CITES]-(f:Paper)
WHERE coalesce(f.inLibrary, false) = false AND coalesce(f.suspect, false) = false
WITH f, count(DISTINCT u) AS owners, count(DISTINCT lib) AS links
WHERE owners >= 2
RETURN f.paperId AS paperId, f.title AS title, f.year AS year, owners, links
ORDER BY owners DESC, links DESC
LIMIT $limit`;

/** Paper focus: one paper's citation neighbourhood, team papers first. */
export const VIEW_FOCUS = `
MATCH (p:Paper {paperId: $paperId})-[r:CITES]-(n:Paper)
WHERE coalesce(n.suspect, false) = false
RETURN DISTINCT n.paperId AS paperId, n.title AS title, n.year AS year, coalesce(n.inLibrary, false) AS inLibrary,
       coalesce(n.citationCount, 0) AS citations, startNode(r).paperId = $paperId AS outgoing
ORDER BY inLibrary DESC, citations DESC
LIMIT $limit`;

export const VIEW_PAPERS_BY_ID = `
MATCH (p:Paper) WHERE p.paperId IN $ids
RETURN p.paperId AS paperId, p.title AS title, p.year AS year, coalesce(p.inLibrary, false) AS inLibrary,
       coalesce(p.chunkCount, 0) AS chunks`;

export const VIEW_NOTES_BY_ID = `
MATCH (n) WHERE (n:Idea OR n:Memory) AND n.id IN $ids
RETURN n.id AS id, coalesce(n.title, n.text) AS label, CASE WHEN n:Idea THEN 'idea' ELSE 'memory' END AS kind,
       n.status AS status, [(n)-[:GROUNDED_IN|ABOUT]->(p:Paper) | p.paperId] AS papers`;

export const RECENT_RUNS = `
MATCH (r:AgentRun) WHERE r.agent <> 'librarian'
RETURN r.id AS id, r.agent AS agent, r.at AS at, r.ms AS ms, r.outcome AS outcome, r.items AS items,
       r.input AS input, r.trace AS trace, coalesce(r.highlight, []) AS highlight
ORDER BY r.at DESC
LIMIT $limit`;

// ---------------------------------------------------------------- Team library search

/** Semantic candidates among papers collaborators brought in (k over-fetches, then filters). */
export const TEAM_VECTOR_SEARCH = `
CALL db.idx.vector.queryNodes('Paper', 'embedding', $k, vecf32($v)) YIELD node, score
WHERE node.inLibrary = true
RETURN node.paperId AS paperId, score
ORDER BY score ASC
LIMIT $limit`;

/** Keyword candidates (RediSearch syntax: terms are OR'd by the caller). */
export const TEAM_FULLTEXT_SEARCH = `
CALL db.idx.fulltext.queryNodes('Paper', $q) YIELD node, score
WHERE node.inLibrary = true
RETURN node.paperId AS paperId, score
ORDER BY score DESC
LIMIT $limit`;

/** Passage-level candidates: the best matching full-text chunk per team paper. */
export const TEAM_CHUNK_SEARCH = `
CALL db.idx.vector.queryNodes('Chunk', 'embedding', $k, vecf32($v)) YIELD node, score
MATCH (node)-[:CHUNK_OF]->(p:Paper)
WHERE p.inLibrary = true
RETURN p.paperId AS paperId, score, node.id AS chunkId, node.text AS text
ORDER BY score ASC
LIMIT $limit`;

/** Display fields for a set of team papers. Pattern comprehensions never yield nulls. */
export const TEAM_PAPER_DETAILS = `
MATCH (p:Paper) WHERE p.paperId IN $ids
RETURN p.paperId AS paperId, p.title AS title, p.year AS year, p.doi AS doi, p.arxivId AS arxivId,
       p.abstract AS abstract, coalesce(p.chunkCount, 0) AS chunks,
       [(u:User)-[:IMPORTED]->(p) | coalesce(u.name, 'Collaborator')] AS owners,
       [(u:User)-[:IMPORTED]->(p) | u.id] AS ownerIds,
       [(a:Author)-[w:WROTE]->(p) WHERE a.name IS NOT NULL | {name: a.name, pos: coalesce(w.position, 99)}] AS authorRows`;

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

// ---------------------------------------------------------------- Synthesis (literature review)

/** Team papers grouped by citation community (CDLP over the whole CITES graph). */
export const TEAM_COMMUNITIES = `
CALL algo.labelPropagation({nodeLabels: ['Paper'], relationshipTypes: ['CITES'], maxIterations: 20}) YIELD node, communityId
WHERE node.inLibrary = true
RETURN node.paperId AS paperId, communityId`;

/** Centrality of the team's papers in the citation graph (PageRank). */
export const TEAM_PAGERANK = `
CALL algo.pageRank('Paper', 'CITES') YIELD node, score
WHERE node.inLibrary = true
RETURN node.paperId AS paperId, score`;

/** Citations between the given papers (to tell the writer which papers build on which). */
export const CITES_AMONG = `
MATCH (a:Paper)-[:CITES]->(b:Paper)
WHERE a.paperId IN $ids AND b.paperId IN $ids
RETURN a.paperId AS source, b.paperId AS target`;

// ---------------------------------------------------------------- Scout Watcher (new papers)

/** Which of these OpenAlex works are already in the team library. */
export const LIBRARY_STATUS = `
MATCH (p:Paper) WHERE p.paperId IN $ids AND p.inLibrary = true
RETURN p.paperId AS paperId`;

// ---------------------------------------------------------------- MCP (read-only tools)

/** Shortest citation chain between two papers, in either direction. */
export const CITATION_PATH = `
MATCH (a:Paper {paperId: $a}), (b:Paper {paperId: $b})
WITH a, b
MATCH p = allShortestPaths((a)-[:CITES*..5]-(b))
RETURN [n IN nodes(p) | n.paperId] AS ids, [n IN nodes(p) | n.title] AS titles
LIMIT 1`;

/** Papers matching a title fragment (to resolve names to ids). */
export const FIND_PAPERS_BY_TITLE = `
MATCH (p:Paper)
WHERE toLower(p.title) CONTAINS toLower($q)
RETURN p.paperId AS paperId, p.title AS title, p.year AS year, coalesce(p.inLibrary, false) AS inLibrary
ORDER BY inLibrary DESC, coalesce(p.citationCount, 0) DESC
LIMIT 10`;

// ---------------------------------------------------------------- Evidence map (one document)

/** The Citation Checker's latest verdict, stored on the claim itself. */
export const SET_CLAIM_VERDICT = `
MATCH (c:Claim {id: $claimId})
SET c.verdict = $verdict, c.why = $why, c.checkedAt = $at, c.checkRun = $runId
RETURN c.id AS id`;

/** Checker fix for an uncited claim, as a proposal (never overrides a person's decision). */
export const UPSERT_CHECKER_SUGGESTION = `
MATCH (c:Claim {id: $claimId}), (p:Paper {paperId: $paperId})
MERGE (c)-[s:SUGGESTS_CITE]->(p)
ON CREATE SET s.status = 'suggested', s.by = 'agent:citation-checker', s.runId = $runId, s.at = $at
RETURN count(s) AS n`;

export const EVIDENCE_CLAIMS = `
MATCH (:Document {fileId: $fileId})-[:CONTAINS]->(c:Claim)
RETURN c.id AS id, c.text AS text, c.order AS ord, c.verdict AS verdict, c.why AS why, c.checkedAt AS checkedAt,
       size(coalesce(c.citedUrls, [])) AS urlCount
ORDER BY ord`;

export const EVIDENCE_CITES = `
MATCH (:Document {fileId: $fileId})-[:CONTAINS]->(c:Claim)-[:CITES]->(p:Paper)
OPTIONAL MATCH (c)-[s:SUPPORTED_BY]->(p)
RETURN c.id AS claimId, p.paperId AS paperId, p.title AS title, p.year AS year,
       coalesce(p.inLibrary, false) AS inLibrary, [(u:User)-[:IMPORTED]->(p) | u.id] AS ownerIds,
       s.level AS level, s.score AS score`;

export const EVIDENCE_SUGGESTIONS = `
MATCH (:Document {fileId: $fileId})-[:CONTAINS]->(c:Claim)-[s:SUGGESTS_CITE]->(p:Paper)
WHERE s.status = 'suggested'
RETURN c.id AS claimId, p.paperId AS paperId, p.title AS title, p.year AS year,
       coalesce(p.inLibrary, false) AS inLibrary, [(u:User)-[:IMPORTED]->(p) | u.id] AS ownerIds,
       s.by AS by, coalesce(s.relevance, 0) AS relevance
ORDER BY relevance DESC`;

export const WORKSPACE_USERS = `
MATCH (u:User)
RETURN u.id AS id, coalesce(u.name, 'Collaborator') AS name`;
