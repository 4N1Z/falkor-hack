# The Cypher queries and graph algorithms Neura Query depends on

FalkorDB is the only store the agents reason over. The product has two graphs' worth of work on one
database: the **research graph** every workspace already keeps (papers, authors, concepts, chunks,
draft sentences), and **Adam**, the research-agent system built during the hackathon, which runs
entirely inside that same graph: its question pages, extracted claims and methods, procedures,
hypotheses, attacks, experiment plans, observations, **and its own job queue** are all nodes. Take
FalkorDB away and there is no product left, not even an orchestrator.

One graph per workspace, named `ws:<workspaceId>`, so tenants never share a key space. Every template
below lives in `src/lib/graph/queries.ts` (research graph) or `src/lib/adam/queries*.ts` (Adam), each
exported as a named constant and run with parameters; agents never write free-form Cypher. The graph
model itself is in [README.md › Graph model](README.md#graph-model).

| | Count |
|---|---|
| Cypher templates | 302 (89 research graph, 213 Adam) |
| Graph algorithms used | 5 (`labelPropagation`, `WCC`, `SPpaths`, `pageRank`, `allShortestPaths`) plus variable-length path matching |
| Vector indexes | 10 labels, 1024-d cosine (Cohere embed-english-v3.0) |
| Full-text indexes | 4 (`Paper`, `Chunk`, `Claim`, `Procedure`) |
| Queries in one Adam pass over ~250 papers | about 6,000 |

---

## 1. Graph algorithms

### `algo.labelPropagation` — communities of the literature

Used by the **Graph Analyst** (Adam phase 5, Connect) to find *holes*: two communities that share
methods and vocabulary but have no citation, extension or contradiction edge between them. Also runs
over the whole research graph for the Research Graph page's community colouring, and its communities
become the clusters the **saturation bar** tracks.

```cypher
CALL algo.labelPropagation({nodeLabels: ['Paper', 'Method', 'Claim'],
                            relationshipTypes: ['CITES', 'USED_IN', 'USES', 'EXTRACTED_FROM'],
                            maxIterations: 20}) YIELD node, communityId
WITH node, communityId WHERE labels(node)[0] = 'Paper'
MATCH (:AdamProject {id: $projectId})-[t:TRIAGED]->(node)
RETURN node.paperId AS paperId, node.title AS title, communityId, t.label AS label, coalesce(t.clusterId, '') AS clusterId
```
`src/lib/adam/queries-analyst.ts` (`PROJECT_COMMUNITIES`), `src/lib/graph/queries.ts` (`TEAM_COMMUNITIES`). Running methods and claims through the propagation alongside papers is deliberate: two papers that never cite each other but use the same method land in one community, which is exactly the kind of unconnected-but-related pair the Analyst is after.

### `algo.WCC` — connected components as the fast first cut

Before pairing communities, the Analyst asks which papers can reach each other at all. Two
communities in different weakly connected components are candidates by construction; two in the same
component need the vector test. 18 components over 71 papers in 18 ms on the demo workspace.

```cypher
CALL algo.WCC({nodeLabels: ['Paper', 'Method', 'Claim'],
               relationshipTypes: ['CITES', 'USED_IN', 'USES', 'EXTRACTED_FROM']}) YIELD node, componentId
WITH node, componentId WHERE labels(node)[0] = 'Paper'
MATCH (:AdamProject {id: $projectId})-[:TRIAGED]->(node)
RETURN node.paperId AS paperId, componentId
```
`src/lib/adam/queries-analyst.ts` (`PROJECT_COMPONENTS`).

### Variable-length paths over `DEPENDS_ON` — the hypothesis as a query

The headline feature. A hypothesis is turned into a predicted `Result`; the graph answers with every
chain of `Procedure`s that produces it, walking prerequisite edges back to a procedure with none.
Each step carries its runnability, feasibility for this lab, time and cost, which become the
*cost to kill* the hypothesis. A chain with no path is a gap, stored as an `OpenQuestion` that
re-prioritises the Methods Hunter.

```cypher
MATCH (t:Result {id: $resultId})<-[:PRODUCES]-(last:Procedure)
WHERE last.state <> 'retracted'
MATCH p = (last)-[:DEPENDS_ON*0..5]->(first:Procedure)
WHERE NOT (first)-[:DEPENDS_ON]->(:Procedure)
  AND all(n IN nodes(p) WHERE n.state <> 'retracted')
RETURN [n IN nodes(p) | n.id] AS ids, [n IN nodes(p) | coalesce(n.runnability, 'unknown')] AS runnability,
       [n IN nodes(p) | coalesce(n.timeHours, 0)] AS hours, [n IN nodes(p) | coalesce(n.costUsd, 0)] AS cost, length(p) AS hops
LIMIT 50
```
`src/lib/adam/queries-experiments.ts` (`PROCEDURE_CHAINS`), used by `src/lib/adam/hypothesis-query.ts` from the Experiments tab, the Experiment Designer and the `hypothesis_query` MCP tool.

### `algo.SPpaths` — the cheapest chain when the graph is deep

When a chain goes past five hops, the unbounded walk is replaced by weighted shortest paths. Every
`DEPENDS_ON` edge carries a `weight` written by the Methods Hunter (hours and dollars of the
prerequisite), so `pathWeight` *is* the cost to run the chain.

```cypher
MATCH (last:Procedure {id: $lastId}), (first:Procedure {id: $firstId})
CALL algo.SPpaths({sourceNode: last, targetNode: first, relTypes: ['DEPENDS_ON'], relDirection: 'outgoing',
                   weightProp: 'weight', maxLen: 8, pathCount: 3}) YIELD path, pathWeight
RETURN [n IN nodes(path) | n.id] AS ids, pathWeight
```
`src/lib/adam/queries-experiments.ts` (`SP_CHAINS`).

### `algo.pageRank` and `allShortestPaths` — the research graph

PageRank over `CITES` ranks a library's papers for the Research Graph page and the Librarian's
suggestions; `allShortestPaths` over up to five citation hops explains *how* two papers are
connected when a user asks (the Citation path tool in Neura AI chat).

```cypher
CALL algo.pageRank('Paper', 'CITES') YIELD node, score WHERE node.inLibrary = true RETURN node.paperId AS paperId, score
```
```cypher
MATCH (a:Paper {paperId: $a}), (b:Paper {paperId: $b}) WITH a, b
MATCH p = allShortestPaths((a)-[:CITES*..5]-(b))
RETURN [n IN nodes(p) | n.paperId] AS ids, [n IN nodes(p) | n.title] AS titles LIMIT 1
```
`src/lib/graph/queries.ts` (`TEAM_PAGERANK`, `CITATION_PATH`).

---

## 2. Vector search inside the graph

Ten labels carry a 1024-dimensional cosine vector index (`Paper`, `Chunk`, `Memory`, `ChatMessage`,
`Claim`, `Method`, `Assumption`, `Procedure`, `Result`, `Hypothesis`). Every semantic lookup is a
`db.idx.vector.queryNodes` call followed by ordinary pattern matching on the hits, so similarity and
structure are answered in one query.

| Where | What the query does | Template |
|---|---|---|
| Extractor, entity resolution | A newly extracted method or assumption is merged into an existing node when its nearest neighbour in the project is within a distance threshold (exact `nameKey` match first, vector second, create third). Every merge is logged with its distance and can be undone from the queue. | `NEAREST_METHODS`, `NEAREST_ASSUMPTIONS` in `queries-extract.ts` |
| Verifier, cross-paper contradictions | For each verified claim, the nearest verified claims from *other* papers are judged for contradiction; a hit becomes a `CONTRADICTS` edge with the reason and quote. | `NEAREST_FOREIGN_CLAIMS` in `queries-extract.ts` |
| Graph Analyst, load-bearing assumptions | The nearest project claims to an assumption, to show the Analyst what actually rests on it. | `NEAREST_PROJECT_CLAIMS` in `queries-analyst.ts` |
| Hypothesis as a query | The predicted result's nearest `Result` nodes (where the chains start) and nearest `Claim`s per sub-claim (evidence for and against); nearest `Method`s for rival chains. | `NEAREST_RESULTS`, `NEAREST_VERIFIED_CLAIMS`, `NEAREST_METHODS` in `queries-experiments.ts` |
| Hypothesis Writer | Evidence for a brief's statement. | `queries-hypotheses.ts:222` |
| Auto-review | Corroboration: a low-confidence item is judged against the nearest verified claims before a decision is proposed. | `queries-review.ts:172` |
| Cite Scout, Citation Checker, chat | Passage search over `Chunk`, paper search over `Paper`, episodic memory over `Memory` and `ChatMessage`. | `queries.ts:349, 406, 558, 574, 723` |

```cypher
CALL db.idx.vector.queryNodes('Claim', 'embedding', $k, vecf32($v)) YIELD node, score
WHERE node.projectId = $projectId AND node.paperId <> $paperId AND node.state IN ['agent_verified', 'human_approved']
MATCH (node)-[:EXTRACTED_FROM]->(p:Paper)
RETURN node.id AS id, node.text AS text, p.title AS title, score ORDER BY score ASC
```

Full-text indexes on `Paper(title, abstract)`, `Chunk(text)`, `Claim(text)` and `Procedure(name)` back
the keyword side of paper search (`db.idx.fulltext.queryNodes`) and the Knowledge tab filter.

---

## 3. The graph as the agents' working memory and job queue

Adam's orchestration state is graph data, not a separate queue. A worker claims a job with one
atomic statement: match, order, limit, set. Two workers (a laptop and a cloud container during the
hackathon) share the same graph safely; a worker that dies is detected by its missing heartbeat and
its job requeued; only the worker holding a job may finish it.

```cypher
MATCH (j:AdamJob {status: 'queued'})
WHERE j.runAfter <= $now AND NOT j.projectId IN $busyProjects
OPTIONAL MATCH (p:AdamProject {id: j.projectId})
WITH j, p WHERE j.kind = 'noop' OR p IS NULL OR coalesce(p.status, 'idle') <> 'paused'
WITH j ORDER BY j.priority ASC, j.createdAt ASC LIMIT 1
SET j.status = 'running', j.lockedBy = $worker, j.lockedAt = $now, j.heartbeatAt = $now, j.attempts = coalesce(j.attempts, 0) + 1
RETURN j
```
```cypher
MATCH (j:AdamJob {status: 'running'})
WHERE coalesce(j.heartbeatAt, j.lockedAt, 0) < $now - $staleMs
SET j.status = 'queued', j.lockedBy = null, j.error = 'requeued: worker lost' RETURN count(j) AS n
```
`src/lib/adam/queries.ts` (`CLAIM_JOB`, `REQUEUE_STALE_JOBS`, `COMPLETE_JOB`, `FAIL_JOB`, `HEARTBEAT_JOB`). Every enqueue is a `MERGE` on a deterministic `dedupeKey`, which is what makes the orchestrator's tick idempotent: resuming a project is just ticking again.

The orchestrator's phase transitions read the graph too: "extract ends when every core paper has a
verified card", "attack ends after two rounds with no new open attack", "sweep stops for a cluster
whose last ten papers added fewer than two new nodes" are all count queries over `TRIAGED` edges and
node states (`NODE_COUNTS`, `JOB_COUNTS`, `PAPER_NODE_SERIES`, `CLUSTER_STATS`).

---

## 4. Provenance: every answer traced to a page

Every extracted node stores `paperId`, `chunkId`, `page`, `section` and a verbatim `quote`. The
Verifier's first check is a substring match of that quote against the chunk; the human queue shows
the passage with the quote highlighted; the node sheet, the write-up and the MCP tools all resolve
the same chain `Claim → Chunk → Paper`.

```cypher
MATCH (n {id: $id}) WHERE n.projectId = $projectId
OPTIONAL MATCH (p:Paper) WHERE p.paperId = n.paperId
OPTIONAL MATCH (ch:Chunk) WHERE ch.id = n.chunkId
RETURN labels(n)[0] AS label, n.text AS text, n.state AS state, n.quote AS quote, n.page AS page, n.section AS section,
       n.decidedBy AS decidedBy, n.priorText AS priorText, p.title AS paperTitle, p.year AS year, ch.text AS chunkText
```
`src/lib/adam/queries-review.ts` (`NODE_DETAIL`).

The exception queue is a property of node state, never a separate list, so it cannot fall out of
sync: one `UNION ALL` over the six reviewable labels with the same `WHERE` the status bar counts.

```cypher
MATCH (n:Claim {projectId: $projectId})
WHERE (n.state IN ['conflict', 'low_confidence'] OR coalesce(n.loadBearing, false) = true) AND coalesce(n.queueDecided, false) = false
OPTIONAL MATCH (p:Paper) WHERE p.paperId = n.paperId
RETURN 'Claim' AS label, n.id AS id, n.text AS text, n.state AS state, n.quote AS quote, n.chunkId AS chunkId, p.title AS paperTitle …
UNION ALL
MATCH (n:Evidence {projectId: $projectId}) WHERE … RETURN 'Evidence' AS label, …
UNION ALL …
```
`src/lib/adam/queries-review.ts` (`QUEUE_ITEMS`, `QUEUE_OPEN_COUNT`).

A person's decision is one write that outranks every agent: state, reason, who, when, the prior
text kept, and the node's proposal edges accepted or rejected in the same transaction
(`DECIDE_NODE`, `DECIDE_NODE_EDGES`, `RETRACT_CONFLICT_PARTNER`). Nothing is deleted; retracted nodes
stay and every reasoning query filters `state <> 'retracted'`.

---

## 5. Multi-hop reasoning the agents run

| Agent / feature | Question asked of the graph | Shape |
|---|---|---|
| Searcher, coverage checker | For each core paper, are its ten most-cited references in the project? Below 60 % triggers a second citation round. | `TRIAGED → Paper → CITES → Paper`, grouped and counted (`CORE_REFERENCE_COVERAGE`) |
| Searcher, adjacent ring | Papers sharing two or more concepts with a core paper but with no citation link either way. | `Paper → ABOUT → Concept ← ABOUT ← Paper` with `NOT (p)-[:CITES]-(core)` (`CONCEPT_OVERLAP_CANDIDATES`) |
| Graph Analyst, conflicts | Contradicting claim pairs with each side's conditions, assumptions and methods, so the Analyst can name the unmeasured condition that would explain the disagreement. | `Claim -CONTRADICTS-> Claim`, each with `DEPENDS_ON → Assumption` and `USES → Method` collected (`CONFLICT_PAIRS`) |
| Graph Analyst, load-bearing | Assumptions with many `DEPENDS_ON` dependents and no `SUPPORTS` evidence. | pattern comprehension over `(c:Claim)-[:DEPENDS_ON]->(a)` (`LOAD_BEARING_ASSUMPTIONS`) |
| Falsifier | Rival explanations: other chains reaching a result within cosine 0.1 of the brief's prediction that do not pass through the brief's methods. | vector hit (`NEAREST_RESULTS`) → `PRODUCES` → `DEPENDS_ON*` (`PROCEDURE_CHAINS`), chains that pass through the brief's own methods (`METHODS_BY_KEYS`) filtered out in `hypothesis-query.ts` |
| Hypothesis map | One brief and everything one hop out: evidence claims and their papers and topic, assumptions, methods, contradicting claims, the attacks and what they cite, the plan's procedures, each with its review state. | `(h)-[r]->(n)` fan-out plus `Claim → EXTRACTED_FROM → Paper ← TRIAGED` (`HYPOTHESIS_NEIGHBOURS`, `CLAIMS_PAPERS_CLUSTERS`, `CLAIMS_CONTEXT`) |
| Living briefs | When a new paper's verified claim lands near a brief's evidence, flag the brief whose kill criteria may be affected. | vector hit → `EVIDENCE_FOR/AGAINST` ← `Hypothesis` (`FLAG_BRIEFS_EVIDENCE_CHANGED`) |
| Citation Checker (editor) | Does a cited paper actually support the sentence? Match the sentence against that paper's verified claims and their pages. | `Paper ← EXTRACTED_FROM ← Claim` per cited paper (`CLAIMS_OF_PAPERS`) |
| Neura AI chat, MCP tools | `paper_claims`, `methods_dossier`, `open_questions`, `hypothesis_query`, `adam_projects`: the same templates exposed as tools, so an external agent gets sourced answers rather than text. | `src/app/api/mcp/route.ts` |

---

## 6. The loop closes in the graph

The researcher's own experiment goes back in as data. Each plan step's observation is an
`Observation` node linked to the plan; the verdict rewrites the hypothesis and creates a `Result`
with the person as its source, so the next pass's Scoper, the Writer and the write-up cite it like any
published result.

```cypher
MATCH (h:Hypothesis {id: $hypothesisId}) WHERE h.projectId = $projectId
SET h.status = $status, h.stateReason = 'observed', h.verdict = $verdict, h.verdictNote = $note, h.verdictBy = $userId, h.verdictAt = $at
MERGE (r:Result {id: 'result:verdict:' + h.id})
SET r.projectId = $projectId, r.text = $resultText, r.state = 'human_approved', r.source = 'observation', r.decidedBy = $userId
MERGE (h)-[:OBSERVED {at: $at}]->(r)
RETURN h.id AS id, h.status AS status
```
`src/lib/adam/queries-experiments.ts` (`UPSERT_OBSERVATION`, `RECORD_VERDICT`).

---

## 7. Indexes

```cypher
CREATE INDEX FOR (n:Paper) ON (n.paperId)            -- and id / projectId / nameKey / status / dedupeKey on every Adam label
CREATE FULLTEXT INDEX FOR (p:Paper) ON (p.title, p.abstract)
CREATE FULLTEXT INDEX FOR (c:Chunk) ON (c.text)
CREATE FULLTEXT INDEX FOR (c:Claim) ON (c.text)
CREATE FULLTEXT INDEX FOR (p:Procedure) ON (p.name)
CREATE VECTOR INDEX FOR (c:Claim) ON (c.embedding) OPTIONS {dimension: 1024, similarityFunction: 'cosine'}   -- ×10 labels
```
`src/lib/graph/schema.ts`. Schema is versioned per graph (`SchemaMeta`); migrations are guarded
Cypher (the draft-sentence label was renamed `Claim → Sentence` during the hackathon so the spec's
`Claim` could keep its name).

---

## 8. FalkorDB behaviour we built around

Things learned on the way, recorded because they shaped the queries above: a bound node's property
cannot be used inside a later `MATCH`'s inline map (use `WHERE`); `null` inside a returned list fails
the query (every list element is `coalesce`d); `DELETE` and `MERGE` go in separate statements;
`shortestPath` only in `WITH`/`RETURN`; `EXISTS { … }` subqueries are not available (two `MATCH`es
instead); the module's read-query `TIMEOUT` defaults to 1 s, which community detection over a
5,000-paper graph exceeds on a small host, so every Adam query passes its own `TIMEOUT`.
