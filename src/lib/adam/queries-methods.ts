// adam Cypher for the Methods Hunter: which methods to chase, their mentions' passages,
// linked artefacts, and the Procedure / Instrument / Result nodes that make a method runnable.

/** Methods worth chasing: used by at least one verified claim, most-depended-on first. */
export const METHODS_TO_HUNT = `
MATCH (m:Method {projectId: $projectId})
WHERE m.state IN ['agent_verified', 'human_approved', 'low_confidence']
OPTIONAL MATCH (c:Claim)-[:USES]->(m) WHERE c.state IN ['agent_verified', 'human_approved']
WITH m, count(c) AS claims
OPTIONAL MATCH (pr:Procedure)-[:SPECIFIES]->(m)
WITH m, claims, collect(pr.id)[0] AS procedureId, collect(coalesce(pr.textVersion, 0))[0] AS procedureVersion
RETURN m.id AS id, m.name AS name, coalesce(m.aliases, []) AS aliases, claims, coalesce(m.dependents, 0) AS dependents,
       coalesce(m.loadBearing, false) AS loadBearing, coalesce(procedureId, '') AS procedureId, coalesce(m.chainsNeeding, 0) AS chainsNeeding,
       m.huntedAt AS huntedAt, m.huntNote AS huntNote
ORDER BY chainsNeeding DESC, dependents DESC, claims DESC`;

/** Every mention of a method with the passage it was quoted from, plus the methods-side passages of those papers. */
export const METHOD_SOURCES = `
MATCH (m:Method {id: $methodId})-[u:USED_IN]->(p:Paper)
OPTIONAL MATCH (ch:Chunk {id: u.chunkId})
RETURN p.paperId AS paperId, p.title AS paperTitle, p.year AS year, coalesce(u.name, m.name) AS name, coalesce(u.quote, '') AS quote,
       coalesce(u.parameters, []) AS parameters, coalesce(u.page, 0) AS page, coalesce(u.state, '') AS state,
       coalesce(ch.id, '') AS chunkId, coalesce(ch.text, '') AS chunkText, coalesce(ch.section, '') AS section`;

/** Methods / appendix / supplementary / caption passages of the papers that use a method. */
export const METHOD_PAPER_PASSAGES = `
MATCH (m:Method {id: $methodId})-[:USED_IN]->(p:Paper)<-[:CHUNK_OF]-(c:Chunk)
WHERE c.section IN ['methods', 'appendix', 'supplementary'] OR c.kind = 'caption' OR coalesce(c.doc, 'body') = 'artefact'
RETURN p.paperId AS paperId, p.title AS paperTitle, c.id AS id, c.text AS text, coalesce(c.page, 0) AS page,
       coalesce(c.section, 'unknown') AS section, coalesce(c.kind, 'body') AS kind, coalesce(c.doc, 'body') AS doc, c.idx AS idx
ORDER BY p.paperId, doc, idx`;

/** URLs printed in the papers that use a method (code, data, protocols). */
export const METHOD_PAPER_URLS = `
MATCH (m:Method {id: $methodId})-[:USED_IN]->(p:Paper)<-[:CHUNK_OF]-(c:Chunk)
WHERE c.text CONTAINS 'http'
RETURN p.paperId AS paperId, c.text AS text, coalesce(p.artefactUrls, []) AS fetched`;

export const ADD_PAPER_ARTEFACT = `
MATCH (p:Paper {paperId: $paperId})
SET p.artefactUrls = CASE WHEN $url IN coalesce(p.artefactUrls, []) THEN p.artefactUrls ELSE coalesce(p.artefactUrls, []) + $url END
RETURN p.paperId AS paperId`;

export const UPSERT_PROCEDURE = `
MATCH (m:Method {id: $methodId})
MERGE (pr:Procedure {id: $id})
ON CREATE SET pr.createdAt = $at
SET pr.projectId = $projectId, pr.name = $name, pr.summary = $summary, pr.inputs = $inputs, pr.outputs = $outputs,
    pr.expected = $expected, pr.conditions = $conditions, pr.equipment = $equipment, pr.steps = $steps,
    pr.timeHours = $timeHours, pr.costUsd = $costUsd, pr.reliability = $reliability, pr.reliabilityNote = $reliabilityNote,
    pr.prerequisites = $prerequisites, pr.missing = $missing, pr.runnability = $runnability, pr.runnabilityNote = $runnabilityNote,
    pr.feasibility = $feasibility, pr.feasibilityNote = $feasibilityNote, pr.sources = $sources, pr.quote = $quote, pr.chunkId = $chunkId,
    pr.page = $page, pr.paperId = $paperId, pr.state = $state, pr.confidence = $confidence, pr.extractedBy = $runId,
    pr.textVersion = $textVersion, pr.updatedAt = $at, pr.embedding = vecf32($embedding), pr.stateReason = null
MERGE (pr)-[s:SPECIFIES]->(m)
SET s.by = $by, s.runId = $runId, s.status = 'suggested', s.at = $at
SET m.huntedAt = $at
RETURN pr.id AS id`;

export const UPSERT_RESULT = `
MATCH (pr:Procedure {id: $procedureId})
MERGE (r:Result {id: $id})
ON CREATE SET r.createdAt = $at
SET r.projectId = $projectId, r.text = $text, r.state = $state, r.confidence = $confidence, r.extractedBy = $runId,
    r.paperId = $paperId, r.quote = $quote, r.chunkId = $chunkId, r.page = $page, r.embedding = vecf32($embedding), r.updatedAt = $at
MERGE (pr)-[p:PRODUCES]->(r)
SET p.by = $by, p.runId = $runId, p.status = 'suggested', p.at = $at
RETURN r.id AS id`;

export const INSTRUMENT_BY_KEY = `
MATCH (i:Instrument {projectId: $projectId, nameKey: $nameKey})
RETURN i.id AS id`;

export const UPSERT_INSTRUMENT = `
MERGE (i:Instrument {id: $id})
ON CREATE SET i.projectId = $projectId, i.name = $name, i.nameKey = $nameKey, i.kind = $kind, i.createdAt = $at, i.state = 'extracted'
RETURN i.id AS id`;

export const LINK_PROCEDURE_USES = `
MATCH (pr:Procedure {id: $procedureId}), (i:Instrument {id: $instrumentId})
MERGE (pr)-[u:USES]->(i)
SET u.by = $by, u.runId = $runId, u.status = 'suggested', u.at = $at, u.available = $available
RETURN count(u) AS n`;

/** A prerequisite step: another procedure in the project (matched by its method's name key). */
export const PROCEDURE_BY_METHOD_KEY = `
MATCH (pr:Procedure {projectId: $projectId})-[:SPECIFIES]->(m:Method)
WHERE m.nameKey = $nameKey OR $nameKey IN [a IN coalesce(m.aliases, []) | toLower(a)]
RETURN pr.id AS id, pr.name AS name
LIMIT 1`;

export const LINK_PROCEDURE_DEPENDS = `
MATCH (a:Procedure {id: $fromId}), (b:Procedure {id: $toId})
WHERE a.id <> b.id
MERGE (a)-[d:DEPENDS_ON]->(b)
SET d.by = $by, d.runId = $runId, d.status = 'suggested', d.at = $at,
    d.weight = 1 + coalesce(b.timeHours, 0) + coalesce(b.costUsd, 0) * 0.01
RETURN count(d) AS n`;

export const CLEAR_PROCEDURE_LINKS = `
MATCH (pr:Procedure {id: $id})-[r:USES|DEPENDS_ON]->()
DELETE r`;

/** The Methods tab: every method with its procedure, feasibility and what is still missing. */
export const METHODS_DOSSIER = `
MATCH (m:Method {projectId: $projectId})
WHERE m.state <> 'retracted'
OPTIONAL MATCH (c:Claim)-[:USES]->(m) WHERE c.state <> 'retracted'
WITH m, count(DISTINCT c) AS claims
OPTIONAL MATCH (m)-[:USED_IN]->(p:Paper)
WITH m, claims, count(DISTINCT p) AS papers
OPTIONAL MATCH (pr:Procedure)-[:SPECIFIES]->(m)
RETURN m.id AS id, m.name AS name, coalesce(m.aliases, []) AS aliases, m.state AS state, claims, papers,
       coalesce(m.dependents, 0) AS dependents, coalesce(m.loadBearing, false) AS loadBearing, coalesce(m.chainsNeeding, 0) AS chainsNeeding,
       m.huntedAt AS huntedAt,
       pr.id AS procedureId, pr.name AS procedureName, pr.runnability AS runnability, pr.runnabilityNote AS runnabilityNote,
       pr.feasibility AS feasibility, pr.feasibilityNote AS feasibilityNote, coalesce(pr.missing, []) AS missing,
       coalesce(pr.inputs, []) AS inputs, coalesce(pr.outputs, []) AS outputs, coalesce(pr.equipment, []) AS equipment,
       pr.timeHours AS timeHours, pr.costUsd AS costUsd, pr.reliability AS reliability, coalesce(pr.steps, []) AS steps,
       coalesce(pr.sources, '[]') AS sources, pr.state AS procedureState, pr.expected AS expected
ORDER BY chainsNeeding DESC, dependents DESC, claims DESC, m.name`;

export const SET_METHOD_HUNT_NOTE = `
MATCH (m:Method {id: $id})
SET m.huntNote = $note
RETURN m.id AS id`;
