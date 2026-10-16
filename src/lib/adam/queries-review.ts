// adam Cypher for the human side: the exception queue, decisions, the Knowledge view and
// node provenance. Queue membership is a property of the node's state (conflict, low
// confidence, load-bearing, unsourced), never a separate list, so nothing can fall out of sync.

const REVIEW_LABELS = ["Claim", "Evidence", "Assumption", "Condition", "OpenQuestion", "Method"] as const;

const QUEUE_WHERE = `(n.state IN ['conflict', 'low_confidence'] OR coalesce(n.loadBearing, false) = true) AND coalesce(n.queueDecided, false) = false`;

const ITEM_FIELDS = (label: string) => `
  '${label}' AS label, n.id AS id, coalesce(n.text, n.name, '') AS text, n.state AS state, coalesce(n.stateReason, '') AS reason,
  coalesce(n.confidence, 0) AS confidence, coalesce(n.loadBearing, false) AS loadBearing, coalesce(n.dependents, 0) AS dependents,
  coalesce(n.quote, '') AS quote, n.chunkId AS chunkId, coalesce(n.page, 0) AS page, coalesce(n.section, '') AS section,
  coalesce(n.slot, '') AS slot, n.conflictWith AS conflictWith, n.agreedText AS agreedText, coalesce(n.aliases, []) AS aliases,
  coalesce(n.mergedFrom, 0) AS mergedFrom, coalesce(n.speculative, false) AS speculative, n.locator AS locator,
  coalesce(n.createdAt, 0) AS createdAt, n.paperId AS paperId, coalesce(p.title, '') AS paperTitle, p.year AS year,
  coalesce(ch.text, p.abstract, '') AS chunkText, coalesce(ch.section, '') AS chunkSection, coalesce(ch.page, 0) AS chunkPage`;

/** Open queue items across labels, with the quoted passage beside each. */
export const QUEUE_ITEMS = REVIEW_LABELS.map(
  (l) => `MATCH (n:${l} {projectId: $projectId})
WHERE ${QUEUE_WHERE}
OPTIONAL MATCH (p:Paper) WHERE p.paperId = n.paperId
OPTIONAL MATCH (ch:Chunk) WHERE ch.id = n.chunkId
RETURN ${ITEM_FIELDS(l)}`,
).join("\nUNION ALL\n");

/** One node's full picture: its properties, the passage, the paper, and the edges around it. */
export const NODE_DETAIL = `
MATCH (n {id: $id})
WHERE n.projectId = $projectId
OPTIONAL MATCH (p:Paper) WHERE p.paperId = n.paperId
OPTIONAL MATCH (ch:Chunk) WHERE ch.id = n.chunkId
RETURN labels(n)[0] AS label, n.id AS id, coalesce(n.text, n.name, '') AS text, n.state AS state, coalesce(n.stateReason, '') AS reason,
       coalesce(n.confidence, 0) AS confidence, coalesce(n.loadBearing, false) AS loadBearing, coalesce(n.dependents, 0) AS dependents,
       coalesce(n.quote, '') AS quote, n.chunkId AS chunkId, coalesce(n.page, 0) AS page, coalesce(n.section, '') AS section,
       coalesce(n.slot, '') AS slot, n.conflictWith AS conflictWith, n.agreedText AS agreedText, coalesce(n.aliases, []) AS aliases,
       coalesce(n.mergedFrom, 0) AS mergedFrom, coalesce(n.speculative, false) AS speculative, n.locator AS locator,
       coalesce(n.conditions, []) AS conditions, n.priorText AS priorText, n.decidedBy AS decidedBy, n.decidedAt AS decidedAt,
       n.verifiedAt AS verifiedAt, coalesce(n.createdAt, 0) AS createdAt, n.paperId AS paperId, coalesce(p.title, '') AS paperTitle,
       p.year AS year, p.pgPaperId AS pgPaperId, coalesce(ch.text, p.abstract, '') AS chunkText, coalesce(ch.section, '') AS chunkSection,
       coalesce(ch.page, 0) AS chunkPage, coalesce(ch.locator, '') AS chunkLocator`;

export const NODE_EDGES = `
MATCH (n {id: $id})-[r]->(m)
WHERE n.projectId = $projectId AND NOT m:Chunk
RETURN 'out' AS dir, type(r) AS type, labels(m)[0] AS label, coalesce(m.id, m.paperId, '') AS otherId,
       coalesce(m.text, m.name, m.title, '') AS otherText, coalesce(r.status, '') AS status, coalesce(m.state, '') AS otherState
UNION ALL
MATCH (m)-[r]->(n {id: $id})
WHERE n.projectId = $projectId AND NOT m:AdamProject AND NOT m:ExtractionCard
RETURN 'in' AS dir, type(r) AS type, labels(m)[0] AS label, coalesce(m.id, m.paperId, '') AS otherId,
       coalesce(m.text, m.name, m.title, '') AS otherText, coalesce(r.status, '') AS status, coalesce(m.state, '') AS otherState`;

/** Mentions of a Method across papers (each USED_IN edge carries its own quote). */
export const METHOD_MENTIONS = `
MATCH (m:Method {id: $id})-[u:USED_IN]->(p:Paper)
OPTIONAL MATCH (ch:Chunk) WHERE ch.id = u.chunkId
RETURN p.paperId AS paperId, p.title AS paperTitle, p.year AS year, coalesce(u.name, m.name) AS name, coalesce(u.quote, '') AS quote,
       coalesce(u.page, 0) AS page, coalesce(u.state, '') AS state, coalesce(u.parameters, []) AS parameters, coalesce(ch.text, '') AS chunkText`;

// ---------------------------------------------------------------- Decisions

/** Approve / correct / reject. A correction keeps the prior text; the queue never shows a decided item again. */
export const DECIDE_NODE = `
MATCH (n {id: $id})
WHERE n.projectId = $projectId AND (n:Claim OR n:Evidence OR n:Assumption OR n:Condition OR n:OpenQuestion OR n:Method OR n:Procedure OR n:Result)
SET n.state = $state, n.stateReason = $reason, n.decidedBy = $userId, n.decidedAt = $at, n.queueDecided = true,
    n.priorText = CASE WHEN $text IS NULL THEN n.priorText ELSE coalesce(n.text, n.name) END,
    n.text = CASE WHEN $text IS NULL OR n:Method THEN n.text ELSE $text END,
    n.name = CASE WHEN $text IS NULL OR NOT n:Method THEN n.name ELSE $text END,
    n.note = coalesce($note, n.note)
RETURN labels(n)[0] AS label, n.id AS id, n.state AS state`;

export const SET_NODE_EMBEDDING = `
MATCH (n {id: $id})
WHERE n.projectId = $projectId
SET n.embedding = vecf32($embedding)
RETURN n.id AS id`;

/** Agent-proposed edges around an approved node are accepted; around a rejected one, rejected. */
export const DECIDE_NODE_EDGES = `
MATCH (n {id: $id})-[r]-()
WHERE n.projectId = $projectId AND r.status = 'suggested'
SET r.status = $status, r.decidedBy = $userId, r.decidedAt = $at
RETURN count(r) AS n`;

/** The other reading of a disputed passage, when the researcher picks one: retract it as a duplicate. */
export const RETRACT_CONFLICT_PARTNER = `
MATCH (n:Claim {id: $id})
WHERE n.projectId = $projectId AND n.state <> 'human_approved'
SET n.state = 'retracted', n.stateReason = 'conflict_resolved', n.decidedBy = $userId, n.decidedAt = $at, n.queueDecided = true, n.mergedInto = $keepId
RETURN n.id AS id`;

/** A merge the researcher disagrees with: the alias becomes its own node again. */
export const UNMERGE_METHOD = `
MATCH (m:Method {id: $id})
WHERE m.projectId = $projectId AND $alias IN coalesce(m.aliases, [])
SET m.aliases = [a IN m.aliases WHERE a <> $alias], m.mergedFrom = CASE WHEN coalesce(m.mergedFrom, 0) > 0 THEN m.mergedFrom - 1 ELSE 0 END
CREATE (n:Method {id: $newId, projectId: $projectId, name: $alias, nameKey: $nameKey, aliases: [], createdAt: $at,
                  state: 'human_approved', confidence: 1.0, decidedBy: $userId, decidedAt: $at, loadBearing: false, unmergedFrom: $id, embedding: vecf32($embedding)})
WITH m, n
MATCH (m)-[u:USED_IN]->(p:Paper) WHERE u.name = $alias
CREATE (n)-[u2:USED_IN {cardId: u.cardId}]->(p)
SET u2 = u
WITH m, n, u, p
MATCH (c:Claim)-[x:USES]->(m) WHERE c.paperId = p.paperId
CREATE (c)-[x2:USES]->(n)
SET x2 = x
DELETE x, u
RETURN n.id AS id`;

// ---------------------------------------------------------------- Integration with the editor agents

/** Verified adam claims of the given papers nearest a draft sentence (Citation Checker evidence with page + section). */
export const CLAIMS_OF_PAPERS = `
CALL db.idx.vector.queryNodes('Claim', 'embedding', $k, vecf32($v)) YIELD node, score
WHERE node.paperId IN $paperIds AND node.state IN ['agent_verified', 'human_approved'] AND node.projectId IS NOT NULL
RETURN node.paperId AS paperId, node.id AS claimId, node.text AS text, coalesce(node.page, 0) AS page, coalesce(node.section, '') AS section,
       coalesce(node.speculative, false) AS speculative, score
ORDER BY score ASC`;

/** A paper's verified claims and methods, for the MCP server and the chat. */
export const PAPER_CLAIMS = `
MATCH (c:Claim {paperId: $paperId})
WHERE c.projectId IS NOT NULL AND c.state <> 'retracted'
RETURN c.id AS id, c.text AS text, c.state AS state, coalesce(c.page, 0) AS page, coalesce(c.section, '') AS section,
       coalesce(c.speculative, false) AS speculative, coalesce(c.conditions, []) AS conditions, coalesce(c.quote, '') AS quote,
       [(c)-[:USES]->(m:Method) | m.name] AS methods
ORDER BY CASE c.state WHEN 'human_approved' THEN 0 WHEN 'agent_verified' THEN 1 ELSE 2 END, page`;

// ---------------------------------------------------------------- Knowledge view

const KNOWLEDGE_FIELDS = (label: string) => `
  '${label}' AS label, n.id AS id, coalesce(n.text, n.name, '') AS text, n.state AS state, coalesce(n.stateReason, '') AS reason,
  coalesce(n.confidence, 0) AS confidence, coalesce(n.loadBearing, false) AS loadBearing, coalesce(n.dependents, 0) AS dependents,
  coalesce(n.section, '') AS section, coalesce(n.page, 0) AS page, coalesce(n.speculative, false) AS speculative,
  n.paperId AS paperId, coalesce(p.title, '') AS paperTitle, p.year AS year, coalesce(n.createdAt, 0) AS createdAt,
  coalesce(n.aliases, []) AS aliases, coalesce(n.slot, '') AS slot`;

export const KNOWLEDGE_NODES = ["Claim", "Evidence", "Method", "Assumption", "Condition", "OpenQuestion", "Procedure", "Result", "Instrument", "Candidate"]
  .map(
    (l) => `MATCH (n:${l} {projectId: $projectId})
WHERE n.state <> 'retracted' OR $includeRetracted
OPTIONAL MATCH (p:Paper) WHERE p.paperId = n.paperId
RETURN ${KNOWLEDGE_FIELDS(l)}`,
  )
  .join("\nUNION ALL\n");

/** Canvas: papers, claims, methods and assumptions, with the edges that connect them. Bounded. */
export const KNOWLEDGE_GRAPH_NODES = `
MATCH (:AdamProject {id: $projectId})-[t:TRIAGED]->(p:Paper)
WHERE t.label IN ['core', 'contradicts', 'method_only']
RETURN 'Paper' AS label, p.paperId AS id, p.title AS text, t.label AS state, 0 AS weight, p.paperId AS paperId
UNION ALL
MATCH (n:Claim {projectId: $projectId}) WHERE n.state <> 'retracted'
RETURN 'Claim' AS label, n.id AS id, n.text AS text, n.state AS state, 0 AS weight, n.paperId AS paperId
UNION ALL
MATCH (n:Method {projectId: $projectId}) WHERE n.state <> 'retracted'
RETURN 'Method' AS label, n.id AS id, n.name AS text, n.state AS state, coalesce(n.dependents, 0) AS weight, n.paperId AS paperId
UNION ALL
MATCH (n:Assumption {projectId: $projectId}) WHERE n.state <> 'retracted'
RETURN 'Assumption' AS label, n.id AS id, n.text AS text, n.state AS state, coalesce(n.dependents, 0) AS weight, n.paperId AS paperId
UNION ALL
MATCH (n:Procedure {projectId: $projectId}) WHERE n.state <> 'retracted'
RETURN 'Procedure' AS label, n.id AS id, n.name AS text, n.state AS state, 0 AS weight, n.paperId AS paperId
UNION ALL
MATCH (n:Result {projectId: $projectId}) WHERE n.state <> 'retracted'
RETURN 'Result' AS label, n.id AS id, n.text AS text, n.state AS state, 0 AS weight, n.paperId AS paperId`;

export const KNOWLEDGE_GRAPH_LINKS = `
MATCH (c:Claim {projectId: $projectId})-[:EXTRACTED_FROM]->(p:Paper) WHERE c.state <> 'retracted'
RETURN c.id AS source, p.paperId AS target, 'EXTRACTED_FROM' AS type, '' AS status
UNION ALL
MATCH (c:Claim {projectId: $projectId})-[r:USES]->(m:Method) WHERE c.state <> 'retracted'
RETURN c.id AS source, m.id AS target, 'USES' AS type, coalesce(r.status, '') AS status
UNION ALL
MATCH (c:Claim {projectId: $projectId})-[r:DEPENDS_ON]->(a:Assumption) WHERE c.state <> 'retracted'
RETURN c.id AS source, a.id AS target, 'DEPENDS_ON' AS type, coalesce(r.status, '') AS status
UNION ALL
MATCH (a:Claim {projectId: $projectId})-[r:CONTRADICTS]->(b:Claim) WHERE a.state <> 'retracted' AND b.state <> 'retracted'
RETURN a.id AS source, b.id AS target, 'CONTRADICTS' AS type, coalesce(r.status, '') AS status
UNION ALL
MATCH (pr:Procedure {projectId: $projectId})-[:SPECIFIES]->(m:Method)
RETURN pr.id AS source, m.id AS target, 'SPECIFIES' AS type, '' AS status
UNION ALL
MATCH (pr:Procedure {projectId: $projectId})-[:PRODUCES]->(x:Result)
RETURN pr.id AS source, x.id AS target, 'PRODUCES' AS type, '' AS status
UNION ALL
MATCH (pr:Procedure {projectId: $projectId})-[:DEPENDS_ON]->(q:Procedure)
RETURN pr.id AS source, q.id AS target, 'DEPENDS_ON' AS type, '' AS status`;
