# Neura Query × FalkorDB: Collaborative Research Graph with Specialist Agents

> Plan for the WeMakeDevs × FalkorDB Hackathon (Oct 15–18 2026, submissions close 11:59 PM IST, Oct 18).
> Primary track: **Track 01, Agents That Act on Connected Data** (Track 02 memory features as depth).

## Progress

| Phase | Status |
|---|---|
| 1. Graph foundation and Librarian | ✅ Done (OpenAlex-based Librarian, hooks, sync route, seed: 518 papers / 2,921 cites) |
| 2. Relevance layer (JEV) and editor plumbing | ✅ Done (slash menu, Tab verified in browser; 2-user presence check pending) |
| 2.5 Research library (search, import, full-text index, index health) | ✅ Done (33 team papers, 32 with full text, 1,397 passages) |
| 3. Cite Scout (MVP) | ✅ Done (in-editor panel + /search Find papers; HippoRAG from Bea's library at 99% with a citation path) |
| 4. Citation Checker / Critic (MVP) | ✅ Done (Check citations panel: contradicted / not supported / needs citation / supported, judged by JEV on full-text passages) |
| 5. Depth agents (Historian, Next-Step, Ghost Writer, Router) | ✅ Done (Notebook, /hypothesis, ghost text with Tab, JEV router: 6/6 intents) |
| 6. Research Graph page | ✅ Done (@falkordb/canvas: team map, paper focus, agent provenance tree + trace panel) |
| 7. Stretch (Synthesis, Scout Watcher, MCP) | ✅ Done (CDLP-grouped review drafts, new-paper watcher with vector-fit + JEV contradiction flag, read-only MCP server) |
| 8. Submission (README, video, blog) | 🟡 Docs done (README, demo script, blog draft); video, blog publish and submission pending |

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
- ✅ The slash menu works in the browser (verified in Phase 2.5).
- The two-session check needs two signed-in browser profiles.

> ⚠️ **Second FalkorDB engine quirk (Oct 15):** `MATCH … DELETE r WITH count(*) AS x UNWIND $rows … MERGE …` creates **nothing**, even though each half works on its own and `count(*)` returns a row. Keep deletes and inserts in separate statements (`DELETE_CLAIM_CITES` and then `INSERT_CLAIM_CITES`).

### Phase 2.5: Research library (search, import, full-text indexing) ✅

Added on Oct 15 at the user's request. The sidebar "Research papers" dialog was dead: "Add Research Paper" was a plain `<div>` with no handler.

- **UI:** `src/components/library/research-library.tsx` is the new sidebar dialog (`researchPaper-main.tsx`). The old `researchPaper-menu.tsx` was removed. It has three tabs:
  - **Library:** every workspace paper with who imported it, its source, year and DOI, plus its graph status:
    - *Indexing* (pulsing dot; the list polls every 3 s while anything is pending)
    - *N links*
    - *full text*
    - *Not matched*
  - **Search papers:** OpenAlex search (debounced 350 ms, a newer query cancels an older one). Pasting a DOI jumps straight to that work. Each result shows authors, venue, citations and an open-access PDF badge, and has an **Add** button that updates the list straight away.
  - **Upload & import:** the shared `UploadPanel`, split out of `upload-research-papers.tsx`, plus the Zotero import.
- **API** (all go through `requireWorkspaceMember`):
  - `GET /api/papers?workspaceId`: the library with graph status.
  - `GET /api/papers/search?workspaceId&q`: search, flagging papers already `inLibrary`.
  - `POST /api/papers/import {workspaceId, openalexIds[]}`: inserts `papers` rows with `source: other` and `externalSource: openalex`. Title is unique per workspace, so a re-import is a no-op. Then it runs `scheduleLibraryIngest`.
- **Full-text indexing** (`src/lib/graph/document-index.ts`):
  - Fetches the PDF and extracts its text with `unpdf` (an external server package). Skips HTML disguised as a PDF, scanned PDFs and files over 25 MB.
  - Splits the text into passages of about 1,200 characters with 150 overlap, at paragraph or sentence breaks, dropping the references section, with at most 60 passages.
  - Embeds them and writes `(:Chunk {text, embedding})-[:CHUNK_OF]->(:Paper)`.
  - New indexes: VECTOR and FULLTEXT on `Chunk`. `SCHEMA_VERSION` makes running servers re-check the schema.
- **`ingestPaperRows` pipeline:**
  1. Read the PDF once.
  2. Fill in a missing DOI and abstract from the PDF text, and save them back to Postgres. This lets uploads match on OpenAlex.
  3. Run the Librarian.
  4. Index the passages onto the paper's canonical node.
- **Data-quality fixes:**
  - **arXiv titles:** OpenAlex showed GraphRAG's DOI as "Advancing Intelligent Personal Assistants…". Search and import now take titles from arXiv's own API, batched (`correctArxivTitles`).
  - **PDF choice:** publisher PDFs often return a 403 to servers (MIT Press did). `pickPdfUrl` prefers arXiv, then repositories, then the publisher.
- **Security:** `/api/upload` now checks workspace membership, not just sign-in. Zotero OAuth `callback` was an open redirect and is now `safeCallback` (same origin only).
- **Verified in the browser:** searched "Lost in the Middle", clicked Add (2.3 s). The Librarian merged it onto the existing seed node, and it shows **57 links · full text** (43 passages from the arXiv PDF). A passage search for "how are community summaries used…" returned the right GraphRAG passage.
- **Live updates everywhere (follow-up):**
  - The dashboard "Research papers" card was a server component and went stale until a refresh. It's now a client component.
  - It and the library dialog share one SWR cache, `useLibrary(workspaceId)` in `src/lib/hooks/use-library.ts`. That cache polls every 3 s only while something is indexing.
  - Every add path calls `refreshLibrary(workspaceId)`: search **Add**, `UploadPanel`, and the Zotero import. Zotero import also gained success and error toasts; it gave no feedback at all before.
  - `MARK_INGESTED` sets `Paper.ingestedAt` after the **whole** pipeline, including full text, so "Indexing" doesn't clear before the passages are in.
  - The search input is focused one frame after its tab opens. Radix moved focus to the tab trigger, so typing went nowhere.
- **Index visibility and recovery (follow-up, Oct 15):**
  - **The graph records its own health.** Each library paper has an `IngestStatus {pgPaperId, state: indexing|done|failed, error, fullText}` in the workspace graph. `ingestPaperRows` writes `indexing`, then `done` (with the full-text outcome) or `failed` (with the error).
  - **Full-text outcomes:** `indexed | no_file | blocked | unreadable | too_large | unsupported`. The UI shows a plain-language reason for each.
  - **DOCX is supported** through `mammoth`. Legacy `.doc` is `unsupported`, so only its title and abstract are indexed.
  - **Re-index:** `POST /api/papers/reindex {workspaceId, paperIds?}` covers one paper or the whole library. It sets `indexing` synchronously, then runs in the background in batches of 10. The dialog has a per-row ↻ button (always visible on failed papers, on hover otherwise) and **Re-index all**.
  - **Stale runs:** an `indexing` status older than 15 minutes shows as failed, with "the server may have restarted".
  - **Library tab summary:** "12/12 in FalkorDB · 11 full text · 1 abstract only", plus a banner when FalkorDB is unreachable.
  - **"In the graph" tab** (`GET /api/papers/graph-index`): live from FalkorDB, every paper any collaborator brought in (including graph-only demo users), with totals for papers, citations, passages, authors and concepts.
  - **CLI:** `scripts/graph-report.ts [workspaceId]` lists, per collaborator, each paper's passages and links, and flags library papers that never reached the graph.
  - **Demo full text:** `scripts/seed-fulltext.ts <ws>` indexes the seeded demo papers from arXiv (21 papers, 793 passages).
  - **Current state of "dialgen":** 33 team papers, 911 papers in the graph, 5,542 citations, **1,397 passages**, 6 draft claims. **32/33 papers have full text.** The only exception is Point Transformer (`no_file`: no open-access PDF exists).
- **Data-loss bug fixed (pre-existing):** the collaborative editor could open a document empty, and the next autosave overwrote the saved content. **This wiped the demo draft.**
  - **Cause:** the Hocuspocus provider can fire `synced` before the editor's `onCreate` subscribes, so the saved content was never seeded into the Yjs doc.
  - **Client fix:** in `headless/Editore.tsx`, seed immediately if `provider.synced` is already true, otherwise on `synced`, plus a 2.5 s fallback when the collaboration server is down.
  - **Server fix:** `updateFile` refuses to replace a document with more than 200 characters by an essentially empty one, and logs `refused to overwrite`. One side effect: deliberately emptying a long document in one save is blocked. Nobody does that in one keystroke.
  - The draft was restored with `seed-draft.ts`.
- **Third FalkorDB quirk:** a **NUL byte (`\u0000`) anywhere in a string parameter** fails the whole query with "Failed to parse the value of parameter". PDFs contain them. `stripControl()` removes C0 control characters in `document-index.ts` and in OpenAlex titles and abstracts.
- **Verified in the browser:** the draft opens with its content; the slash menu opens; Tab selects in the menu and inserts a tab in text without losing focus; the library summary and the "In the graph" tab render. Re-index went done → indexing → done with the correct `no_file` reason.
- **Effect on Phases 3–4:**
  - Cite Scout and the Checker should retrieve **`Chunk` passages** as well as `Paper` abstracts, quoting the passage as evidence.
  - `scoreSupport` should judge a claim against the best-matching passages, not only the abstract.
  - Papers without full text fall back to the abstract.

### Phase 3: Cite Scout (MVP agent 1)

10. **Agent and route:** `cite-scout.ts` plus `POST /api/agents/cite-scout`.
    - Pipeline: the JEV gate, then graph retrieval (vector + full-text + 1–2 hop CITES + co-citation, collaborators first), then JEV relevance, then the result with owner, path and reason.
11. **UI:**
    - `extensions/cite-scout.tsx`: a gutter card about 1.5 s after typing stops.
    - "Cite" uses the existing `insertCitation` and writes an accepted edge.
12. **Team-library search:** a "Team library" tab in `SemanticScholarSelector`.

**Exit check:** A's claim gets a suggestion for B's paper with a path, and accepting it creates the edge.

**Phase 3 as built (Oct 15):**
- **`src/lib/graph/team-search.ts`:** team-library search over FalkorDB using three signals: Paper vector, **Chunk (full-text passage) vector** and full-text keywords, merged with reciprocal-rank fusion. It returns owners, authors in byline order (`WROTE.position`) and the best matching passage.
- **`src/lib/agents/cite-scout.ts`:**
  1. Picks the last uncited sentence.
  2. JEV `needsCitation` gate (skip below 0.5).
  3. Team search, excluding papers already cited or dismissed for this claim.
  4. JEV `scoreRelevance`, judged on the best passage (keep at 0.5 or above, top 3).
  5. `PATHS_TO_USER_LIBRARY`: the shortest CITES chain (up to 2 hops) to the user's own papers.
  6. `SUGGESTS_CITE {status: suggested}` proposals on the Claim.
  7. An AgentRun trace.
- **API:** `POST /api/agents/cite-scout` (suggest) and `PATCH` (accept/dismiss by claim and paper, via `DECIDE_CITE_PROPOSAL`).
- **UI:**
  - `cite-scout-panel.tsx`: fixed right, xl+ only. The editor column reserves `xl:pr-[324px]`. It re-checks after a 1.5 s pause or a paragraph change. Each card shows the owner, the % match, the passage quote and the citation chain, with Cite and Dismiss buttons and an On/Off toggle.
  - `find-papers-dialog.tsx`: the **/Search Papers** slash command. The query is pre-filled with the current sentence, team library first, then OpenAlex (citing an OpenAlex paper also imports it).
- **Shared:** `src/lib/citations.ts` holds the citation label, href and TipTap content. sync-document now resolves `openalex.org/W…` links too.
- **Verified:**
  - "Personalized PageRank…" gives **HippoRAG from Bea's library, 99% match, path HippoRAG ← SiReRAG → your "Lost in the Middle"**.
  - "Dense passage retrievers…" gives [Karpukhin et al., 2020], 100%.
  - The filler sentence is skipped (JEV 0.06).
  - Cite inserts the citation and records an accepted proposal plus the CITES edge.
  - End to end in about 1–2 s, of which graph search is ~20 ms.
- **Ops note:** Turbopack dev sometimes keeps a half-edited server module after rapid edits (symptoms: `X is not a function` or a query that is `undefined`). Restart `pnpm dev:all`.

### Phase 4: Citation Checker / Critic (MVP agent 2)

13. **Agent and route:** `citation-checker.ts` plus `POST /api/agents/citation-check`.
    - A verdict for each claim: `supported | weak | contradicted | uncited | unknown-source`, with a JEV score and the path.
14. **UI:** a "Check citations" button and side panel in the `Editore.tsx` header, optionally run before PDF export.

**Exit check:** the seed draft's unsupported and uncited claims are flagged with their paths. **The MVP is complete here.**

**Phase 4 as built (Oct 15):**
- **`src/lib/agents/citation-checker.ts`:** reads every Claim and its CITES edges from the graph (`DOCUMENT_CLAIMS`).
  - **Cited claims:** for each cited paper, it finds the passage closest to the claim (`BEST_PASSAGES_IN_PAPERS` over the Chunk vectors, falling back to the abstract), then runs JEV `scoreSupport` and maps the result to supported / weak / unsupported / contradicted. Any contradiction wins.
  - **Links not in the graph:** unknown-source.
  - **Uncited claims:** JEV `needsCitation`. Above 0.5 the claim is "uncited" and gets the best team-library paper as a suggestion.
  - **Recording:** verdicts are stored as `(Claim)-[:SUPPORTED_BY {level, score, confidence, runId, status:'suggested'}]->(Paper)`.
- **API:** `POST /api/agents/citation-check {workspaceId, fileId}`.
- **UI:** `citation-check-sheet.tsx`. A **Check citations** button next to Export opens a right-side sheet: worst first, with a summary of counts, the reason, the evidence passage and the suggested citation. Clicking a verdict scrolls to the sentence and flashes it.
- **Demo draft result (2.2 s):**
  - supported: RAG
  - **contradicted:** GraphRAG
  - not supported: CoT cited for "lost in the middle"
  - needs citation: DPR (yours) and HippoRAG (Bea's)
  - no citation needed: the intro sentence
- **Fixes along the way:**
  - **Claim parsing:** a citation after the full stop stays with the sentence it follows (it used to become its own claim). Claim IDs hash the sentence without its trailing citation, so adding a citation keeps the claim, along with its proposals and verdicts.
  - **Undo safety:** the editor loads saved content with `addToHistory: false`. Ctrl+Z could otherwise undo the load and strip the citation links (it happened during testing; the draft was re-seeded).

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

**Phase 5 as built (Oct 15):**
- **Historian** (`src/lib/agents/historian.ts`):
  - Each note is a `Memory {kind, status, validFrom, validTo, reason}` node with a vector index. It's linked `ABOUT` to its 3 nearest team papers, and `DROPPED_BECAUSE` to a paper when dropped.
  - JEV `classify` picks hypothesis / finding / question.
  - `recall()` finds similar memories, with `SAME_IDEA_DISTANCE = 0.32`. **Cite Scout and Next-Step warn when you're about to revisit a dropped hypothesis.**
- **Next-Step** (`src/lib/agents/next-steps.ts`):
  - Evidence comes only from the graph: `LITERATURE_GAPS`, `BRIDGE_PAPERS` (e.g. SiReRAG connects all 3 collaborators), `INFLUENTIAL_UNREAD` (`algo.pageRank`), and active memories.
  - gpt-4o-mini drafts ideas that must cite evidence IDs. A grounding guard drops ideas without evidence and replaces IDs with names.
  - JEV scores novelty and feasibility, 6 questions in 1 call.
  - Ideas are stored as `(Idea {status:'suggested'})-[:GROUNDED_IN]->(Paper|Concept)`; the plan is the accepted ideas.
- **Ghost Writer** (`ghost-writer.ts` and the `GhostText` extension):
  - Runs after a 1.2 s pause at the end of a block.
  - JEV `worthContinuing` gate, team-passage context, gpt-4o-mini with at most one sentence.
  - Grey widget decoration: Tab accepts (priority 1000), Esc dismisses, any edit or cursor move clears it. No AgentRun is recorded, because it runs too often.
- **Router** (`src/lib/agents/router.ts` and `/api/neura-ai`):
  - JEV `choice` picks cite_scout, citation_checker, next_steps, historian, team_library or general.
  - It runs the agent, and the chat streams an answer **only from that agent's evidence**. Naming a collaborator filters to their papers.
  - 6/6 intents routed correctly at confidence 0.99–1.00.
  - The chat renderer now shows every tool invocation.
- **UI:**
  - **Notebook** sheet: a Memory timeline with Remember / Confirm / Drop with reason / Reopen, and Next steps with Add to plan / Dismiss plus the research plan.
  - **`/hypothesis`** slash command.
  - **Ghost on/off** toggle in the Cite Scout header.
- **Verified in the browser:**
  - Ghost text "…can encapsulate broader contexts and relationships within the data." was accepted with Tab.
  - Cite Scout suggested [Edge et al., 2024] from Bea's library at 100% at the same moment.
  - `/hypothesis` showed "Saved as a hypothesis · Linked to LightRAG".
  - The Notebook timeline shows the dropped hypothesis with its reason.

### Phase 6: Research Graph page ✅

**Decision:** a full "hairball" of 900+ papers looks impressive but helps no one. The page answers three researcher questions instead, each drawn with FalkorDB's own renderer, **`@falkordb/canvas`** (a web component created imperatively, client-only).

| View | Question it answers | Layout | Data |
|---|---|---|---|
| **Team map** | Who has which papers, and which outside papers connect our libraries? | force | `VIEW_TEAM` + `VIEW_BRIDGES` (cited by ≥ 2 collaborators' papers) |
| **Paper focus** | What does this paper cite and what cites it, and who on the team owns those? | force, centred | `VIEW_FOCUS` (up to 40 neighbours) |
| **Agent provenance** | Why did the agent suggest this? | tree | the `highlight` node IDs each `AgentRun` records + `VIEW_PAPERS_BY_ID` / `VIEW_NOTES_BY_ID` |

19. **`src/components/graph/research-graph-view.tsx`:**
    - Owner colours are stable across views.
    - Nodes are sized by kind, and bridge papers by how many libraries they connect.
    - Suggested edges are dashed.
    - A node card has "Focus on this paper".
    - The Agent activity panel shows each run's step trace (tool, source, Cypher template, rows, ms). Clicking a run opens its provenance tree.
20. **`GET /api/graph/[workspaceId]?view=team|focus|provenance`:**
    - Citations are only drawn among shown nodes.
    - Outside↔outside citations are hidden in the team and focus views. Provenance keeps them, because they are the chain the agent walked.
21. **Navigation:** "Research graph" sidebar link.

**Verified in the browser:**
- The team map shows 3 colour-coded libraries joined by bridge papers.
- Focusing on ReAct (Chen) shows the 25 papers citing it.
- The Cite Scout run's provenance tree shows HippoRAG ← SiReRAG → Lost in the Middle with the owners.
- No console errors.

### Phase 7: Stretch ✅

1. **Synthesis agent** (`src/lib/agents/synthesis.ts`, `POST /api/agents/synthesis`, "Draft review" in the editor header, router intent `synthesis`):
   - **Scope:** the whole team library, or a topic. For a topic, it uses team search and keeps only papers JEV scores as relevant.
   - **Structure:** CDLP citation communities (`algo.labelPropagation`) and PageRank. Sections never mix communities, and the LLM only names and splits them.
   - **Grounding:** each section is written from full-text passages (`BEST_PASSAGES_IN_PAPERS`). It may cite only that section's papers, and unknown ids are dropped.
   - **Output:** a NEW file whose citations are real graph links. Sync, Cite Scout and the Checker understand it immediately.
   - **Verified:** 3 sections from 13 papers in about 10 s, opened in the editor. With a topic, JEV cut the scope from 22 papers to 13 and dropped the vision-transformer papers.
2. **Scout Watcher** (`src/lib/agents/scout-watcher.ts`, `POST /api/agents/scout-watcher`, "New papers" tab in the research library, router intent `scout_watcher`):
   - **Fetch:** one OR'd OpenAlex `cites:` query over the team's papers, ranked by PageRank.
   - **Filters:** a paper is kept only if it cites ≥ 2 team papers, isn't already in the library, and its nearest team paper in the **vector index** is within 0.4 cosine distance. Citing two RAG papers in passing isn't enough.
   - **JEV check:** a `noul` asks whether it contradicts the team paper it is closest to. Those papers are flagged first.
   - **Ordering:** collaborator overlap, then topical fit. Add imports the paper through the normal Librarian path.
   - **Lesson:** JEV's 3-way "challenges/extends/applies" choice over a long state was unreliable (surveys were labelled "challenges"), so a single yes/no against the closest paper replaced it.
   - **Verified:** the top result is a 2026 RAG survey citing 6 team papers that connects all 3 collaborators.
3. **MCP server** (`src/app/api/mcp/route.ts`), with no SDK dependency:
   - **Transport:** stateless Streamable-HTTP JSON-RPC (`initialize`, `tools/list`, `tools/call`, `ping`), with a Bearer `MCP_TOKEN` compared in constant time.
   - **Tools (read-only, parameterised Cypher):** `list_workspaces`, `search_team_library`, `find_papers`, `paper_neighbourhood`, `citation_path` (`allShortestPaths` over CITES), `research_frontier` (gaps, bridges, PageRank) and `team_memory`.
   - **Verified with curl:** 401 without a token, all tools return data, and a bad `workspaceId` is rejected.
   - **Use it with:** `claude mcp add --transport http neura http://localhost:3000/api/mcp --header "Authorization: Bearer $MCP_TOKEN"`

4. **Evidence map** (`evidence-map-sheet.tsx`, "Evidence map" in the editor header, `GET /api/graph/[workspaceId]/evidence?fileId=`), drawn on the shared `FalkorCanvas` (`src/components/graph/falkor-canvas.tsx`):
   - **What it draws:** the draft's argument as a graph. Claims (squares, coloured by Checker verdict) link to the papers they cite (circles, coloured by owner). Link colour is the stored `SUPPORTED_BY` level, and dashed links are `SUGGESTS_CITE` proposals. A tree layout is the default; "show citations between the papers" switches to force.
   - **The side panel lists:**
     - the problems (contradicted or unsupported claims, and needs-citation claims with the best suggestion and whose library it's from);
     - load-bearing papers that back several claims;
     - claims backed by a single paper;
     - whose reading the draft actually uses.

     Clicking a claim jumps to the sentence.
   - **Checker changes:** it now stores its verdict on each `Claim` (`SET_CLAIM_VERDICT`), and stores its fix for an uncited claim as a `SUGGESTS_CITE` proposal (`UPSERT_CHECKER_SUGGESTION`, which never overrides a person's decision). For claims checked earlier, the route derives the verdict from the stored support edges.
   - **Verified:** the queries return the demo draft's 6 claims, 3 citations with support levels and 5 suggestions across 3 owners. ⬜ Not yet viewed in the browser.

**Model providers switched (Oct 16).** OpenAI ran out of credits, and the user chose no OpenAI and no Gemini.
- **Text generation:** **DeepSeek V4** through `@ai-sdk/deepseek@0.2.16`, the line that works with AI SDK v4. Every call goes through `chatModel()` in `src/lib/ai/models.ts`. `DEEPSEEK_MODEL` defaults to `deepseek-v4-flash`; `deepseek-v4-pro` also works.
- **Embeddings:** **Cohere `embed-english-v3.0`** (1024-d) through `@ai-sdk/cohere@1.2.10`. Text stored in the graph uses the `search_document` input type and searches use `search_query`.
- **Why not `embed-v4.0`:** this provider version can't set its output dimension.
- **Migration:** `ensureSchema` (SCHEMA_VERSION 6) detects vector indexes of the wrong dimension, drops them along with their stale vectors, and recreates them. `scripts/reembed.ts <ws|--all>` re-embeds every Paper, Chunk and Memory from the stored text. It was tested end-to-end on a local model first: 911 papers and 1,397 passages in about 4 minutes.
- ✅ **Keys added and the demo graph re-embedded** with Cohere: 911 papers in 15 s, 1,397 passages in 22 s.
- **DeepSeek V4 thinks by default**, and the reasoning tokens count against `max_tokens`. The 40-token Ghost Writer budget came back empty, and a two-field object spent 345 tokens thinking. `src/lib/ai/models.ts` injects `thinking: {type: "disabled"}` into every request (the v4 AI SDK provider has no option for it). `DEEPSEEK_THINKING=1` turns it back on. Effect: Next-Step 20 s → 5 s, Synthesis 74 s → 11.5 s, Ghost Writer now returns text.
- **Thresholds re-measured on Cohere vectors.** Memory paraphrases sit at 0.16–0.27 distance and unrelated text at 0.48+, so `SAME_IDEA_DISTANCE` 0.32 and the router recall at 0.55 stay. On-topic citing papers sit at 0.21–0.39 from the nearest team paper and off-topic ones at 0.55+, so Scout Watcher `NEAR` went 0.4 → 0.45.
- **Verified on the new stack:** Cite Scout (HippoRAG from Bea's library at 100%, 1.4 s), Citation Checker (same 6 verdicts, 1.2 s), Next-Step, Scout Watcher (same top result), Synthesis (prose grounded, citations attached), Ghost Writer.

**Also fixed in Phase 7:**
- **Cross-document autosave:** with client-side navigation, the previous editor's debounced update was saved into the newly opened file. `headless/Editore.tsx` now tags each editor instance with its `fileId` and drops updates from a mismatched instance.
- **Router intents:** the router now has 8 intents, and 5 of 5 new test messages routed correctly.

### Phase 8: Submission (docs ✅, recording and submitting are left to the team)

- ✅ `README.md`: the pitch, why a graph, the architecture, the graph model (matching the Cypher), the agent table, JEV's role, local setup, demo seeding, MCP, the code map, hackathon vs. pre-existing work, and FalkorDB quirks.
- ✅ `docs/demo-script.md`: a timed ~4-minute shot list with narration.
- ✅ `docs/blog-post.md`: a draft for the blog side prize.
- ⬜ Record the video, publish the blog, and submit before 11:59 PM IST on Oct 18.
- ⬜ Optional: file FalkorDB GitHub issues for the engine quirks (null-list crash, DELETE…MERGE no-op).

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
