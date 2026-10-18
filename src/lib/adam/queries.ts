// adam Cypher templates. Agents and routes never write free-form Cypher: every statement
// lives here, is parameterised, and carries $projectId so the range indexes apply.
// FalkorDB rules observed throughout: no nulls inside returned lists (coalesce everything),
// DELETE and MERGE in separate statements, shortestPath only in WITH/RETURN.

// ---------------------------------------------------------------- Projects

const PROJECT_FIELDS = `
  p.id AS id, p.workspaceId AS workspaceId, p.title AS title, coalesce(p.topic, '') AS topic,
  coalesce(p.understanding, '') AS understanding, coalesce(p.constraints, '{}') AS constraints,
  coalesce(p.seeds, '[]') AS seeds, p.phase AS phase, p.status AS status, coalesce(p.pass, 1) AS pass,
  coalesce(p.budget, '{}') AS budget, coalesce(p.spentPapers, 0) AS spentPapers, coalesce(p.spentLlmCalls, 0) AS spentLlmCalls,
  coalesce(p.maxConcurrency, 3) AS maxConcurrency, coalesce(p.papers, '[]') AS papers,
  p.gate AS gate, p.createdBy AS createdBy, p.createdAt AS createdAt, p.updatedAt AS updatedAt`;

export const CREATE_PROJECT = `
CREATE (p:AdamProject {
  id: $id, workspaceId: $workspaceId, title: $title, topic: $topic, understanding: $understanding,
  constraints: $constraints, seeds: $seeds, phase: 'question', status: 'idle', pass: 1,
  budget: $budget, spentPapers: 0, spentLlmCalls: 0, maxConcurrency: 3, gate: null,
  createdBy: $userId, createdAt: $at, updatedAt: $at
})
RETURN ${PROJECT_FIELDS}`;

/** Atomic spend counters (several workers may be running jobs for one project). */
export const INCREMENT_SPENT = `
MATCH (p:AdamProject {id: $id})
SET p.spentPapers = coalesce(p.spentPapers, 0) + $papers, p.spentLlmCalls = coalesce(p.spentLlmCalls, 0) + $llmCalls
RETURN p.spentPapers AS spentPapers, p.spentLlmCalls AS spentLlmCalls`;

/** A pass write-up was saved as a workspace file; the project keeps the list. */
export const ADD_PROJECT_PAPER = `
MATCH (p:AdamProject {id: $id})
SET p.papers = coalesce(p.papers, '[]'), p.updatedAt = $at
WITH p
SET p.papers = left(p.papers, size(p.papers) - 1) + CASE WHEN p.papers = '[]' THEN '' ELSE ',' END + $entry + ']'
RETURN p.papers AS papers`;

/** A new pass resets the per-pass spend (the budget rule is per pass). */
export const RESET_SPENT = `
MATCH (p:AdamProject {id: $id})
SET p.spentPapers = 0, p.spentLlmCalls = 0
RETURN p.id AS id`;

// ---------------------------------------------------------------- Question page (Scoper, gate 1)

const QUESTION_FIELDS = `
  q.id AS id, q.projectId AS projectId, q.pass AS pass, coalesce(q.hunch, '') AS hunch, coalesce(q.why, '') AS why,
  coalesce(q.subquestions, '[]') AS subquestions, coalesce(q.vocabulary, '{}') AS vocabulary,
  coalesce(q.scopeFence, '{}') AS scopeFence, coalesce(q.checks, '{}') AS checks, q.state AS state,
  q.runId AS runId, q.approvedBy AS approvedBy, q.approvedAt AS approvedAt, q.createdAt AS createdAt, q.updatedAt AS updatedAt`;

/** One page per pass. Re-running the Scoper replaces an unapproved page; an approved one is never overwritten by an agent. */
export const UPSERT_QUESTION_PAGE = `
MATCH (p:AdamProject {id: $projectId})
MERGE (q:QuestionPage {projectId: $projectId, pass: $pass})
ON CREATE SET q.id = $id, q.createdAt = $at
SET q.hunch = $hunch, q.why = $why, q.subquestions = $subquestions, q.vocabulary = $vocabulary,
    q.scopeFence = $scopeFence, q.checks = $checks, q.state = $state, q.runId = $runId, q.updatedAt = $at
MERGE (q)-[:OF]->(p)
RETURN ${QUESTION_FIELDS}`;

export const GET_QUESTION_PAGE = `
MATCH (q:QuestionPage {projectId: $projectId})
RETURN ${QUESTION_FIELDS}
ORDER BY q.pass DESC
LIMIT 1`;

/** Researcher edits outrank agent output: the page becomes human_approved on save. */
export const EDIT_QUESTION_PAGE = `
MATCH (q:QuestionPage {projectId: $projectId, pass: $pass})
SET q.hunch = coalesce($hunch, q.hunch), q.why = coalesce($why, q.why), q.subquestions = coalesce($subquestions, q.subquestions),
    q.vocabulary = coalesce($vocabulary, q.vocabulary), q.scopeFence = coalesce($scopeFence, q.scopeFence),
    q.state = 'human_approved', q.editedBy = $userId, q.updatedAt = $at
RETURN ${QUESTION_FIELDS}`;

export const APPROVE_QUESTION_PAGE = `
MATCH (q:QuestionPage {projectId: $projectId, pass: $pass})
SET q.approvedBy = $userId, q.approvedAt = $at, q.state = 'human_approved', q.updatedAt = $at
RETURN ${QUESTION_FIELDS}`;

export const LIST_PROJECTS = `
MATCH (p:AdamProject {workspaceId: $workspaceId})
RETURN ${PROJECT_FIELDS}
ORDER BY p.updatedAt DESC`;

export const GET_PROJECT = `
MATCH (p:AdamProject {id: $id})
RETURN ${PROJECT_FIELDS}`;

/** Researcher edits: any field left null keeps its value. */
export const UPDATE_PROJECT = `
MATCH (p:AdamProject {id: $id})
SET p.title = coalesce($title, p.title), p.topic = coalesce($topic, p.topic),
    p.understanding = coalesce($understanding, p.understanding), p.constraints = coalesce($constraints, p.constraints),
    p.seeds = coalesce($seeds, p.seeds), p.budget = coalesce($budget, p.budget),
    p.maxConcurrency = coalesce($maxConcurrency, p.maxConcurrency), p.updatedAt = $at
RETURN ${PROJECT_FIELDS}`;

export const SET_PROJECT_STATE = `
MATCH (p:AdamProject {id: $id})
SET p.status = coalesce($status, p.status), p.phase = coalesce($phase, p.phase),
    p.gate = CASE WHEN $clearGate THEN null ELSE coalesce($gate, p.gate) END,
    p.pass = coalesce($pass, p.pass), p.updatedAt = $at
RETURN ${PROJECT_FIELDS}`;

export const DELETE_PROJECT = `
MATCH (p:AdamProject {id: $id})
DETACH DELETE p`;

/** Everything owned by a project (nodes carry projectId). Jobs and events included. */
export const DELETE_PROJECT_NODES = `
MATCH (n) WHERE n.projectId = $id
DETACH DELETE n`;

// ---------------------------------------------------------------- Jobs

const JOB_FIELDS = `
  j.id AS id, j.projectId AS projectId, j.kind AS kind, j.subject AS subject, j.dedupeKey AS dedupeKey,
  coalesce(j.payload, '{}') AS payload, j.status AS status, coalesce(j.priority, 100) AS priority,
  coalesce(j.runAfter, 0) AS runAfter, coalesce(j.attempts, 0) AS attempts, coalesce(j.maxAttempts, 3) AS maxAttempts,
  j.lockedBy AS lockedBy, j.lockedAt AS lockedAt, j.heartbeatAt AS heartbeatAt, j.error AS error,
  j.result AS result, j.createdAt AS createdAt, j.finishedAt AS finishedAt, coalesce(j.progress, '{}') AS progress`;

/**
 * Enqueue once per dedupeKey. A re-tick that enqueues the same key is a no-op (the spec's
 * orchestrator is driven by graph state, so it may ask for the same work many times).
 * `created` tells the caller whether this call made the job.
 */
export const ENQUEUE_JOB = `
MERGE (j:AdamJob {dedupeKey: $dedupeKey})
ON CREATE SET j.id = $id, j.projectId = $projectId, j.kind = $kind, j.subject = $subject, j.payload = $payload,
              j.status = 'queued', j.priority = $priority, j.runAfter = $runAfter, j.attempts = 0,
              j.maxAttempts = $maxAttempts, j.createdAt = $at
RETURN j.id AS id, j.status AS status, j.createdAt = $at AS created`;

/** Put an existing job (e.g. the project's single orchestrate job) back on the queue. */
export const RESCHEDULE_JOB = `
MATCH (j:AdamJob {id: $id})
SET j.status = 'queued', j.runAfter = $runAfter, j.lockedBy = null, j.lockedAt = null, j.heartbeatAt = null,
    j.error = null, j.payload = coalesce($payload, j.payload)
RETURN j.id AS id`;

/**
 * Atomic claim: one query takes the oldest, highest-priority runnable job. A paused project
 * is a human hold: its jobs wait. Any other state runs jobs, so work a person asks for by
 * hand (write the question page, hunt a method, re-extract) runs on an idle or gated project.
 * $busyProjects are projects already at their concurrency limit.
 */
export const CLAIM_JOB = `
MATCH (j:AdamJob {status: 'queued'})
WHERE j.runAfter <= $now AND NOT j.projectId IN $busyProjects
OPTIONAL MATCH (p:AdamProject {id: j.projectId})
WITH j, p
WHERE j.kind = 'noop' OR p IS NULL OR coalesce(p.status, 'idle') <> 'paused'
WITH j ORDER BY j.priority ASC, j.createdAt ASC LIMIT 1
SET j.status = 'running', j.lockedBy = $worker, j.lockedAt = $now, j.heartbeatAt = $now, j.attempts = coalesce(j.attempts, 0) + 1
RETURN ${JOB_FIELDS}`;

export const HEARTBEAT_JOB = `
MATCH (j:AdamJob {id: $id, status: 'running'})
SET j.heartbeatAt = $now, j.progress = coalesce($progress, j.progress)
RETURN j.id AS id`;

/** Only the worker holding the job may finish it: a handler abandoned after a timeout, or a worker
 *  that lost the job to the stale requeue, must not overwrite another worker's run. */
export const COMPLETE_JOB = `
MATCH (j:AdamJob {id: $id})
WHERE j.status = 'running' AND ($worker IS NULL OR j.lockedBy = $worker)
SET j.status = 'done', j.result = $result, j.finishedAt = $now, j.error = null
RETURN j.id AS id`;

/** Retry with backoff until maxAttempts, then failed. The caller computes status and runAfter. */
export const FAIL_JOB = `
MATCH (j:AdamJob {id: $id})
WHERE j.status = 'running' AND ($worker IS NULL OR j.lockedBy = $worker)
SET j.status = $status, j.error = $error, j.runAfter = $runAfter, j.lockedBy = null,
    j.finishedAt = CASE WHEN $status = 'failed' THEN $now ELSE null END
RETURN j.id AS id`;

/** A worker died mid-job: anything without a heartbeat for $staleMs goes back on the queue. */
export const REQUEUE_STALE_JOBS = `
MATCH (j:AdamJob {status: 'running'})
WHERE coalesce(j.heartbeatAt, j.lockedAt, 0) < $now - $staleMs
SET j.status = 'queued', j.lockedBy = null, j.error = 'requeued: worker lost'
RETURN count(j) AS n`;

export const RUNNING_PER_PROJECT = `
MATCH (j:AdamJob {status: 'running'})
RETURN j.projectId AS projectId, count(j) AS n`;

export const JOB_COUNTS = `
MATCH (j:AdamJob {projectId: $projectId})
RETURN j.status AS status, j.kind AS kind, count(j) AS n`;

export const RECENT_JOBS = `
MATCH (j:AdamJob {projectId: $projectId})
RETURN ${JOB_FIELDS}
ORDER BY coalesce(j.finishedAt, j.lockedAt, j.createdAt) DESC
LIMIT $limit`;

export const JOBS_BY_KIND_STATUS = `
MATCH (j:AdamJob {projectId: $projectId})
WHERE j.kind IN $kinds AND j.status IN $statuses
RETURN ${JOB_FIELDS}`;

export const CANCEL_QUEUED_JOBS = `
MATCH (j:AdamJob {projectId: $projectId, status: 'queued'})
WHERE $kinds = [] OR j.kind IN $kinds
SET j.status = 'cancelled', j.finishedAt = $now
RETURN count(j) AS n`;

export const GET_JOB = `
MATCH (j:AdamJob {id: $id})
RETURN ${JOB_FIELDS}`;

// ---------------------------------------------------------------- Events

export const EMIT_EVENT = `
CREATE (e:AdamEvent {id: $id, projectId: $projectId, kind: $kind, payload: $payload, at: $at})
RETURN e.id AS id`;

export const RECENT_EVENTS = `
MATCH (e:AdamEvent {projectId: $projectId})
RETURN e.id AS id, e.projectId AS projectId, e.kind AS kind, coalesce(e.payload, '{}') AS payload, e.at AS at
ORDER BY e.at DESC
LIMIT $limit`;

// ---------------------------------------------------------------- Status / counts

/** Node counts by label and state for a project (one UNION branch per indexed label). */
export const NODE_COUNTS = ["Claim", "Evidence", "Method", "Procedure", "Instrument", "Assumption", "Result", "OpenQuestion", "Hypothesis", "Candidate", "Attack", "ExperimentPlan"]
  .map((l) => `MATCH (n:${l} {projectId: $projectId}) RETURN '${l}' AS label, coalesce(n.state, '') AS state, count(n) AS n`)
  .join("\nUNION ALL\n");

export const TRIAGE_COUNTS = `
MATCH (:AdamProject {id: $projectId})-[t:TRIAGED]->(p:Paper)
RETURN coalesce(t.label, 'unlabelled') AS label, coalesce(t.ring, 'seed') AS ring,
       sum(CASE WHEN coalesce(p.chunkSchema, 0) >= 2 THEN 1 ELSE 0 END) AS fullText, count(p) AS n`;

// ---------------------------------------------------------------- Sweep (Searcher, triage, coverage)

/**
 * Triage edges from the project to papers. A person's label (decidedBy set) is never
 * overwritten by an agent; the agent's own label can be refreshed by a later ring.
 */
export const UPSERT_TRIAGED = `
MATCH (a:AdamProject {id: $projectId})
UNWIND $rows AS r
MATCH (p:Paper {paperId: r.paperId})
MERGE (a)-[t:TRIAGED]->(p)
ON CREATE SET t.at = $at, t.ring = r.ring, t.via = r.via, t.pass = $pass
SET t.label = CASE WHEN t.decidedBy IS NOT NULL THEN t.label ELSE r.label END,
    t.agentLabel = r.label, t.confidence = r.confidence, t.reason = r.reason,
    t.clusterId = coalesce(r.clusterId, t.clusterId), t.runId = $runId,
    t.userLabel = coalesce(r.userLabel, t.userLabel)
RETURN count(t) AS n`;

/** The researcher relabels a paper (or marks a seed trusted / distrusted). */
export const SET_TRIAGE_LABEL = `
MATCH (a:AdamProject {id: $projectId})-[t:TRIAGED]->(p:Paper {paperId: $paperId})
SET t.label = coalesce($label, t.label), t.userLabel = coalesce($userLabel, t.userLabel),
    t.decidedBy = $userId, t.decidedAt = $at
RETURN t.label AS label`;

export const TRIAGED_IDS = `
MATCH (:AdamProject {id: $projectId})-[t:TRIAGED]->(p:Paper)
RETURN p.paperId AS paperId, t.label AS label`;

/** Everything the Sweep tab shows per paper. */
export const TRIAGED_PAPERS = `
MATCH (:AdamProject {id: $projectId})-[t:TRIAGED]->(p:Paper)
OPTIONAL MATCH (s:IngestStatus) WHERE s.pgPaperId = p.pgPaperId
RETURN p.paperId AS paperId, p.pgPaperId AS pgPaperId, p.title AS title, p.year AS year, p.venue AS venue,
       coalesce(p.citationCount, 0) AS citationCount, p.doi AS doi, p.arxivId AS arxivId,
       t.label AS label, t.agentLabel AS agentLabel, t.userLabel AS userLabel, t.ring AS ring, t.via AS via,
       t.clusterId AS clusterId, coalesce(t.confidence, 0) AS confidence, t.reason AS reason, t.decidedBy AS decidedBy,
       t.at AS at, coalesce(t.nodesNew, 0) AS nodesNew, coalesce(t.nodesReused, 0) AS nodesReused,
       coalesce(p.accessStatus, CASE WHEN coalesce(p.chunkCount, 0) > 0 THEN 'full_text' ELSE 'unknown' END) AS accessStatus,
       coalesce(p.chunkCount, 0) AS chunks, coalesce(p.chunkSchema, 0) AS chunkSchema, s.fullText AS fullTextState, s.state AS ingestState,
       p.adamState AS adamState
ORDER BY t.at DESC`;

/** Core / contradicting papers that have an OpenAlex id (so the citation ring can expand them). */
export const CORE_PAPERS = `
MATCH (:AdamProject {id: $projectId})-[t:TRIAGED]->(p:Paper)
WHERE t.label IN ['core', 'contradicts']
RETURN p.paperId AS paperId, p.title AS title, t.clusterId AS clusterId, coalesce(p.chunkCount, 0) AS chunks`;

/**
 * Backward ring from the graph: references of core papers (the Librarian already fanned
 * them out as CITES edges), ranked by how many core papers cite them, then by citations.
 * Not yet triaged for this project.
 */
export const BACKWARD_CANDIDATES = `
MATCH (a:AdamProject {id: $projectId})-[t:TRIAGED]->(core:Paper)-[:CITES]->(ref:Paper)
WHERE t.label IN ['core', 'contradicts'] AND NOT (a)-[:TRIAGED]->(ref) AND coalesce(ref.suspect, false) = false
WITH ref, count(DISTINCT core) AS citedByCore, collect(DISTINCT core.paperId)[0] AS via, collect(DISTINCT t.clusterId)[0] AS clusterId
RETURN ref.paperId AS paperId, ref.title AS title, ref.abstract AS abstract, ref.year AS year, ref.venue AS venue,
       coalesce(ref.citationCount, 0) AS citationCount, ref.doi AS doi, ref.arxivId AS arxivId, ref.pgPaperId AS pgPaperId,
       citedByCore, coalesce(via, '') AS via, coalesce(clusterId, '') AS clusterId
ORDER BY citedByCore DESC, citationCount DESC
LIMIT $limit`;

/**
 * Adjacent ring from the graph: papers sharing ≥2 concepts with core papers but with no
 * citation link to any of them (the "same problem under other vocabulary" case).
 */
export const CONCEPT_OVERLAP_CANDIDATES = `
MATCH (a:AdamProject {id: $projectId})-[t:TRIAGED]->(core:Paper)-[:ABOUT]->(c:Concept)<-[:ABOUT]-(p:Paper)
WHERE t.label IN ['core', 'contradicts'] AND NOT (a)-[:TRIAGED]->(p) AND NOT (p)-[:CITES]-(core)
  AND coalesce(p.suspect, false) = false
WITH p, count(DISTINCT c) AS shared, collect(DISTINCT core.paperId)[0] AS via, collect(DISTINCT t.clusterId)[0] AS clusterId
WHERE shared >= 2
RETURN p.paperId AS paperId, p.title AS title, p.abstract AS abstract, p.year AS year, p.venue AS venue,
       coalesce(p.citationCount, 0) AS citationCount, p.doi AS doi, p.arxivId AS arxivId, p.pgPaperId AS pgPaperId,
       shared, coalesce(via, '') AS via, coalesce(clusterId, '') AS clusterId
ORDER BY shared DESC, citationCount DESC
LIMIT $limit`;

/**
 * Coverage check (the Searcher's checker): for each core paper, how many of its ten most-cited
 * references the project has triaged. Core papers with no CITES edges yield no row.
 */
export const CORE_REFERENCE_COVERAGE = `
MATCH (a:AdamProject {id: $projectId})-[t:TRIAGED]->(core:Paper)-[:CITES]->(ref:Paper)
WHERE t.label IN ['core', 'contradicts']
WITH a, core, ref ORDER BY coalesce(ref.citationCount, 0) DESC
WITH a, core, collect(ref) AS refs
WITH a, core, refs[0..10] AS top
UNWIND top AS ref
OPTIONAL MATCH (a)-[tr:TRIAGED]->(ref)
WITH core, count(ref) AS refs, count(tr) AS covered
RETURN core.paperId AS paperId, core.title AS title, refs, covered`;

/** Adjacent-field presence: triaged papers found through each adjacent term. */
export const ADJACENT_PRESENCE = `
MATCH (:AdamProject {id: $projectId})-[t:TRIAGED {ring: 'adjacent'}]->(p:Paper)
RETURN t.via AS via, count(p) AS n`;

export const SET_PROJECT_COVERAGE = `
MATCH (p:AdamProject {id: $id})
SET p.coverage = $coverage, p.updatedAt = $at
RETURN p.id AS id`;

export const GET_PROJECT_COVERAGE = `
MATCH (p:AdamProject {id: $id})
RETURN coalesce(p.coverage, '{}') AS coverage`;

/** Background (metadata-only) papers the sweep found: nodes without a library row. */
export const UPSERT_SWEEP_PAPERS = `
UNWIND $rows AS r
MERGE (p:Paper {paperId: r.paperId})
ON CREATE SET p.inLibrary = false, p.createdAt = timestamp(), p.title = r.title, p.titleKey = r.titleKey,
              p.abstract = r.abstract, p.year = r.year, p.venue = r.venue, p.citationCount = r.citationCount,
              p.doi = r.doi, p.arxivId = r.arxivId, p.metaSuspect = false
SET p.accessStatus = coalesce(p.accessStatus, CASE WHEN r.abstract IS NULL THEN 'unavailable' ELSE 'abstract_only' END)
RETURN count(p) AS n`;

/** What the Librarian managed for a set of library rows: full text, abstract only, or nothing. */
export const FULLTEXT_OUTCOME = `
MATCH (p:Paper) WHERE p.pgPaperId IN $pgIds
RETURN coalesce(p.accessStatus, CASE WHEN coalesce(p.chunkCount, 0) > 0 THEN 'full_text' ELSE 'unavailable' END) AS status, count(p) AS n`;
