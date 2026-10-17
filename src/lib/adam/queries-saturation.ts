// adam Cypher for the saturation bar, the stopping rules and the living loop (next pass,
// re-sweep, briefs whose evidence changed).

/** Per cluster (sub-question), the papers read in order with the new nodes each one added. */
export const PAPER_NODE_SERIES = `
MATCH (:AdamProject {id: $projectId})-[t:TRIAGED]->(p:Paper)
WHERE t.label IN ['core', 'contradicts', 'method_only'] AND t.extractedAt IS NOT NULL
RETURN coalesce(t.clusterId, '') AS clusterId, coalesce(t.community, '') AS community, p.paperId AS paperId, p.title AS title,
       t.extractedAt AS extractedAt, coalesce(t.nodesNew, 0) AS nodesNew, coalesce(t.nodesReused, 0) AS nodesReused, t.label AS label
ORDER BY t.extractedAt`;

export const UPSERT_CLUSTER_STAT = `
UNWIND $rows AS r
MERGE (s:ClusterStat {projectId: $projectId, clusterId: r.clusterId})
SET s.label = r.label, s.papers = r.papers, s.newNodesLast = r.newNodesLast, s.window = r.window, s.series = r.series,
    s.saturated = r.saturated, s.fill = r.fill, s.updatedAt = $at, s.pass = $pass
RETURN count(s) AS n`;

export const CLUSTER_STATS = `
MATCH (s:ClusterStat {projectId: $projectId})
RETURN s.clusterId AS clusterId, coalesce(s.label, '') AS label, coalesce(s.papers, 0) AS papers, coalesce(s.newNodesLast, 0) AS newNodesLast,
       coalesce(s.window, 0) AS window, coalesce(s.series, '[]') AS series, coalesce(s.saturated, false) AS saturated,
       coalesce(s.fill, 0) AS fill, s.updatedAt AS updatedAt, coalesce(s.pass, 1) AS pass
ORDER BY clusterId`;

/** Which clusters a brief rests on: the clusters of the papers behind its evidence. */
export const BRIEF_CLUSTERS = `
MATCH (h:Hypothesis {projectId: $projectId})-[:EVIDENCE_FOR]->(c:Claim)
MATCH (:AdamProject {id: $projectId})-[t:TRIAGED]->(p:Paper)
WHERE p.paperId = c.paperId
RETURN h.id AS hypothesisId, coalesce(t.clusterId, '') AS clusterId, count(c) AS claims`;

export const SET_BRIEF_THIN = `
UNWIND $rows AS r
MATCH (h:Hypothesis {id: r.id})
SET h.thinClusters = r.thin, h.saturationChecked = $at
RETURN count(h) AS n`;

/** A brief whose supporting claim is now contradicted by a new verified claim. */
export const FLAG_BRIEFS_EVIDENCE_CHANGED = `
MATCH (h:Hypothesis {projectId: $projectId})-[:EVIDENCE_FOR]->(c:Claim)<-[r:CONTRADICTS]-(n:Claim)
WHERE r.at >= $since AND h.status IN ['selected', 'attacked', 'survived', 'draft']
SET h.evidenceChangedAt = $at, h.evidenceChangeNote = 'A new verified claim contradicts evidence this brief rests on'
RETURN DISTINCT h.id AS id, h.statement AS statement, n.text AS newClaim`;

/** The loop returns to reading: pass + 1, back to the question, sharper sub-questions. */
export const NEXT_PASS = `
MATCH (p:AdamProject {id: $id})
SET p.pass = coalesce(p.pass, 1) + 1, p.phase = 'question', p.status = 'running', p.gate = null,
    p.spentPapers = 0, p.spentLlmCalls = 0, p.passStartedAt = $at, p.updatedAt = $at
RETURN p.pass AS pass`;

/** What earlier passes left open, for the Scoper's next page. */
export const OPEN_ATTACKS = `
MATCH (a:Attack {projectId: $projectId})-[:ON]->(h:Hypothesis)
WHERE a.status IN ['open', 'fatal']
RETURN a.kind AS kind, a.text AS text, a.status AS status, h.statement AS hypothesis, h.status AS hypothesisStatus
ORDER BY CASE a.status WHEN 'fatal' THEN 0 ELSE 1 END, a.createdAt DESC
LIMIT 20`;

export const OPEN_QUESTIONS = `
MATCH (q:OpenQuestion {projectId: $projectId})
WHERE q.state <> 'retracted'
RETURN q.kind AS kind, q.text AS text, coalesce(q.chainsNeeding, 0) AS chainsNeeding
ORDER BY chainsNeeding DESC, q.createdAt DESC
LIMIT 20`;

export const PASS_SUMMARY = `
MATCH (h:Hypothesis {projectId: $projectId})
RETURN h.pass AS pass, h.status AS status, h.statement AS statement
ORDER BY h.pass DESC, h.status`;

/** Core papers' OpenAlex ids, for the scheduled re-sweep (works citing them since a date). */
export const CORE_OPENALEX_IDS = `
MATCH (:AdamProject {id: $projectId})-[t:TRIAGED]->(p:Paper)
WHERE t.label IN ['core', 'contradicts'] AND p.paperId STARTS WITH 'W'
RETURN p.paperId AS paperId`;

export const SET_LAST_SWEEP = `
MATCH (p:AdamProject {id: $id})
SET p.lastSweepAt = $at
RETURN p.id AS id`;
