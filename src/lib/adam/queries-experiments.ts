// adam Cypher for hypothesis-as-query (path search over Procedure chains) and experiment
// plans. Chain semantics: (:Procedure)-[:PRODUCES]->(:Result); (P2)-[:DEPENDS_ON]->(P1) means
// P1 runs first. A chain is Result <-PRODUCES- Pn -DEPENDS_ON-> … -> P1, where P1 needs no
// prerequisite. Every list element is coalesced: a null inside a returned list crashes FalkorDB.

export const NEAREST_RESULTS = `
CALL db.idx.vector.queryNodes('Result', 'embedding', $k, vecf32($v)) YIELD node, score
WHERE node.projectId = $projectId AND node.state <> 'retracted'
RETURN node.id AS id, node.text AS text, score
ORDER BY score ASC`;

/** All chains ending in a result: the producing procedure and its prerequisite path (≤ 5 hops). */
export const PROCEDURE_CHAINS = `
MATCH (t:Result {id: $resultId})<-[:PRODUCES]-(last:Procedure)
WHERE last.state <> 'retracted'
MATCH p = (last)-[:DEPENDS_ON*0..5]->(first:Procedure)
WHERE NOT (first)-[:DEPENDS_ON]->(:Procedure)
  AND all(n IN nodes(p) WHERE n.state <> 'retracted')
RETURN [n IN nodes(p) | n.id] AS ids,
       [n IN nodes(p) | coalesce(n.name, '')] AS names,
       [n IN nodes(p) | coalesce(n.runnability, 'unknown')] AS runnability,
       [n IN nodes(p) | coalesce(n.feasibility, 'unknown')] AS feasibility,
       [n IN nodes(p) | coalesce(n.timeHours, 0)] AS hours,
       [n IN nodes(p) | coalesce(n.costUsd, 0)] AS cost,
       [n IN nodes(p) | coalesce(n.state, 'extracted')] AS states,
       length(p) AS hops
LIMIT 50`;

export const PROCEDURE_DETAILS = `
MATCH (pr:Procedure)
WHERE pr.id IN $ids
OPTIONAL MATCH (pr)-[:SPECIFIES]->(m:Method)
RETURN pr.id AS id, pr.name AS name, coalesce(pr.summary, '') AS summary, coalesce(pr.runnability, 'unknown') AS runnability,
       coalesce(pr.feasibility, 'unknown') AS feasibility, coalesce(pr.feasibilityNote, '') AS feasibilityNote,
       coalesce(pr.missing, []) AS missing, coalesce(pr.timeHours, 0) AS timeHours, coalesce(pr.costUsd, 0) AS costUsd,
       coalesce(pr.reliability, 0) AS reliability, coalesce(pr.inputs, []) AS inputs, coalesce(pr.outputs, []) AS outputs,
       coalesce(pr.expected, '') AS expected, coalesce(pr.conditions, []) AS conditions, pr.state AS state,
       coalesce(m.id, '') AS methodId, coalesce(m.name, '') AS methodName, coalesce(m.nameKey, '') AS methodKey,
       [(pr)-[u:USES]->(i:Instrument) | i.name + '|' + coalesce(i.kind, '') + '|' + CASE WHEN coalesce(u.available, false) THEN '1' ELSE '0' END] AS instruments`;

/** Verified claims nearest a sub-claim (evidence for / against, and gaps when none support). */
export const NEAREST_VERIFIED_CLAIMS = `
CALL db.idx.vector.queryNodes('Claim', 'embedding', $k, vecf32($v)) YIELD node, score
WHERE node.projectId = $projectId AND node.state IN ['agent_verified', 'human_approved']
MATCH (node)-[:EXTRACTED_FROM]->(p:Paper)
RETURN node.id AS id, node.text AS text, p.title AS paper, coalesce(p.year, 0) AS year, coalesce(node.page, 0) AS page,
       coalesce(node.section, '') AS section, coalesce(node.conditions, []) AS conditions, score
ORDER BY score ASC`;

export const CLAIM_BOUNDARY = `
MATCH (c:Claim) WHERE c.id IN $ids
OPTIONAL MATCH (c)-[:FAILS_UNDER]->(k:Condition) WHERE k.state <> 'retracted'
OPTIONAL MATCH (c)-[:DEPENDS_ON]->(a:Assumption) WHERE a.state <> 'retracted'
WITH collect(DISTINCT coalesce(k.text, '')) AS fails, collect(DISTINCT {id: coalesce(a.id, ''), text: coalesce(a.text, ''), loadBearing: coalesce(a.loadBearing, false), dependents: coalesce(a.dependents, 0)}) AS assumptions
RETURN [f IN fails WHERE f <> ''] AS fails, [a IN assumptions WHERE a.id <> ''] AS assumptions`;

/** Methods matching the mechanism (by name key) so rival chains can be told from the hypothesis's own. */
export const METHODS_BY_KEYS = `
MATCH (m:Method {projectId: $projectId})
WHERE m.nameKey IN $keys OR any(a IN coalesce(m.aliases, []) WHERE toLower(a) IN $keys)
RETURN m.id AS id, m.name AS name, m.nameKey AS nameKey`;

export const NEAREST_METHODS_TO = `
CALL db.idx.vector.queryNodes('Method', 'embedding', $k, vecf32($v)) YIELD node, score
WHERE node.projectId = $projectId AND score <= $maxDistance
RETURN node.id AS id, node.name AS name, score
ORDER BY score ASC`;

/** The hypothesis-as-query re-prioritises the Methods Hunter: how many chains pass through each method. */
export const BUMP_CHAINS_NEEDING = `
UNWIND $rows AS r
MATCH (m:Method {id: r.methodId})
SET m.chainsNeeding = coalesce(m.chainsNeeding, 0) + r.n
RETURN count(m) AS n`;

export const UPSERT_OPEN_QUESTION = `
MERGE (q:OpenQuestion {id: $id})
ON CREATE SET q.createdAt = $at
SET q.projectId = $projectId, q.text = $text, q.kind = $kind, q.state = 'agent_verified', q.confidence = 0.7,
    q.extractedBy = $runId, q.chainsNeeding = coalesce(q.chainsNeeding, 0) + 1, q.updatedAt = $at, q.stateReason = null
RETURN q.id AS id`;

export const LINK_BLOCKS = `
MATCH (q:OpenQuestion {id: $questionId}), (h:Hypothesis {id: $hypothesisId})
MERGE (q)-[b:BLOCKS]->(h)
SET b.at = $at
RETURN count(b) AS n`;

export const CLEAR_HYPOTHESIS_CHAINS = `
MATCH (h:Hypothesis {id: $id})-[r:CHAIN|PREDICTS]->()
DELETE r`;

export const LINK_HYPOTHESIS_CHAIN = `
UNWIND $rows AS r
MATCH (h:Hypothesis {id: $id}), (pr:Procedure {id: r.procedureId})
MERGE (h)-[c:CHAIN {rank: r.rank, step: r.step}]->(pr)
SET c.cost = r.cost, c.status = r.status, c.at = $at
RETURN count(c) AS n`;

export const LINK_HYPOTHESIS_PREDICTS = `
MATCH (h:Hypothesis {id: $id}), (x:Result {id: $resultId})
MERGE (h)-[p:PREDICTS]->(x)
SET p.score = $score, p.at = $at
RETURN count(p) AS n`;

export const SET_HYPOTHESIS_QUERY = `
MATCH (h:Hypothesis {id: $id})
SET h.minimumExperiment = $minimumExperiment, h.costToKill = $costToKill, h.queryAt = $at, h.queryResult = $queryResult
RETURN h.id AS id`;

export const SURVIVING_BRIEFS = `
MATCH (h:Hypothesis {projectId: $projectId, pass: $pass})
WHERE h.status = 'survived'
RETURN h.id AS id, h.statement AS statement, h.killSignedAt AS killSignedAt, h.killCriteria AS killCriteria`;

export const RIVAL_ATTACKS = `
MATCH (a:Attack {kind: 'rival'})-[:ON]->(h:Hypothesis {id: $id})
RETURN a.id AS id, a.text AS text, coalesce(a.control, '') AS control, a.status AS status`;

// ---------------------------------------------------------------- Experiment plans

export const UPSERT_PLAN = `
MATCH (h:Hypothesis {id: $hypothesisId})
MERGE (e:ExperimentPlan {id: $id})
ON CREATE SET e.createdAt = $at
SET e.projectId = $projectId, e.hypothesisId = $hypothesisId, e.steps = $steps, e.controls = $controls, e.rationale = $rationale,
    e.killTest = $killTest, e.costToKill = $costToKill, e.rank = $rank, e.designCheck = $designCheck, e.designPasses = $designPasses,
    e.state = $state, e.confidence = $confidence, e.extractedBy = $runId, e.updatedAt = $at, e.version = coalesce(e.version, 0) + 1,
    e.approvedBy = null, e.approvedAt = null, e.stateReason = null
MERGE (e)-[t:TESTS]->(h)
SET t.at = $at
RETURN e.id AS id`;

export const CLEAR_PLAN_STEPS = `
MATCH (e:ExperimentPlan {id: $id})-[s:STEP]->()
DELETE s`;

export const LINK_PLAN_STEPS = `
UNWIND $rows AS r
MATCH (e:ExperimentPlan {id: $id}), (pr:Procedure {id: r.procedureId})
MERGE (e)-[s:STEP {order: r.order}]->(pr)
SET s.purpose = r.purpose, s.status = r.status, s.gap = r.gap
RETURN count(s) AS n`;

export const PLANS = `
MATCH (e:ExperimentPlan {projectId: $projectId})-[:TESTS]->(h:Hypothesis)
RETURN e.id AS id, e.hypothesisId AS hypothesisId, h.statement AS statement, h.status AS hypothesisStatus, coalesce(e.steps, '[]') AS steps,
       coalesce(e.controls, '[]') AS controls, coalesce(e.rationale, '') AS rationale, coalesce(e.killTest, '') AS killTest,
       coalesce(e.costToKill, 0) AS costToKill, coalesce(e.rank, 0) AS rank, coalesce(e.designCheck, '{}') AS designCheck,
       coalesce(e.designPasses, false) AS designPasses, e.state AS state, e.approvedBy AS approvedBy, e.approvedAt AS approvedAt,
       coalesce(e.version, 1) AS version, e.createdAt AS createdAt, e.updatedAt AS updatedAt
ORDER BY e.rank, e.createdAt`;

export const APPROVE_PLAN = `
MATCH (e:ExperimentPlan {id: $id})
WHERE e.projectId = $projectId
SET e.approvedBy = $userId, e.approvedAt = $at, e.state = 'human_approved'
RETURN e.id AS id, e.hypothesisId AS hypothesisId`;
