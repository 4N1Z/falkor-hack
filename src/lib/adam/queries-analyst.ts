// adam Cypher for the Graph Analyst: communities, the signals that point to hypotheses
// (holes, conflicts, load-bearing assumptions), and the Candidate nodes that record them.

/**
 * Communities over papers, methods and claims (CDLP). The algorithm runs over the whole
 * workspace graph; only the project's triaged papers are returned.
 */
export const PROJECT_COMMUNITIES = `
CALL algo.labelPropagation({nodeLabels: ['Paper', 'Method', 'Claim'], relationshipTypes: ['CITES', 'USED_IN', 'USES', 'EXTRACTED_FROM'], maxIterations: 20}) YIELD node, communityId
WITH node, communityId WHERE labels(node)[0] = 'Paper'
MATCH (:AdamProject {id: $projectId})-[t:TRIAGED]->(node)
RETURN node.paperId AS paperId, node.title AS title, communityId, t.label AS label, coalesce(t.clusterId, '') AS clusterId`;

export const SET_PAPER_COMMUNITIES = `
UNWIND $rows AS r
MATCH (:AdamProject {id: $projectId})-[t:TRIAGED]->(p:Paper {paperId: r.paperId})
SET t.community = r.community
RETURN count(t) AS n`;

export const PAPER_METHODS = `
MATCH (:AdamProject {id: $projectId})-[:TRIAGED]->(p:Paper)<-[:USED_IN]-(m:Method)
WHERE m.state <> 'retracted'
RETURN p.paperId AS paperId, collect(DISTINCT m.id) AS methods, collect(DISTINCT m.name) AS names`;

export const PAPER_VECTORS = `
MATCH (:AdamProject {id: $projectId})-[:TRIAGED]->(p:Paper)
WHERE p.embedding IS NOT NULL
RETURN p.paperId AS paperId, p.embedding AS embedding`;

export const VERIFIED_CLAIMS_PER_PAPER = `
MATCH (c:Claim {projectId: $projectId})
WHERE c.state IN ['agent_verified', 'human_approved']
RETURN c.paperId AS paperId, count(c) AS claims`;

/** Links between two sets of papers: citations, and claim-level edges between their claims. */
export const LINKS_BETWEEN = `
OPTIONAL MATCH (a:Paper)-[c:CITES]-(b:Paper) WHERE a.paperId IN $a AND b.paperId IN $b
WITH count(c) AS cites
OPTIONAL MATCH (x:Claim)-[e:CONTRADICTS|EXTENDS]-(y:Claim)
WHERE x.projectId = $projectId AND x.paperId IN $a AND y.paperId IN $b
RETURN cites, count(e) AS claimLinks`;

export const CONFLICT_PAIRS = `
MATCH (a:Claim {projectId: $projectId})-[r:CONTRADICTS]->(b:Claim)
WHERE a.state IN ['agent_verified', 'human_approved', 'conflict'] AND b.state IN ['agent_verified', 'human_approved', 'conflict']
MATCH (pa:Paper) WHERE pa.paperId = a.paperId
MATCH (pb:Paper) WHERE pb.paperId = b.paperId
OPTIONAL MATCH (a)-[:DEPENDS_ON]->(xa:Assumption)
WITH a, b, r, pa, pb, collect(DISTINCT coalesce(xa.text, '')) AS aAssumptions
OPTIONAL MATCH (b)-[:DEPENDS_ON]->(xb:Assumption)
WITH a, b, r, pa, pb, aAssumptions, collect(DISTINCT coalesce(xb.text, '')) AS bAssumptions
OPTIONAL MATCH (a)-[:USES]->(ma:Method)
WITH a, b, r, pa, pb, aAssumptions, bAssumptions, collect(DISTINCT coalesce(ma.name, '')) AS aMethods
OPTIONAL MATCH (b)-[:USES]->(mb:Method)
WITH a, b, r, pa, pb, aAssumptions, bAssumptions, aMethods, collect(DISTINCT coalesce(mb.name, '')) AS bMethods
RETURN a.id AS aId, a.text AS aText, coalesce(a.conditions, []) AS aConditions, pa.title AS aPaper, coalesce(pa.year, 0) AS aYear,
       b.id AS bId, b.text AS bText, coalesce(b.conditions, []) AS bConditions, pb.title AS bPaper, coalesce(pb.year, 0) AS bYear,
       [x IN aAssumptions WHERE x <> ''] AS aAssumptions, [x IN bAssumptions WHERE x <> ''] AS bAssumptions,
       [x IN aMethods WHERE x <> ''] AS aMethods, [x IN bMethods WHERE x <> ''] AS bMethods,
       coalesce(r.confidence, 0) AS confidence, coalesce(r.status, '') AS status
ORDER BY confidence DESC
LIMIT $limit`;

export const LOAD_BEARING_ASSUMPTIONS = `
MATCH (a:Assumption {projectId: $projectId})
WHERE coalesce(a.loadBearing, false) = true AND a.state <> 'retracted'
RETURN a.id AS id, a.text AS text, coalesce(a.stated, false) AS stated, coalesce(a.dependents, 0) AS dependents,
       [(c:Claim)-[:DEPENDS_ON]->(a) WHERE c.state <> 'retracted' | c.text][0..6] AS claims,
       [(c:Claim)-[:DEPENDS_ON]->(a) WHERE c.state <> 'retracted' | c.id][0..30] AS claimIds,
       a.embedding AS embedding
ORDER BY dependents DESC
LIMIT $limit`;

/** Has anything in the graph tested this assumption directly? Nearest verified claims. */
export const NEAREST_PROJECT_CLAIMS = `
CALL db.idx.vector.queryNodes('Claim', 'embedding', $k, vecf32($v)) YIELD node, score
WHERE node.projectId = $projectId AND node.state IN ['agent_verified', 'human_approved']
RETURN node.id AS id, node.text AS text, score
ORDER BY score ASC`;

export const DELETE_PASS_CANDIDATES = `
MATCH (c:Candidate {projectId: $projectId, pass: $pass})
WHERE coalesce(c.decidedBy, '') = ''
DETACH DELETE c`;

export const UPSERT_CANDIDATE = `
MERGE (c:Candidate {id: $id})
ON CREATE SET c.createdAt = $at
SET c.projectId = $projectId, c.pass = $pass, c.kind = $kind, c.text = $summary, c.summary = $summary, c.detail = $detail,
    c.subgraph = $subgraph, c.score = $score, c.sane = $sane, c.saneReason = $saneReason, c.state = $state,
    c.confidence = $confidence, c.extractedBy = $runId, c.updatedAt = $at, c.stateReason = null
RETURN c.id AS id`;

export const LINK_CANDIDATE_SHOWS = `
UNWIND $ids AS nid
MATCH (c:Candidate {id: $candidateId}), (n {id: nid})
WHERE n:Claim OR n:Assumption OR n:Method
MERGE (c)-[:SHOWS]->(n)
RETURN count(n) AS n`;

export const LINK_CANDIDATE_PAPERS = `
UNWIND $ids AS pid
MATCH (c:Candidate {id: $candidateId}), (p:Paper {paperId: pid})
MERGE (c)-[:SHOWS]->(p)
RETURN count(p) AS n`;

export const CANDIDATES = `
MATCH (c:Candidate {projectId: $projectId})
RETURN c.id AS id, c.kind AS kind, c.summary AS summary, coalesce(c.detail, '{}') AS detail, coalesce(c.subgraph, '{}') AS subgraph,
       coalesce(c.score, 0) AS score, coalesce(c.sane, true) AS sane, coalesce(c.saneReason, '') AS saneReason, c.state AS state,
       c.pass AS pass, c.createdAt AS createdAt, c.decidedBy AS decidedBy
ORDER BY c.sane DESC, c.score DESC`;
