// adam Cypher for extraction cards: what the Extractor writes, what the Verifier reads and
// decides, entity resolution for methods and assumptions, cross-slot merging, cross-paper
// contradictions and load-bearing marks. Same rules as queries.ts: parameterised, projectId
// on every match, no nulls in returned lists, deletes separate from merges.

export const SET_PAPER_ADAM_STATE = `
MATCH (p:Paper {paperId: $paperId})
SET p.adamState = $state, p.adamAt = $at, p.adamProject = $projectId
RETURN p.paperId AS paperId`;

/** Papers the extract phase must process: core / contradicting / method papers. */
export const PAPERS_TO_EXTRACT = `
MATCH (:AdamProject {id: $projectId})-[t:TRIAGED]->(p:Paper)
WHERE t.label IN ['core', 'contradicts', 'method_only']
RETURN p.paperId AS paperId, p.title AS title, t.label AS label, coalesce(p.chunkCount, 0) AS chunks,
       coalesce(p.textVersion, 0) AS textVersion, p.abstract IS NOT NULL AND p.abstract <> '' AS hasAbstract,
       p.adamState AS adamState, p.adamAt AS adamAt, t.decidedBy AS decidedBy`;

export const PAPER_FOR_EXTRACTION = `
MATCH (p:Paper {paperId: $paperId})
RETURN p.paperId AS paperId, p.title AS title, p.abstract AS abstract, p.year AS year, p.venue AS venue,
       coalesce(p.chunkCount, 0) AS chunks, coalesce(p.textVersion, 0) AS textVersion,
       coalesce(p.accessStatus, 'unknown') AS accessStatus`;

/** Chunks of a paper for the extractor prompt: body first, then supplements and artefacts. */
export const PAPER_CHUNKS_FOR_PROMPT = `
MATCH (c:Chunk {paperId: $paperId})
RETURN c.id AS id, c.idx AS idx, c.text AS text, coalesce(c.page, 0) AS page, coalesce(c.section, 'unknown') AS section,
       coalesce(c.kind, 'body') AS kind, c.locator AS locator, coalesce(c.doc, 'body') AS doc
ORDER BY CASE coalesce(c.doc, 'body') WHEN 'body' THEN 0 WHEN 'supplement' THEN 1 ELSE 2 END, idx`;

// ---------------------------------------------------------------- Writing a card (replace per slot)

export const DELETE_CARD_NODES = `
MATCH (n {cardId: $cardId})
WHERE n:Claim OR n:Evidence OR n:Condition OR n:OpenQuestion OR n:ExtractionCard
DETACH DELETE n`;

export const DELETE_CARD_METHOD_MENTIONS = `
MATCH (:Method)-[u:USED_IN {cardId: $cardId}]->(:Paper)
DELETE u`;

export const DELETE_CARD_ASSUMPTION_MENTIONS = `
MATCH (:Assumption)-[e:EXTRACTED_FROM {cardId: $cardId}]->(:Paper)
DELETE e`;

export const UPSERT_CARD = `
MATCH (p:Paper {paperId: $paperId})
MERGE (c:ExtractionCard {id: $id})
SET c.projectId = $projectId, c.paperId = $paperId, c.slot = $slot, c.runId = $runId, c.at = $at, c.cardId = $id,
    c.textVersion = $textVersion, c.counts = $counts, c.state = 'extracted', c.calls = $calls
MERGE (c)-[:FROM]->(p)
RETURN c.id AS id`;

export const CREATE_CLAIMS = `
MATCH (p:Paper {paperId: $paperId})
UNWIND $rows AS r
CREATE (c:Claim {
  id: r.id, projectId: $projectId, paperId: $paperId, cardId: $cardId, slot: $slot, localId: r.localId,
  text: r.text, section: r.section, speculative: r.speculative, conditions: r.conditions,
  quote: r.quote, chunkId: r.chunkId, page: r.page, locator: r.locator, contradictions: r.contradictions,
  state: 'extracted', confidence: r.confidence, stateReason: null, extractedBy: $runId,
  textVersion: $textVersion, createdAt: $at, embedding: vecf32(r.embedding)
})
CREATE (c)-[:EXTRACTED_FROM]->(p)
RETURN count(c) AS n`;

export const CREATE_EVIDENCE = `
MATCH (p:Paper {paperId: $paperId})
UNWIND $rows AS r
CREATE (e:Evidence {
  id: r.id, projectId: $projectId, paperId: $paperId, cardId: $cardId, slot: $slot, localId: r.localId,
  text: r.text, kind: r.kind, locator: r.locator, quote: r.quote, chunkId: r.chunkId, page: r.page,
  state: 'extracted', confidence: r.confidence, stateReason: null, extractedBy: $runId, textVersion: $textVersion, createdAt: $at
})
CREATE (e)-[:EXTRACTED_FROM]->(p)
RETURN count(e) AS n`;

export const LINK_EVIDENCE_SUPPORTS = `
UNWIND $rows AS r
MATCH (e:Evidence {id: r.evidenceId}), (c:Claim {id: r.claimId})
MERGE (e)-[s:SUPPORTS]->(c)
SET s.by = $by, s.runId = $runId, s.status = 'suggested', s.at = $at
RETURN count(s) AS n`;

/** Methods are project-wide nodes; each paper's mention is a USED_IN edge carrying its own quote. */
export const CREATE_METHOD = `
MERGE (m:Method {id: $id})
ON CREATE SET m.projectId = $projectId, m.name = $name, m.nameKey = $nameKey, m.aliases = [], m.createdAt = $at,
              m.state = 'extracted', m.confidence = $confidence, m.extractedBy = $runId, m.embedding = vecf32($embedding),
              m.quote = $quote, m.chunkId = $chunkId, m.page = $page, m.paperId = $paperId, m.loadBearing = false
RETURN m.id AS id`;

export const ADD_METHOD_ALIAS = `
MATCH (m:Method {id: $id})
SET m.aliases = CASE WHEN $alias IN coalesce(m.aliases, []) OR $alias = m.name THEN coalesce(m.aliases, []) ELSE coalesce(m.aliases, []) + $alias END,
    m.mergedFrom = coalesce(m.mergedFrom, 0) + 1
RETURN m.id AS id`;

export const LINK_METHOD_MENTION = `
MATCH (m:Method {id: $methodId}), (p:Paper {paperId: $paperId})
MERGE (m)-[u:USED_IN {cardId: $cardId}]->(p)
SET u.localId = $localId, u.quote = $quote, u.chunkId = $chunkId, u.page = $page, u.parameters = $parameters,
    u.name = $name, u.state = 'extracted', u.confidence = $confidence, u.runId = $runId, u.at = $at, u.slot = $slot
RETURN m.id AS id`;

export const LINK_CLAIM_USES = `
UNWIND $rows AS r
MATCH (c:Claim {id: r.claimId}), (m:Method {id: r.methodId})
MERGE (c)-[u:USES]->(m)
SET u.by = $by, u.runId = $runId, u.status = 'suggested', u.at = $at, u.parameters = r.parameters
RETURN count(u) AS n`;

export const CREATE_ASSUMPTION = `
MERGE (a:Assumption {id: $id})
ON CREATE SET a.projectId = $projectId, a.text = $text, a.createdAt = $at, a.state = 'extracted', a.stated = $stated,
              a.confidence = $confidence, a.extractedBy = $runId, a.embedding = vecf32($embedding),
              a.quote = $quote, a.chunkId = $chunkId, a.page = $page, a.paperId = $paperId, a.loadBearing = false,
              a.cardId = $cardId, a.slot = $slot, a.localId = $localId, a.textVersion = $textVersion
RETURN a.id AS id`;

export const ADD_ASSUMPTION_ALIAS = `
MATCH (a:Assumption {id: $id})
SET a.aliases = CASE WHEN $alias IN coalesce(a.aliases, []) OR $alias = a.text THEN coalesce(a.aliases, []) ELSE coalesce(a.aliases, []) + $alias END,
    a.mergedFrom = coalesce(a.mergedFrom, 0) + 1
RETURN a.id AS id`;

export const LINK_ASSUMPTION_MENTION = `
MATCH (a:Assumption {id: $assumptionId}), (p:Paper {paperId: $paperId})
MERGE (a)-[e:EXTRACTED_FROM {cardId: $cardId}]->(p)
SET e.quote = $quote, e.chunkId = $chunkId, e.page = $page, e.runId = $runId, e.at = $at
RETURN a.id AS id`;

export const LINK_CLAIM_DEPENDS = `
UNWIND $rows AS r
MATCH (c:Claim {id: r.claimId}), (a:Assumption {id: r.assumptionId})
MERGE (c)-[d:DEPENDS_ON]->(a)
SET d.by = $by, d.runId = $runId, d.status = 'suggested', d.at = $at
RETURN count(d) AS n`;

export const CREATE_CONDITIONS = `
MATCH (p:Paper {paperId: $paperId})
UNWIND $rows AS r
CREATE (k:Condition {
  id: r.id, projectId: $projectId, paperId: $paperId, cardId: $cardId, slot: $slot, localId: r.localId, text: r.text,
  quote: r.quote, chunkId: r.chunkId, page: r.page, state: 'extracted', confidence: r.confidence, stateReason: null,
  extractedBy: $runId, textVersion: $textVersion, createdAt: $at
})
CREATE (k)-[:EXTRACTED_FROM]->(p)
RETURN count(k) AS n`;

export const LINK_FAILS_UNDER = `
UNWIND $rows AS r
MATCH (c:Claim {id: r.claimId}), (k:Condition {id: r.conditionId})
MERGE (c)-[f:FAILS_UNDER]->(k)
SET f.by = $by, f.runId = $runId, f.status = 'suggested', f.at = $at
RETURN count(f) AS n`;

export const CREATE_OPEN_QUESTIONS = `
MATCH (p:Paper {paperId: $paperId})
UNWIND $rows AS r
CREATE (q:OpenQuestion {
  id: r.id, projectId: $projectId, paperId: $paperId, cardId: $cardId, slot: $slot, localId: r.localId, text: r.text, kind: 'gap',
  quote: r.quote, chunkId: r.chunkId, page: r.page, state: 'extracted', confidence: r.confidence, stateReason: null,
  extractedBy: $runId, textVersion: $textVersion, createdAt: $at, chainsNeeding: 0
})
CREATE (q)-[:RAISED_BY]->(p)
RETURN count(q) AS n`;

// ---------------------------------------------------------------- Entity resolution

export const METHOD_BY_KEY = `
MATCH (m:Method {projectId: $projectId, nameKey: $nameKey})
RETURN m.id AS id, m.name AS name`;

export const NEAREST_METHODS = `
CALL db.idx.vector.queryNodes('Method', 'embedding', $k, vecf32($v)) YIELD node, score
WHERE node.projectId = $projectId
RETURN node.id AS id, node.name AS name, score
ORDER BY score ASC`;

export const NEAREST_ASSUMPTIONS = `
CALL db.idx.vector.queryNodes('Assumption', 'embedding', $k, vecf32($v)) YIELD node, score
WHERE node.projectId = $projectId
RETURN node.id AS id, node.text AS text, score
ORDER BY score ASC`;

// ---------------------------------------------------------------- Verifier

export const CARD_ITEMS = `
MATCH (n {cardId: $cardId})
WHERE (n:Claim OR n:Evidence OR n:Condition OR n:OpenQuestion) AND n.state = 'extracted'
RETURN labels(n)[0] AS label, n.id AS id, n.text AS text, coalesce(n.quote, '') AS quote, n.chunkId AS chunkId,
       coalesce(n.section, '') AS section, coalesce(n.confidence, 0) AS confidence, n.localId AS localId`;

export const CARD_ASSUMPTION_MENTIONS = `
MATCH (a:Assumption)-[e:EXTRACTED_FROM {cardId: $cardId}]->(:Paper)
RETURN a.id AS id, a.text AS text, coalesce(e.quote, '') AS quote, e.chunkId AS chunkId, coalesce(a.confidence, 0) AS confidence, a.state AS state`;

export const CARD_METHOD_MENTIONS = `
MATCH (m:Method)-[u:USED_IN {cardId: $cardId}]->(:Paper)
WHERE u.state = 'extracted'
RETURN m.id AS id, m.name AS name, u.name AS mentionName, coalesce(u.quote, '') AS quote, u.chunkId AS chunkId, coalesce(u.confidence, 0) AS confidence`;

export const SET_NODE_STATE = `
UNWIND $rows AS r
MATCH (n {id: r.id})
WHERE n:Claim OR n:Evidence OR n:Assumption OR n:Condition OR n:OpenQuestion OR n:Method OR n:Procedure OR n:Result
SET n.state = CASE WHEN n.state = 'human_approved' THEN n.state ELSE r.state END,
    n.stateReason = r.reason, n.verifiedBy = $runId, n.verifiedAt = $at,
    n.chunkId = coalesce(r.chunkId, n.chunkId), n.page = coalesce(r.page, n.page), n.confidence = coalesce(r.confidence, n.confidence)
RETURN count(n) AS n`;

export const SET_MENTION_STATE = `
UNWIND $rows AS r
MATCH (m:Method {id: r.id})-[u:USED_IN {cardId: $cardId}]->(:Paper)
SET u.state = r.state, u.stateReason = r.reason, u.verifiedBy = $runId, u.verifiedAt = $at
RETURN count(u) AS n`;

/** A method's own state follows its best mention (a person's approval always wins). */
export const REFRESH_METHOD_STATES = `
MATCH (m:Method {projectId: $projectId})-[u:USED_IN]->(:Paper)
WITH m, collect(coalesce(u.state, 'extracted')) AS states
SET m.state = CASE
  WHEN m.state = 'human_approved' THEN 'human_approved'
  WHEN 'agent_verified' IN states THEN 'agent_verified'
  WHEN 'low_confidence' IN states THEN 'low_confidence'
  WHEN 'extracted' IN states THEN 'extracted'
  ELSE 'retracted' END
RETURN count(m) AS n`;

export const SET_CARD_STATE = `
MATCH (c:ExtractionCard {id: $cardId})
SET c.state = $state, c.verifiedBy = $runId, c.verifiedAt = $at, c.verdicts = $verdicts
RETURN c.id AS id`;

export const PAPER_CARDS = `
MATCH (c:ExtractionCard {projectId: $projectId, paperId: $paperId})
RETURN c.id AS id, c.slot AS slot, c.state AS state, c.textVersion AS textVersion`;

export const PAPER_CLAIMS_FOR_MERGE = `
MATCH (c:Claim {projectId: $projectId, paperId: $paperId})
WHERE c.state <> 'retracted'
RETURN c.id AS id, c.slot AS slot, c.text AS text, c.chunkId AS chunkId, c.state AS state, c.embedding AS embedding`;

/** Cross-slot merge: the duplicate is retracted, the kept claim gains confidence; edges re-pointed in separate statements. */
export const MERGE_CLAIM_INTO = `
MATCH (dup:Claim {id: $dupId}), (keep:Claim {id: $keepId})
SET dup.state = 'retracted', dup.stateReason = 'merged', dup.mergedInto = $keepId,
    keep.confidence = CASE WHEN coalesce(keep.confidence, 0.5) < 0.9 THEN coalesce(keep.confidence, 0.5) + 0.1 ELSE keep.confidence END,
    keep.slots = ['a', 'b'], keep.agreedText = $dupText
RETURN keep.id AS id`;

export const REPOINT_SUPPORTS = `
MATCH (e:Evidence)-[s:SUPPORTS]->(dup:Claim {id: $dupId})
MATCH (keep:Claim {id: $keepId})
MERGE (e)-[s2:SUPPORTS]->(keep)
SET s2.by = s.by, s2.runId = s.runId, s2.status = s.status, s2.at = s.at
RETURN count(s2) AS n`;

export const REPOINT_USES = `
MATCH (dup:Claim {id: $dupId})-[u:USES]->(m:Method)
MATCH (keep:Claim {id: $keepId})
MERGE (keep)-[u2:USES]->(m)
SET u2.by = u.by, u2.runId = u.runId, u2.status = u.status, u2.at = u.at, u2.parameters = u.parameters
RETURN count(u2) AS n`;

export const REPOINT_DEPENDS = `
MATCH (dup:Claim {id: $dupId})-[d:DEPENDS_ON]->(a:Assumption)
MATCH (keep:Claim {id: $keepId})
MERGE (keep)-[d2:DEPENDS_ON]->(a)
SET d2.by = d.by, d2.runId = d.runId, d2.status = d.status, d2.at = d.at
RETURN count(d2) AS n`;

export const MARK_CLAIM_CONFLICT = `
MATCH (a:Claim {id: $aId}), (b:Claim {id: $bId})
SET a.state = 'conflict', a.stateReason = 'extractors_disagree', a.conflictWith = $bId,
    b.state = 'conflict', b.stateReason = 'extractors_disagree', b.conflictWith = $aId
RETURN 2 AS n`;

export const NEAREST_FOREIGN_CLAIMS = `
CALL db.idx.vector.queryNodes('Claim', 'embedding', $k, vecf32($v)) YIELD node, score
WHERE node.projectId = $projectId AND node.paperId <> $paperId AND node.state IN ['agent_verified', 'human_approved']
MATCH (node)-[:EXTRACTED_FROM]->(p:Paper)
RETURN node.id AS id, node.text AS text, p.title AS title, score
ORDER BY score ASC`;

export const UPSERT_CONTRADICTS = `
MATCH (a:Claim {id: $aId}), (b:Claim {id: $bId})
MERGE (a)-[r:CONTRADICTS]->(b)
SET r.by = $by, r.runId = $runId, r.status = 'suggested', r.at = $at, r.confidence = $confidence, r.reason = $reason
RETURN count(r) AS n`;

export const MARK_LOAD_BEARING_ASSUMPTIONS = `
MATCH (a:Assumption {projectId: $projectId})<-[:DEPENDS_ON]-(c:Claim)
WHERE c.state <> 'retracted'
WITH a, count(c) AS n
SET a.loadBearing = n >= $threshold, a.dependents = n
RETURN count(a) AS assumptions`;

export const MARK_LOAD_BEARING_METHODS = `
MATCH (m:Method {projectId: $projectId})<-[:USES]-(c:Claim)
WHERE c.state <> 'retracted'
WITH m, count(c) AS n
SET m.loadBearing = n >= $threshold, m.dependents = n
RETURN count(m) AS methods`;

export const SET_TRIAGE_NODE_COUNTS = `
MATCH (:AdamProject {id: $projectId})-[t:TRIAGED]->(p:Paper {paperId: $paperId})
SET t.nodesNew = $nodesNew, t.nodesReused = $nodesReused, t.extractedAt = $at
RETURN count(t) AS n`;
