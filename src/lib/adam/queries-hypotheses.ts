// adam Cypher for hypothesis briefs, the falsification log, and the material the Writer and
// Falsifier draw from. A brief is a living node: its evidence edges point at Claims, so when
// new papers arrive the sections that depend on them can be re-derived.

// ---------------------------------------------------------------- Material for the Writer

export const WRITER_CLAIMS = `
MATCH (:AdamProject {id: $projectId})-[t:TRIAGED]->(p:Paper)<-[:EXTRACTED_FROM]-(c:Claim)
WHERE c.state IN ['agent_verified', 'human_approved']
RETURN c.id AS id, c.text AS text, coalesce(c.section, '') AS section, coalesce(c.speculative, false) AS speculative,
       coalesce(c.conditions, []) AS conditions, coalesce(c.confidence, 0) AS confidence, t.label AS triage,
       p.paperId AS paperId, p.title AS paper, coalesce(p.year, 0) AS year, coalesce(c.page, 0) AS page,
       [(c)-[:USES]->(m:Method) | m.name] AS methods, [(c)-[:DEPENDS_ON]->(a:Assumption) | a.id] AS assumptionIds
ORDER BY CASE t.label WHEN 'core' THEN 0 WHEN 'contradicts' THEN 1 ELSE 2 END, confidence DESC
LIMIT $limit`;

export const WRITER_METHODS = `
MATCH (m:Method {projectId: $projectId})
WHERE m.state <> 'retracted'
OPTIONAL MATCH (pr:Procedure)-[:SPECIFIES]->(m)
RETURN m.id AS id, m.name AS name, coalesce(m.dependents, 0) AS dependents, coalesce(pr.runnability, 'none') AS runnability,
       coalesce(pr.feasibility, '') AS feasibility, pr.id AS procedureId
ORDER BY dependents DESC
LIMIT $limit`;

export const WRITER_ASSUMPTIONS = `
MATCH (a:Assumption {projectId: $projectId})
WHERE a.state <> 'retracted'
RETURN a.id AS id, a.text AS text, coalesce(a.dependents, 0) AS dependents, coalesce(a.loadBearing, false) AS loadBearing, coalesce(a.stated, false) AS stated
ORDER BY dependents DESC
LIMIT $limit`;

export const WRITER_CONDITIONS = `
MATCH (c:Claim {projectId: $projectId})-[:FAILS_UNDER]->(k:Condition)
WHERE c.state IN ['agent_verified', 'human_approved'] AND k.state <> 'retracted'
RETURN k.id AS id, k.text AS text, c.id AS claimId
LIMIT $limit`;

export const WRITER_CANDIDATES = `
MATCH (c:Candidate {projectId: $projectId})
WHERE coalesce(c.sane, true) = true AND c.state <> 'retracted'
RETURN c.id AS id, c.kind AS kind, c.summary AS summary, coalesce(c.detail, '{}') AS detail, coalesce(c.score, 0) AS score
ORDER BY score DESC
LIMIT 30`;

// ---------------------------------------------------------------- Briefs

export const DELETE_PASS_DRAFT_BRIEFS = `
MATCH (h:Hypothesis {projectId: $projectId, pass: $pass})
WHERE h.status = 'draft' AND coalesce(h.decidedBy, '') = '' AND coalesce(h.selectedBy, '') = ''
OPTIONAL MATCH (a:Attack)-[:ON]->(h)
DETACH DELETE a, h`;

export const UPSERT_BRIEF = `
MATCH (p:AdamProject {id: $projectId})
MERGE (h:Hypothesis {id: $id})
ON CREATE SET h.createdAt = $at, h.status = 'draft', h.version = 1, h.convergenceRounds = 0
SET h.projectId = $projectId, h.pass = $pass, h.statement = $statement, h.text = $statement, h.mechanism = $mechanism,
    h.boundaryHolds = $boundaryHolds, h.boundaryFails = $boundaryFails, h.predictionIfTrue = $predictionIfTrue,
    h.predictionIfFalse = $predictionIfFalse, h.procedureHint = $procedureHint, h.killCriteria = $killCriteria,
    h.ready = $ready, h.state = $state, h.confidence = $confidence, h.runId = $runId, h.updatedAt = $at,
    h.embedding = vecf32($embedding), h.stateReason = $stateReason
MERGE (h)-[:OF]->(p)
RETURN h.id AS id`;

export const CLEAR_BRIEF_EVIDENCE = `
MATCH (h:Hypothesis {id: $id})-[r:EVIDENCE_FOR|EVIDENCE_AGAINST|RESTS_ON|WOULD_USE|DERIVED_FROM]->()
DELETE r`;

export const LINK_BRIEF = `
UNWIND $rows AS r
MATCH (h:Hypothesis {id: $id}), (n {id: r.targetId})
WHERE n:Claim OR n:Assumption OR n:Method OR n:Candidate
CALL {
  WITH h, n, r
  WITH h, n, r WHERE r.type = 'EVIDENCE_FOR'
  MERGE (h)-[e:EVIDENCE_FOR]->(n) SET e.by = $by, e.runId = $runId, e.at = $at, e.status = 'suggested'
  RETURN 1 AS done
  UNION
  WITH h, n, r
  WITH h, n, r WHERE r.type = 'EVIDENCE_AGAINST'
  MERGE (h)-[e:EVIDENCE_AGAINST]->(n) SET e.by = $by, e.runId = $runId, e.at = $at, e.status = 'suggested'
  RETURN 1 AS done
  UNION
  WITH h, n, r
  WITH h, n, r WHERE r.type = 'RESTS_ON'
  MERGE (h)-[e:RESTS_ON]->(n) SET e.by = $by, e.runId = $runId, e.at = $at, e.status = 'suggested'
  RETURN 1 AS done
  UNION
  WITH h, n, r
  WITH h, n, r WHERE r.type = 'WOULD_USE'
  MERGE (h)-[e:WOULD_USE]->(n) SET e.by = $by, e.runId = $runId, e.at = $at, e.status = 'suggested'
  RETURN 1 AS done
  UNION
  WITH h, n, r
  WITH h, n, r WHERE r.type = 'DERIVED_FROM'
  MERGE (h)-[e:DERIVED_FROM]->(n) SET e.by = $by, e.runId = $runId, e.at = $at, e.status = 'suggested'
  RETURN 1 AS done
}
RETURN count(done) AS n`;

/** Simpler per-type links (used instead of LINK_BRIEF where subquery UNION is unsupported). */
export const LINK_EVIDENCE_FOR = `UNWIND $ids AS cid MATCH (h:Hypothesis {id: $id}), (c:Claim {id: cid}) MERGE (h)-[e:EVIDENCE_FOR]->(c) SET e.by = $by, e.runId = $runId, e.at = $at, e.status = 'suggested' RETURN count(e) AS n`;
export const LINK_EVIDENCE_AGAINST = `UNWIND $ids AS cid MATCH (h:Hypothesis {id: $id}), (c:Claim {id: cid}) MERGE (h)-[e:EVIDENCE_AGAINST]->(c) SET e.by = $by, e.runId = $runId, e.at = $at, e.status = 'suggested' RETURN count(e) AS n`;
export const LINK_RESTS_ON = `UNWIND $ids AS aid MATCH (h:Hypothesis {id: $id}), (a:Assumption {id: aid}) MERGE (h)-[e:RESTS_ON]->(a) SET e.by = $by, e.runId = $runId, e.at = $at, e.status = 'suggested' RETURN count(e) AS n`;
export const LINK_WOULD_USE = `UNWIND $ids AS mid MATCH (h:Hypothesis {id: $id}), (m:Method {id: mid}) MERGE (h)-[e:WOULD_USE]->(m) SET e.by = $by, e.runId = $runId, e.at = $at, e.status = 'suggested' RETURN count(e) AS n`;
export const LINK_DERIVED_FROM = `UNWIND $ids AS cid MATCH (h:Hypothesis {id: $id}), (c:Candidate {id: cid}) MERGE (h)-[e:DERIVED_FROM]->(c) SET e.by = $by, e.runId = $runId, e.at = $at, e.status = 'suggested' RETURN count(e) AS n`;

const BRIEF_FIELDS = `
  h.id AS id, h.projectId AS projectId, coalesce(h.pass, 1) AS pass, coalesce(h.version, 1) AS version, h.statement AS statement,
  coalesce(h.mechanism, '') AS mechanism, coalesce(h.boundaryHolds, []) AS boundaryHolds, coalesce(h.boundaryFails, []) AS boundaryFails,
  coalesce(h.predictionIfTrue, '') AS predictionIfTrue, coalesce(h.predictionIfFalse, '') AS predictionIfFalse,
  coalesce(h.procedureHint, '') AS procedureHint, coalesce(h.killCriteria, '') AS killCriteria, coalesce(h.ready, false) AS ready,
  h.status AS status, h.state AS state, coalesce(h.stateReason, '') AS stateReason, coalesce(h.confidence, 0) AS confidence,
  h.selectedBy AS selectedBy, h.selectedAt AS selectedAt, h.killSignedBy AS killSignedBy, h.killSignedAt AS killSignedAt,
  coalesce(h.convergenceRounds, 0) AS convergenceRounds, h.decidedBy AS decidedBy, h.createdAt AS createdAt, h.updatedAt AS updatedAt,
  h.minimumExperiment AS minimumExperiment, coalesce(h.costToKill, 0) AS costToKill, h.queryAt AS queryAt`;

export const BRIEFS = `
MATCH (h:Hypothesis {projectId: $projectId})
RETURN ${BRIEF_FIELDS}
ORDER BY h.pass DESC, CASE h.status WHEN 'selected' THEN 0 WHEN 'survived' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END, h.createdAt`;

export const GET_BRIEF = `
MATCH (h:Hypothesis {id: $id})
RETURN ${BRIEF_FIELDS}`;

export const BRIEF_EVIDENCE = `
MATCH (h:Hypothesis {id: $id})-[r:EVIDENCE_FOR|EVIDENCE_AGAINST]->(c:Claim)
MATCH (p:Paper) WHERE p.paperId = c.paperId
RETURN type(r) AS type, c.id AS id, c.text AS text, p.title AS paper, coalesce(p.year, 0) AS year, coalesce(c.page, 0) AS page,
       coalesce(c.section, '') AS section, c.state AS state, coalesce(c.conditions, []) AS conditions, coalesce(c.speculative, false) AS speculative`;

export const BRIEF_SUPPORTS = `
MATCH (h:Hypothesis {id: $id})-[r:RESTS_ON|WOULD_USE|DERIVED_FROM]->(n)
RETURN type(r) AS type, labels(n)[0] AS label, n.id AS id, coalesce(n.text, n.name, n.summary, '') AS text,
       coalesce(n.dependents, 0) AS dependents, coalesce(n.loadBearing, false) AS loadBearing, coalesce(n.kind, '') AS kind`;

/** The researcher's edits and gate decisions. */
export const EDIT_BRIEF = `
MATCH (h:Hypothesis {id: $id})
SET h.statement = coalesce($statement, h.statement), h.text = coalesce($statement, h.text), h.mechanism = coalesce($mechanism, h.mechanism),
    h.boundaryHolds = coalesce($boundaryHolds, h.boundaryHolds), h.boundaryFails = coalesce($boundaryFails, h.boundaryFails),
    h.killCriteria = coalesce($killCriteria, h.killCriteria), h.state = 'human_approved', h.decidedBy = $userId, h.decidedAt = $at,
    h.version = coalesce(h.version, 1) + 1, h.updatedAt = $at
RETURN h.id AS id`;

export const SELECT_BRIEFS = `
MATCH (h:Hypothesis {projectId: $projectId, pass: $pass})
WHERE h.status IN ['draft', 'selected', 'attacked', 'survived']
SET h.status = CASE WHEN h.id IN $ids THEN 'selected' ELSE 'draft' END,
    h.selectedBy = CASE WHEN h.id IN $ids THEN $userId ELSE null END,
    h.selectedAt = CASE WHEN h.id IN $ids THEN $at ELSE null END,
    h.updatedAt = $at
RETURN count(h) AS n`;

export const SIGN_KILL_CRITERIA = `
MATCH (h:Hypothesis {id: $id})
SET h.killCriteria = coalesce($killCriteria, h.killCriteria), h.killSignedBy = $userId, h.killSignedAt = $at, h.updatedAt = $at
RETURN h.id AS id`;

export const SET_BRIEF_STATUS = `
MATCH (h:Hypothesis {id: $id})
SET h.status = $status, h.convergenceRounds = coalesce($rounds, h.convergenceRounds), h.updatedAt = $at,
    h.killCriteria = coalesce($killCriteria, h.killCriteria), h.boundaryFails = coalesce($boundaryFails, h.boundaryFails)
RETURN h.id AS id`;

export const DROP_BRIEF = `
MATCH (h:Hypothesis {id: $id})
SET h.status = 'killed', h.stateReason = $reason, h.decidedBy = $userId, h.decidedAt = $at, h.updatedAt = $at
RETURN h.id AS id`;

// ---------------------------------------------------------------- Attacks (the falsification log)

export const CREATE_ATTACKS = `
MATCH (h:Hypothesis {id: $hypothesisId})
UNWIND $rows AS r
CREATE (a:Attack {id: r.id, projectId: $projectId, hypothesisId: $hypothesisId, kind: r.kind, text: r.text, round: $round,
                  status: 'open', answer: null, cites: r.cites, control: r.control, killCriterion: r.killCriterion,
                  runId: $runId, createdAt: $at, state: 'agent_verified'})
CREATE (a)-[:ON]->(h)
RETURN count(a) AS n`;

export const LINK_ATTACK_CITES = `
UNWIND $rows AS r
MATCH (a:Attack {id: r.attackId}), (n {id: r.nodeId})
WHERE n:Claim OR n:Assumption OR n:Method OR n:Procedure
MERGE (a)-[:CITES]->(n)
RETURN count(n) AS n`;

export const ANSWER_ATTACKS = `
UNWIND $rows AS r
MATCH (a:Attack {id: r.id})
SET a.answer = r.answer, a.status = r.status, a.answeredAt = $at, a.answerRunId = $runId
RETURN count(a) AS n`;

export const ATTACKS_FOR = `
MATCH (a:Attack)-[:ON]->(h:Hypothesis {id: $id})
RETURN a.id AS id, a.kind AS kind, a.text AS text, coalesce(a.answer, '') AS answer, a.status AS status, coalesce(a.round, 1) AS round,
       coalesce(a.cites, []) AS cites, coalesce(a.control, '') AS control, coalesce(a.killCriterion, '') AS killCriterion,
       a.createdAt AS createdAt, a.decidedBy AS decidedBy
ORDER BY round, CASE a.status WHEN 'fatal' THEN 0 WHEN 'open' THEN 1 ELSE 2 END, createdAt`;

export const DECIDE_ATTACK = `
MATCH (a:Attack {id: $id})
WHERE a.projectId = $projectId
SET a.status = $status, a.answer = coalesce($answer, a.answer), a.decidedBy = $userId, a.decidedAt = $at
RETURN a.id AS id, a.hypothesisId AS hypothesisId`;

/** Material the Falsifier reads about a brief: its evidence and what that evidence depends on. */
export const BRIEF_DEPENDENCIES = `
MATCH (h:Hypothesis {id: $id})-[:EVIDENCE_FOR]->(c:Claim)-[:DEPENDS_ON]->(a:Assumption)
WHERE a.state <> 'retracted'
OPTIONAL MATCH (e:Evidence)-[:SUPPORTS]->(c)
WITH a, count(DISTINCT c) AS claims, count(DISTINCT e) AS evidence
RETURN a.id AS id, a.text AS text, claims, evidence, coalesce(a.stated, false) AS stated
ORDER BY evidence ASC, claims DESC
LIMIT 12`;

/** Has the prior result a brief builds on been reproduced outside its own paper? Nearest claims from other papers. */
export const REPRODUCTIONS_OF = `
CALL db.idx.vector.queryNodes('Claim', 'embedding', $k, vecf32($v)) YIELD node, score
WHERE node.projectId = $projectId AND node.paperId <> $paperId AND node.state IN ['agent_verified', 'human_approved'] AND score <= $maxDistance
MATCH (node)-[:EXTRACTED_FROM]->(p:Paper)
RETURN node.id AS id, node.text AS text, p.title AS paper, coalesce(p.year, 0) AS year, score
ORDER BY score ASC`;

export const CLAIM_VECTOR = `
MATCH (c:Claim {id: $id})
RETURN c.embedding AS embedding, c.paperId AS paperId`;

// ---------------------------------------------------------------- Hypothesis map

/** Everything one hop from a brief: evidence, assumptions, methods, candidates, chain procedures, predicted result. */
export const HYPOTHESIS_NEIGHBOURS = `
MATCH (h:Hypothesis {id: $id})-[r]->(n)
WHERE NOT n:AdamProject
RETURN type(r) AS type, labels(n)[0] AS label, n.id AS id, coalesce(n.text, n.name, n.summary, '') AS text,
       coalesce(n.state, '') AS state, coalesce(n.stateReason, '') AS stateReason, n.paperId AS paperId, n.decidedBy AS decidedBy, coalesce(n.kind, '') AS kind`;

export const HYPOTHESIS_ATTACK_NODES = `
MATCH (a:Attack)-[:ON]->(h:Hypothesis {id: $id})
OPTIONAL MATCH (a)-[:CITES]->(c)
RETURN a.id AS id, a.kind AS kind, a.status AS status, a.text AS text, coalesce(a.round, 1) AS round,
       [x IN collect(coalesce(c.id, '')) WHERE x <> ''] AS cites`;

/** The papers behind a set of claims, with the sub-question cluster each paper was triaged into. */
export const CLAIMS_PAPERS_CLUSTERS = `
MATCH (c:Claim)-[:EXTRACTED_FROM]->(p:Paper)
WHERE c.id IN $ids
OPTIONAL MATCH (:AdamProject {id: $projectId})-[t:TRIAGED]->(p)
RETURN c.id AS claimId, p.paperId AS paperId, p.title AS title, coalesce(p.year, 0) AS year, coalesce(t.clusterId, '') AS clusterId, coalesce(t.label, '') AS triage`;

/** What the evidence claims use, depend on and contradict (one hop out from each). */
export const CLAIMS_CONTEXT = `
MATCH (c:Claim)-[r:USES|DEPENDS_ON|CONTRADICTS]->(n)
WHERE c.id IN $ids AND n.state <> 'retracted'
RETURN c.id AS source, type(r) AS type, labels(n)[0] AS label, n.id AS id, coalesce(n.text, n.name, '') AS text,
       coalesce(n.state, '') AS state, coalesce(n.stateReason, '') AS stateReason, n.decidedBy AS decidedBy, n.paperId AS paperId`;

export const HYPOTHESIS_PLAN_STEPS = `
MATCH (e:ExperimentPlan)-[:TESTS]->(h:Hypothesis {id: $id})
OPTIONAL MATCH (e)-[s:STEP]->(pr:Procedure)
RETURN e.id AS planId, coalesce(e.approvedAt, 0) AS approvedAt, pr.id AS procedureId, coalesce(pr.name, '') AS name,
       coalesce(s.order, 0) AS ord, coalesce(s.status, '') AS status, coalesce(s.gap, false) AS gap`;
