# Neura Query × FalkorDB: Collaborative Research Graph with Specialist Agents

> Plan for the WeMakeDevs × FalkorDB Hackathon (Oct 15–18 2026, submissions close 11:59 PM IST, Oct 18).
> Primary track: **Track 01, Agents That Act on Connected Data** (Track 02 memory features as depth).

## Progress

| Phase | Status |
|---|---|
| 1. Graph foundation and Librarian | ✅ Done (OpenAlex-based Librarian, hooks, sync route, seed: 518 papers / 2,921 cites) |
| 2. Relevance layer (JEV) and editor plumbing | ✅ Done (browser checks pending sign-in) |
| 3. Cite Scout (MVP) | ⬜ |
| 4. Citation Checker / Critic (MVP) | ⬜ |
| 5. Depth agents (Historian, Next-Step, Ghost Writer, Router) | ⬜ |
| 6. Research Graph page | ⬜ |
| 7. Stretch (Synthesis, Scout Watcher, MCP) | ⬜ |
| 8. Submission (README, video, blog) | ⬜ |

**Platform upgrade (branch `chore/next-16`):**
- Next 14.2.15 → **16.4.1** (Turbopack) and React 18 → **19**. next-auth beta.25 → beta.32. ESLint 8 → 9 with flat config (`eslint.config.mjs`).
- All other dependencies were bumped to the latest version within their current major. TipTap 3, Hocuspocus 4 and AI SDK 5+ were left alone deliberately.
- `prosemirror-view` is pinned to `1.37.0` through `pnpm.overrides`, because `novel@0.2.13` imports the removed `__serializeForClipboard`. Remove the pin only after upgrading or replacing `novel`.
- Async `params` and `cookies()` were migrated with the codemod plus manual fixes.

Unrelated fixes made along the way:
- `[fileId]/page.tsx` redirects on a missing file instead of crashing.
- `get-summary.ts` no longer 500s the dashboard when Semantic Scholar or OpenAI fails.
- `use-research-summary.tsx` doesn't cache errors.

## Verified FalkorDB facts (local `falkorHack` container, client `falkordb@6.8.0`)

- **Connection:** host port **6380** (`FALKORDB_URL=falkor://localhost:6380`). The browser UI is on **localhost:3001**.
- **Results:** `graph.query(cypher, { params })` returns `{ data: [{ col: value }], metadata }`. `roQuery` is available.
- **Index syntax:**
  - Range: `CREATE INDEX FOR (n:L) ON (n.p)`
  - Full-text: `CREATE FULLTEXT INDEX FOR (p:Paper) ON (p.title, p.abstract)`. The old `db.idx.fulltext.createNodeIndex` with several properties is rejected.
  - Vector: `CREATE VECTOR INDEX ... OPTIONS {dimension, similarityFunction}`
  - Query full-text with `CALL db.idx.fulltext.queryNodes('Paper', 'term') YIELD node, score`.
- **Algorithms** (all confirmed):
  - `CALL algo.pageRank('Label','REL') YIELD node, score`
  - `CALL algo.betweenness({nodeLabels:[...], relationshipTypes:[...]}) YIELD node, score`
  - `CALL algo.labelPropagation({nodeLabels, relationshipTypes}) YIELD node, communityId` (CDLP)
  - `CALL algo.WCC({nodeLabels, relationshipTypes}) YIELD node, componentId`
  - `CALL algo.SPpaths({sourceNode, targetNode, relTypes, maxLen}) YIELD path, pathWeight`
  - Also available: `algo.BFS`, `algo.SSpaths`, `algo.HarmonicCentrality`, `algo.MSF`, `algo.maxFlow`
- **Quirk:** `shortestPath()` is only allowed in `WITH` or `RETURN`, not in `MATCH`. Use `algo.SPpaths` for paths.
- **Scripts:** `package.json` has no `"type": "module"`, so scripts that import `src/` must be `.ts` (CommonJS through tsx) and wrap their code in an async `main()`. Run them with `node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/x.ts`.
- **Isolation:** one graph per workspace, `ws:{workspaceId}`. The container also holds an unrelated `family` graph, which we leave alone.

## Context

**The goal:** make FalkorDB the core of neura-query. Inside the collaborative editor, specialist agents, each limited to one task, help a research team at every step:
- Suggest citations from all collaborators' imported papers.
- Check claims.
- Propose next steps.
- Offer GraphRAG-grounded autosuggestions.

The researcher stays the author. Agents propose, and users accept or reject.

**What exists today:**
- **Postgres via Drizzle:** users, auth, workspaces, folders, files and papers. `papers` is flat: it has a `userId`, but no authors, citations or embeddings.
- **Editor:** `src/components/novel/Editore.tsx` → `headless/Editore.tsx` (TipTap, Yjs and Hocuspocus).
  - The AI is in the bubble menu and calls `/api/novel/generate`, which runs on the edge with no auth and no paper context.
  - Paper search queries only the global Semantic Scholar index.
  - Citations are link marks.
  - There's no autocomplete.
- **Broken plumbing to fix:**
  - The slash, `AIHighlight` and `Placeholder` extensions are never loaded.
  - Awareness carries only the email.
  - `UPDATE_COLLABORATION_USERS` has no reducer case.
- **JEV (TypeSafe System One):**
  - API: `POST https://api.typesafe.ai/v1/systemone`. SDK: `@typesafe-ai/sdk` (`client.systemOne`). Env var: `TYPESAFE_API_KEY`.
  - Typed questions: `choice`, `score` (a rubric of 2–10 levels) and `noul` (0–1).
  - About 70–500 ms per call. It doesn't generate text, so it's good for real-time relevance, grounding and routing.

## Architecture

```
Editor (TipTap + Yjs)  ──►  Agent API routes (Node runtime)  ──►  FalkorDB  ws:{workspaceId}
   │  gutter cards,            │  one route per agent,            (one graph per workspace,
   │  ghost text, check panel  │  fixed tool allowlist            shared by every agent)
   │                           ├─► JEV  (fast typed relevance / grounding / routing)
   └─ Graph page               └─► OpenAI (embeddings, generation where text is needed)
Postgres: auth, users, workspaces, files (TipTap JSON), papers rows (library membership + PDF URL)
```

### Graph model

**Nodes**
- `Paper {s2Id, doi, title, year, abstract, venue, citationCount, inLibrary, embedding vecf32[1536]}`
- `Author {s2Id, name}`
- `Concept {name}`
- `Venue {name}`
- `User {id, name, email}`
- `Document {fileId, title}`
- `Claim {id, text, fileId, hash}`
- `Hypothesis {id, text, status, validFrom, validTo}`
- `Finding {id, text, at}`
- `Idea {id, text, status}`
- `AgentRun {id, agent, at, input, ms}`

**Edges**
- `(Paper)-[:CITES]->(Paper)`
- `(Author)-[:WROTE]->(Paper)`
- `(Paper)-[:ABOUT]->(Concept)`
- `(Paper)-[:PUBLISHED_IN]->(Venue)`
- `(User)-[:IMPORTED {at, source}]->(Paper)`
- `(User)-[:EDITS]->(Document)`
- `(Document)-[:CONTAINS]->(Claim)`
- `(Claim)-[:CITES]->(Paper)`
- `(Claim)-[:SUPPORTED_BY {score, confidence, status}]->(Paper)`
- `(Hypothesis)-[:SUPERSEDED_BY]->(Hypothesis)`
- `(Hypothesis)-[:DROPPED_BECAUSE]->(Paper)`
- `(Idea)-[:GROUNDED_IN]->(Paper|Concept)`
- `(AgentRun)-[:PROPOSED]->(any)`

**Design rules**
1. **Provenance.** Every agent output stores the graph path and source papers behind it, and the UI always shows them.
2. **Proposals, not facts.** Every agent write gets `status:'suggested'` and `by:'agent:<name>'`. Only a user's accept makes it `accepted`. Queries that ground answers read only accepted, user-created or ingested data.

**Indexes** (`src/lib/graph/schema.ts`, done):
- Range indexes on the key IDs
- A full-text index on `Paper.title` and `Paper.abstract`
- A vector index on `Paper.embedding` (cosine, 1536 dimensions)

## Specialist agents (each limited to one task)

Each agent is a module in `src/lib/agents/<name>.ts` with:
- A fixed tool allowlist of parameterized Cypher from `src/lib/graph/queries.ts`. There's no text-to-Cypher.
- Its own route.
- An `AgentRun` trace.

A JEV `choice` router sends free-text chat requests to the right agent.

| # | Agent | Its one job | JEV use | Phase |
|---|---|---|---|---|
| 0 | **Librarian** (pipeline) | Turn imports into the graph: S2 hydration, refs and cites, authors, concepts, embeddings, `IMPORTED` | – | 1 |
| 1 | **Cite Scout** | Suggest citations for the current paragraph from all collaborators' libraries, then from frontier papers | `noul` needs-citation gate; `score` relevance per candidate | 3 |
| 2 | **Citation Checker / Critic** | Check every claim: is it cited, is it supported, does a path reach the team's sources? | `score` support rubric; `noul` uncited claim | 4 |
| 3 | **Next-Step / Ideas** | Propose 3 grounded next steps (gaps, bridge papers, CDLP, hypotheses) | `score` novelty and feasibility | 5 |
| 4 | **Ghost Writer** | Inline next-words completion grounded in the graph (Tab to accept) | `noul` worth-suggesting gate | 5 |
| 5 | **Historian** | Time-aware hypotheses and findings, so the team doesn't revisit dead ends | `choice` hypothesis / finding / question | 5 |
| 6 | **Synthesis** | Literature review grouped by CDLP community | – | 7 |
| 7 | **Scout Watcher** | New papers that cite 2 or more library papers | `noul` challenges a claim | 7 |

**Collaborator relevance:** A has 10 papers, B has 6 and C has 7, all connected through `IMPORTED`. Cite Scout ranks the union and labels each suggestion with its owner and path. For example: "From B's library. Cited by A's *Paper X*. Relevance 0.87."

**Memory:** we build it natively in TypeScript (`validFrom`/`validTo` and `SUPERSEDED_BY`) instead of Graphiti, which is Python and would need a sidecar.

## Implementation phases

Phases 1–4 are the **MVP**. Phases 5–7 add depth and can be cut. Always leave time for Phase 8.

### Phase 1: Graph foundation and the Librarian

**Goal:** every paper the team imports lives in FalkorDB as a connected graph.

1. ✅ **Infrastructure:**
   - A `falkordb` service in `docker-compose.yaml`. Locally we use the `falkorHack` container on port 6380.
   - `FALKORDB_URL`, `TYPESAFE_API_KEY` and `SEMANTIC_SCHOLAR_API_KEY` in `src/env.ts` and `.env.example`.
   - `falkordb` and `@typesafe-ai/sdk` installed.
2. ✅ **`src/lib/graph/`:**
   - `client.ts`: a globalThis singleton plus `getWorkspaceGraph`, with an `error` listener so a FalkorDB restart can't crash Node.
   - `schema.ts`: `ensureSchema`.
   - `queries.ts`: every Cypher template.
   - `openalex.ts`: the OpenAlex client.
   - `embeddings.ts`: OpenAI `text-embedding-3-small`.
3. ✅ **The Librarian, `src/lib/graph/ingest.ts` (`ingestLibrary`):**
   - **The source is OpenAlex, not Semantic Scholar** (decided Oct 15). Anonymous S2 returned 429 for about 2 minutes per call. OpenAlex is keyless, at about 0.5–1.4 s per call. S2 IDs remain an optional `Paper.s2Id` property for later.
   - Resolves papers by DOI, then by exact-title match. Takes up to 40 references plus the 15 most-cited citers per library paper. Adds CITES edges between every pair of known papers. Uses `UNWIND` batch writes and embeddings.
   - **Data-quality guards** for problems we found in OpenAlex:
     - Wrong titles: the user's own title and abstract win for library papers.
     - Preprint and published versions as separate works: collapsed onto one node by `titleKey` (normalized title).
     - Recent arXiv records with no references: borrowed from other versions of the same paper. This often finds nothing yet: 5 of Bea's 6 papers still have 0 outgoing references.
     - Hijacked records: flagged `suspect` when the DOI names a later year, or when the paper is cited by papers older than itself. **Every ranking and suggestion query must filter `suspect = false`.**
4. ✅ **Hooks:**
   - `scheduleLibraryIngest()` in `src/lib/graph/hooks.ts` uses Next 16 `after()`, so imports return immediately.
   - It's called from `addPaper` and at the end of `importPapers`.
   - `POST /api/graph/sync {workspaceId}` rebuilds from the `papers` rows. It isn't tested over HTTP yet because it needs a session.
5. ✅ **`scripts/seed-graph.ts <workspaceId> [--reset]`:**
   - Writes to the graph only, with no Postgres rows.
   - A = the workspace owner (10 papers), B = "Bea (demo)" (6, GraphRAG), C = "Chen (demo)" (7, agents and RAG surveys).
   - The draft document seed moves to Phase 2 (it needs `sync-document.ts`).
   - **Result on "dialgen":** 518 papers (23 library), 2,921 CITES edges, 2,142 authors, 1,329 concepts, 7 suspect records. Takes about 35 s.

**Exit check:** ✅
- `CALL db.indexes()` lists every index, including VECTOR and FULLTEXT on Paper.
- Vector search, full-text search, PageRank and SPpaths all work on real data.
- Collaborator overlap: you and Chen share 17 references.
- Bea's library reaches yours in up to 3 hops, e.g. *GraphRAG Survey → KAPING → RAG*.

> ⚠️ **FalkorDB engine bug found (Oct 15).** The server **panicked and exited** (`reply_compact: unwrap on None`, `src/reply.rs:655`) on a read query that returned `collect(q.year)[0..12]`, a collected list that contained nulls.
> - Avoid returning collected lists that may hold nulls. Filter first: `collect(x) WHERE x IS NOT NULL`, or `[y IN list WHERE y IS NOT NULL]`.
> - Worth a minimal repro and a GitHub issue for the writeup.

### Phase 2: Relevance layer (JEV) and editor plumbing

6. ✅ **`src/lib/jev.ts`:**
   - `needsCitation` (noul), `scoreRelevance` (one `score` question per candidate, all in **one request**), `scoreSupport` (contradicts / unrelated / partial / supports), and `classify` (choice, for the router).
   - Every helper falls back to embeddings or gpt-4o-mini `generateObject`, and reports `source: "jev" | "fallback"` plus `ms`.
   - `scripts/test-jev.ts [--fallback]` results:

     | Test | JEV (~0.3–0.5 s) | Fallback (~1–2 s) |
     |---|---|---|
     | Needs citation: factual claim / filler | 0.78 / 0.05 | 0.85 / 0.10 |
     | Relevance: GraphRAG / RAG / CoT | 1.00 / 0.44 / 0.11 | 1.00 / 0.46 / 0.22 |
     | "Graph RAG performs worse than naive RAG" vs the GraphRAG paper | **contradicts** (conf 1.0) | **supports** ❌ |
     | Routing | cite_scout | cite_scout |

     JEV caught a contradiction the LLM missed. **Use this in the demo.**
7. ✅ **Editor fixes:**
   - The slash menu is registered, and Tab selects in it (done earlier).
   - Awareness carries `{id, name, color}`, with a stable colour per user.
   - Presence is deduped by user ID, and the `UPDATE_COLLABORATION_USERS` reducer case stores `connectedUsers: {id, name}[]`.
   - `/api/novel/generate` now requires `auth()` and runs on Node, because the edge runtime can't load the Drizzle session adapter.
   - Not done: `AIHighlight` and `Placeholder`. They aren't needed by the agents; add them if there's time.
8. ✅ **`src/lib/graph/sync-document.ts`:**
   - **Claims are sentences, keyed by `fileId:sha1(text)`.** An unchanged sentence keeps its ID, and any verdicts attached to it, across saves. Sentences that disappear are deleted.
   - **Citation links resolve to Paper nodes** through DOI, arXiv ID or S2 ID. Author-inserted citations are `status: 'accepted', by: 'user'`.
   - **Library papers keep the arXiv ID** from the user's DOI even when OpenAlex resolves them to the published version, so arxiv.org links resolve.
   - **Hooked into `updateFile`** through `scheduleDocumentSync`, which uses `after()` and reads the session before scheduling.
9. ✅ **`src/lib/agents/base.ts`:**
   - `startRun()` returns an `AgentRunRecorder`. Its `.step()` times each tool call into the trace, and `.finish()` writes an `AgentRun` node.
   - The common `AgentResult` has `{runId, agent, outcome, items, trace, ms}` and `ProvenancePath`.
   - `proposalProps()` and `decideProposal()`. Rejections are kept, not deleted, so agents don't re-suggest them.
   - Verified: a run is recorded, and a suggested edge moves to accepted with `decidedBy`.

**Seed draft** (`scripts/seed-draft.ts <workspaceId> [--remove]`): this writes to Postgres, creating the "Demo" folder and the "GraphRAG literature review (draft)" file, and syncs both to the graph. It has 6 claims, chosen so that:
- One cited claim is supported (RAG).
- One cited claim is **contradicted** by its source (GraphRAG).
- One claim cites an unrelated paper (CoT, when it should be *Lost in the Middle*).
- Two claims are uncited, with answers in your library (DPR) and in Bea's (HippoRAG).
- One sentence isn't a claim.

**Exit check:**
- ✅ JEV and the fallback both score sensibly.
- ✅ The draft creates `Claim` nodes with resolved citations.
- ⬜ Two browser sessions show both user IDs.
- ⬜ The slash menu works in the browser.
- The last two need someone signed in to the app.

> ⚠️ **Second FalkorDB engine quirk (Oct 15):** `MATCH … DELETE r WITH count(*) AS x UNWIND $rows … MERGE …` creates **nothing**, even though each half works on its own and `count(*)` returns a row. Keep deletes and inserts in separate statements (`DELETE_CLAIM_CITES` and then `INSERT_CLAIM_CITES`).

### Phase 3: Cite Scout (MVP agent 1)

10. **Agent and route:** `cite-scout.ts` plus `POST /api/agents/cite-scout`.
    - Pipeline: the JEV gate, then graph retrieval (vector + full-text + 1–2 hop CITES + co-citation, collaborators first), then JEV relevance, then the result with owner, path and reason.
11. **UI:**
    - `extensions/cite-scout.tsx`: a gutter card about 1.5 s after typing stops.
    - "Cite" uses the existing `insertCitation` and writes an accepted edge.
12. **Team-library search:** a "Team library" tab in `SemanticScholarSelector`.

**Exit check:** A's claim gets a suggestion for B's paper with a path, and accepting it creates the edge.

### Phase 4: Citation Checker / Critic (MVP agent 2)

13. **Agent and route:** `citation-checker.ts` plus `POST /api/agents/citation-check`.
    - A verdict for each claim: `supported | weak | contradicted | uncited | unknown-source`, with a JEV score and the path.
14. **UI:** a "Check citations" button and side panel in the `Editore.tsx` header, optionally run before PDF export.

**Exit check:** the seed draft's unsupported and uncited claims are flagged with their paths. **The MVP is complete here.**

### Phase 5: Depth agents

15. **Historian:**
    - `/api/agents/memory` provides `remember`, `recall` and `timeline`.
    - A `/hypothesis` slash command.
    - Dropped hypotheses carry `validTo` and a `DROPPED_BECAUSE` edge.
16. **Next-Step:** `POST /api/agents/next-steps` returns 3 `Idea` proposals, with an accept and reject panel.
17. **Ghost Writer:** an `extensions/ghost-text.tsx` decoration plus `POST /api/agents/ghost`, with gpt-4o-mini limited to about 20 words and gated by JEV.
18. **Router:**
    - A JEV `choice` router for the Neura AI chat.
    - `research-message-block.tsx` renders every tool invocation.

**Exit check:**
- Dropped hypotheses are no longer suggested.
- Ghost text works with Tab.
- The router routes correctly.

### Phase 6: Research Graph page

19. **`dashboard/[workspaceId]/graph/page.tsx`:** built with `react-force-graph-2d` (`ssr:false`).
    - Colour by node type or by owner.
    - Suggested items drawn dashed.
    - An `AgentRun` trace with path highlighting.
20. **The data route:** `GET /api/graph/[workspaceId]`, capped at about 500 nodes.
21. **Navigation:** a sidebar link plus a "Build graph" button.

### Phase 7: Stretch (in order)

1. Synthesis agent
2. Scout Watcher
3. An MCP server at `src/app/api/mcp/route.ts` (read-only graph tools)

### Phase 8: Submission

22. **README:** architecture, graph model, agents, JEV, setup, and what was pre-existing versus built during the hackathon.
23. **Demo video (about 4 min):**
    1. Collaborator libraries in the graph.
    2. Cite Scout.
    3. The Checker.
    4. Ghost text.
    5. Next steps.
    6. A dropped hypothesis.
    7. The graph trace.
24. **Blog post** (optional side prize).

## Risks and mitigations

- **Semantic Scholar rate limits:** use the batch endpoint and caching, pre-seed the demo, and get an API key.
- **JEV is in early access:** keep the fallback in `src/lib/jev.ts`.
- **Fragile Yjs setup:** `Editore.tsx` recreates the Y.Doc on every render. Don't refactor it. Add extensions only in `headless/Editore.tsx`, and test with 2 sessions early.
- **Ghost text noise:** gate it with JEV, and only show it after a pause at the end of a paragraph.
- **OpenAI billing must be active**, because embeddings and generation depend on it.
- **Scope:** if time runs short, cut Phase 7 first, then Phase 5 (Ghost Writer before the Historian).

## Verification (end to end)

1. FalkorDB Browser at localhost:3001: run `GRAPH.LIST` and `CALL db.indexes()`.
2. Run the seed script. `MATCH (u:User)-[:IMPORTED]->(p) RETURN u.name, count(p)` should return A=10, B=6 and C=7.
3. `scripts/test-agents.ts`:
   - Cite Scout returns owner-labelled suggestions with paths.
   - The Checker returns verdicts.
   - The fallback works without `TYPESAFE_API_KEY`.
4. `pnpm dev:all` with two browser profiles on one file: Cite Scout, Cite, Check citations and ghost text.
5. Write a `/hypothesis`, drop it, and confirm it's no longer suggested.
6. The graph page shows owner colours, dashed suggestions and the Cypher trace.
7. `pnpm build` passes, with the agent routes on the Node runtime.
