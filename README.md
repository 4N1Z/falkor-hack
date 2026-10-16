# Neura Query

**A collaborative research editor where a team's papers live in one FalkorDB graph, and small single-purpose agents help at each step of writing. Every suggestion they make comes with the graph path behind it.**

When three people write a paper together, each one brings a different reading list. Neura Query puts all of those lists into one research graph per workspace: papers, citations, authors, concepts, full-text passages, who imported what, and the team's own hypotheses. Agents in the editor then draw on that graph:

- **Cite Scout** suggests a citation for the sentence you're writing, drawn from *any* collaborator's library, and shows the citation path that connects it to your own papers.
- **Citation Checker** reads the cited paper's text and tells you whether each claim is supported, contradicted or uncited.
- **Next-Step** proposes what to do next, using only evidence from the graph: literature gaps, papers that bridge collaborators' libraries, and influential papers nobody has read.
- **Historian** keeps a time-aware research notebook, so a hypothesis the team dropped in March isn't suggested again in May.
- **Ghost Writer, Synthesis, Scout Watcher** and an **MCP server** are covered below.

Agents only *propose*. Nothing is inserted until a person accepts it, so the researcher stays the author.

> Built for the **WeMakeDevs × FalkorDB hackathon** (Oct 15–18 2026), Track 01: *Agents That Act on Connected Data*.
> The full phase-by-phase plan, decisions and verification notes are in [`docs/falkordb-hackathon-plan.md`](docs/falkordb-hackathon-plan.md).

---

## Why a graph

Most "chat with your papers" tools use vector search over chunks. That answers *"which passage is similar to this?"* It can't answer the questions a research team actually has:

| Question | What it takes in FalkorDB |
|---|---|
| Which of **Bea's** papers supports the sentence **I** just wrote, and how does it connect to my reading? | Vector + full-text search, then `(:User)-[:IMPORTED]->(:Paper)` ownership, then a 1–2 hop `CITES` path to my own papers |
| Does the paper I cited actually say this? | Vector search over that paper's `Chunk` passages only, then JEV support scoring |
| What is the field around us working on that none of us has read? | `algo.pageRank` over `CITES`, concepts reached by the neighbourhood but not by the library, papers cited by several collaborators' libraries |
| How should a literature review of our papers be organised? | `algo.labelPropagation` citation communities, with PageRank ordering papers inside each one |
| Has anything new come out that builds on (or contradicts) our work? | Recent works citing ≥ 2 team papers, filtered by distance to the nearest team paper in the vector index |
| Didn't we already try this? | Vector search over `Memory` nodes with status `dropped`, plus the `DROPPED_BECAUSE` reason |

## Architecture

```
 Editor (TipTap + Yjs/Hocuspocus)            Research library · Graph page · Neura AI chat
   gutter cards · ghost text · check panel          │
          │                                         │
          ▼                                         ▼
 ┌──────────────────── Agent API routes (Next.js, Node runtime) ────────────────────┐
 │ cite-scout · citation-check · next-steps · ghost · memory · synthesis ·          │
 │ scout-watcher · router (/api/neura-ai) · graph views · MCP (/api/mcp)            │
 │ each agent: one job, fixed parameterised Cypher templates, AgentRun trace        │
 └───────┬────────────────────────────┬────────────────────────────┬────────────────┘
         ▼                            ▼                            ▼
   FalkorDB  ws:{workspaceId}     JEV (TypeSafe System One)    DeepSeek V4 (prose) +
   one graph per workspace,       typed relevance / support /  Cohere embeddings (1024-d,
   shared by every agent          routing judgements, ~100ms   query vs document types)
         ▲
   Librarian pipeline: OpenAlex metadata + references + authors + concepts,
   PDF/DOCX full text → passages → embeddings (runs in `after()` on import)

 Postgres (Drizzle/Supabase): auth, workspaces, files (TipTap JSON), library rows
```

### Graph model

```
(:User)-[:IMPORTED {at, source}]->(:Paper {paperId, doi, arxivId, title, abstract, year, inLibrary, embedding})
(:Paper)-[:CITES]->(:Paper)          (:Author)-[:WROTE {position}]->(:Paper)
(:Paper)-[:ABOUT]->(:Concept)        (:Paper)-[:PUBLISHED_IN]->(:Venue)
(:Chunk {text, embedding})-[:CHUNK_OF]->(:Paper)                     ← full-text passages
(:User)-[:EDITS]->(:Document)-[:CONTAINS]->(:Claim {text})-[:CITES]->(:Paper)
(:Claim)-[:SUPPORTED_BY {level, score, status}]->(:Paper)          ← Citation Checker verdicts
(:Claim)-[:SUGGESTS_CITE {relevance, status}]->(:Paper)            ← Cite Scout proposals
(:User)-[:RECORDED]->(:Memory {kind: hypothesis|finding|question, status, validFrom, validTo})-[:ABOUT]->(:Paper)
(:Memory)-[:DROPPED_BECAUSE]->(:Paper)                               ← Historian
(:Idea {status, novelty, feasibility})-[:GROUNDED_IN]->(:Paper|:Concept)   ← Next-Step
(:AgentRun {agent, trace, highlight, ms})                            ← every agent run, for provenance

Adam (the research-agent system, docs/adam-spec-creation.md):
(:AdamProject)-[:TRIAGED {label, ring, clusterId, nodesNew}]->(:Paper)
(:Claim {text, section, quote, chunkId, page, state})-[:EXTRACTED_FROM]->(:Paper)   ← every node cites a passage
(:Evidence)-[:SUPPORTS]->(:Claim)   (:Claim)-[:USES]->(:Method)-[:USED_IN {quote, page}]->(:Paper)
(:Claim)-[:DEPENDS_ON]->(:Assumption)   (:Claim)-[:FAILS_UNDER]->(:Condition)   (:Claim)-[:CONTRADICTS]->(:Claim)
(:Procedure {inputs, outputs, steps, runnability})-[:SPECIFIES]->(:Method)   (:Procedure)-[:USES]->(:Instrument)
(:Procedure)-[:PRODUCES]->(:Result)   (:Procedure)-[:DEPENDS_ON]->(:Procedure)        ← the chain a hypothesis query walks
(:Candidate {kind: hole|conflict|load_bearing})-[:SHOWS]->(…)                          ← Graph Analyst
(:Hypothesis)-[:EVIDENCE_FOR|EVIDENCE_AGAINST]->(:Claim)   (:Attack {kind, status})-[:ON]->(:Hypothesis)
(:ExperimentPlan)-[:TESTS]->(:Hypothesis)   (:AdamJob)  (:AdamEvent)  (:ClusterStat)   ← the loop's own state
```

Draft sentences in documents are `(:Sentence)` nodes (they were `Claim` before Adam; a `Claim` is now a statement extracted from a paper).

The exact Cypher is in [`src/lib/graph/queries.ts`](src/lib/graph/queries.ts) and the indexes are in [`src/lib/graph/schema.ts`](src/lib/graph/schema.ts).

**FalkorDB features used:**
- **Multi-graph tenancy:** one graph per workspace.
- **Vector indexes:** `Paper`, `Chunk` and `Memory`, each 1024-d (Cohere `embed-english-v3.0`) with cosine similarity.
- **Full-text indexes:** `Paper` title and abstract, and `Chunk` text.
- **Range indexes.**
- **Graph algorithms:** `algo.pageRank`, `algo.labelPropagation` (CDLP) and `allShortestPaths`.
- **Variable-length paths.**
- **Rendering:** [`@falkordb/canvas`](https://www.npmjs.com/package/@falkordb/canvas) draws the Research graph page.

### Two rules every agent follows

1. **Provenance.**
   - Every result carries the graph path or passage behind it.
   - Every run is stored as an `AgentRun` with its step trace (tool, Cypher template, rows, ms) and the node IDs it used.
   - The Research graph page renders any run as a provenance tree.
2. **Proposals, not facts.**
   - Agent-written edges and nodes start with `status: 'suggested'` and `by: 'agent:<name>'`. They are promoted only when a person accepts them.
   - Grounding queries read accepted, ingested or user-created data, so agent guesses never pollute the knowledge base.

## The agents

| Agent | Its one job | Graph | JEV |
|---|---|---|---|
| **Librarian** (pipeline) | Turn imports/uploads into graph nodes: OpenAlex metadata, references, authors (in byline order), concepts, full-text passages | `MERGE` templates, chunk vectors | – |
| **Cite Scout** | Citation suggestions for the sentence being written, from every collaborator's library | Hybrid search (paper vectors + passage vectors + full-text, RRF), owner lookup, `CITES*1..2` path to *your* papers, dropped-hypothesis check | `noul` "needs a citation" gate, then `score` relevance of every candidate in one call |
| **Citation Checker** | Verdict per claim: supported / partly / contradicted / not supported / needs citation | Claim→cited paper, best passages *within the cited papers* | `score` support rubric on the passage, `noul` for uncited claims |
| **Next-Step** | 3 grounded next steps (read / experiment / write / ask) | Literature gaps, bridge papers, PageRank-influential unread papers, open hypotheses | `score` novelty and feasibility |
| **Ghost Writer** | Grey inline continuation, Tab to accept | Cite Scout's top passages as context | `noul` "worth continuing now" gate |
| **Historian** | Time-aware notebook: `/hypothesis`, findings, questions, why something was dropped | `Memory` vector index, `DROPPED_BECAUSE`, timeline | `choice` hypothesis / finding / question |
| **Synthesis** | Draft a literature review into a new document | CDLP communities + PageRank structure the sections; passages ground the prose; citations restricted to the team's papers | `score` topic relevance for scoped reviews |
| **Scout Watcher** | New papers the team should know about | OpenAlex works citing ≥ 2 team papers, then vector-index distance to the nearest team paper | `noul` "contradicts the closest team paper" |
| **Router** | Send a chat message to the right agent | – | `choice` over 8 intents |

**MCP server** (`/api/mcp`, read-only)
- **Tools:** `list_workspaces`, `search_team_library`, `find_papers`, `paper_neighbourhood`, `citation_path`, `research_frontier`, `team_memory`, and Adam's `adam_projects`, `paper_claims`, `methods_dossier`, `open_questions` and `hypothesis_query`.
- **Clients:** gives Claude Code, Claude Desktop or Cursor the same graph tools the agents use.

## Adam: the research-agent system

Adam is the flagship (spec: [`docs/adam-spec-creation.md`](docs/adam-spec-creation.md)). Its premise: **a new result is a new combination of known steps.** The literature is not a pile of papers to summarise; it is an inventory of known steps, each with known inputs, outputs and conditions. So Adam's product is a graph of known steps, dense enough that when a researcher states a hypothesis the system can answer which steps exist, which are verified, which are missing, and where the chain breaks.

It lives at `/dashboard/<workspace>/adam` and runs as a loop (question → sweep → extract → methods → connect → hypothesise → attack → experiment → read again), driven by an orchestrator that reads the graph's state and enqueues jobs. The jobs are `(:AdamJob)` nodes in the same FalkorDB graph, drained by `scripts/adam-worker.ts` (`pnpm adam`, included in `pnpm dev:all`).

| Agent | Its one job | Checked by |
|---|---|---|
| **Scoper** | The topic becomes a question page: hunch, sub-questions, vocabulary incl. neighbouring fields' terms, scope fence | Scope checker; the researcher approves (gate 1) |
| **Searcher** | Three rings (seed, citation backward+forward, adjacent fields) over OpenAlex; triage core / method / contradicts / background | Coverage check: are the core papers' key references present? |
| **Extractor** | One extraction card per paper from its section-aware passages: claims, evidence, methods, assumptions, limitations, gaps, each with a verbatim quote, page and section. Two independent cards for core papers | **Verifier**: the quote must be in the source (no model is asked otherwise), the section must match, a typed rubric judges the rest; disagreements between the two cards become conflicts |
| **Methods Hunter** | Each Method filled in to a Procedure a lab could run: inputs, outputs, steps, equipment, time, cost, reliability, from the paper's methods sections, supplements and linked READMEs/protocols | Runnability check (runnable / partial / unknown) and feasibility against the lab's constraints |
| **Graph Analyst** | Holes between related clusters, conflicts between opposite claims, load-bearing assumptions nobody tested | Sanity check: an edge needs more than vocabulary overlap |
| **Hypothesis Writer** | Two to four competing briefs with boundary, evidence for and against, prediction and kill criteria | **Falsifier** (sees the brief and the graph, never the writer's reasoning): pre-mortem, dependency attack, rival explanations, null and ablation, baseline replication, boundary probe. The writer answers in writing; a brief with an open fatal attack cannot proceed. The researcher selects briefs (gate 2) and signs kill criteria (gate 3) |
| **Experiment Designer** | The chain of procedures per surviving brief, cheapest-to-kill first, gaps marked, controls from the rivals | Design check: does each experiment test the kill criterion and not something adjacent? The researcher approves the plan |
| **Orchestrator** | Who runs next; stopping rules: saturation per cluster, budget, convergence, diminishing chains, human hold | The researcher can pause, resume, redraw scope, start the next pass |

**Hypothesis as a query** (the Experiments tab, the chat's Adam intent, and the `hypothesis_query` MCP tool): the researcher types a hypothesis; the system returns the evidence for and against each sub-claim with pages, the boundary (conditions and assumptions), candidate chains of procedures with each step's status, gaps (which re-prioritise the Methods Hunter), rival chains that reach the same result without the mechanism, and the cost to kill.

**The exception queue**: people see only what the Verifier flagged (conflicts, low confidence, load-bearing, unsourced), each beside its quoted passage, with approve / correct / reject / send back. Everything else is one click away for audit. A person's decision outranks every agent write.

**Full-text indexing** is the foundation: PDFs are chunked by section (not token count) with page numbers, figure and table captions as their own passages, supplements and linked artefacts as extra documents of the paper, and an access status per paper. See `src/lib/graph/document-index.ts`.

**OpenAlex**: keyless traffic is metered against a shared daily budget; set `OPENALEX_API_KEY` (free from openalex.org) in `.env.local` or sweeps and the Librarian degrade to rate-limit errors.

**Benchmark**: `scripts/adam-benchmark.ts <workspaceId> <projectId> <reviewOpenAlexId>` measures coverage against a review's reference list, writes an extraction sample for an expert to grade, and lists method completeness, the Analyst's candidates and the briefs.

### Where JEV fits

[JEV (TypeSafe System One)](https://typesafe.ai/blog/introducing-system-one-models-and-jev) answers typed questions about a piece of text:
- `noul`: a probability.
- `score`: a rubric level.
- `choice`: a label.

It returns many named questions in one ~100–500 ms request, which suits the per-keystroke decisions an editor needs. Scoring 8 citation candidates is one call, not 8 LLM calls. The agents use it for every *judgement*, and use an LLM only where prose is needed.

Every helper in [`src/lib/jev.ts`](src/lib/jev.ts) has a fallback (embeddings, or a small structured DeepSeek call), so the product never depends on one vendor.

## Running it locally

**Requirements:**
- Node 20+ and pnpm.
- Docker (for FalkorDB).
- A Postgres database (Supabase works).
- A DeepSeek API key (text generation, `deepseek-v4-flash`) and a Cohere API key (embeddings).
- Optional: a TypeSafe (JEV) key.

```bash
pnpm install
cp .env.example .env.local        # fill in DATABASE_URL, AUTH_*, DEEPSEEK_API_KEY, COHERE_API_KEY, FALKORDB_URL, …
docker compose up -d falkordb      # FalkorDB on :6379, FalkorDB Browser on http://localhost:3001
pnpm push                          # create the Postgres tables
pnpm dev:all                       # Next.js on :3000 + the Hocuspocus collaboration server on :1414
```

Sign in, create a workspace, then open **Research papers** to search OpenAlex or upload PDFs. Every paper you add is indexed into the workspace graph in the background.

### Demo data

The seed scripts build the hackathon demo: three collaborators with overlapping RAG/GraphRAG libraries, and a draft that exercises every agent.

```bash
run() { node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs "$@"; }
run scripts/seed-graph.ts    <workspaceId>     # demo collaborators Bea and Chen + their papers
run scripts/seed-fulltext.ts <workspaceId>     # full-text passages for the seeded papers (arXiv PDFs)
run scripts/seed-draft.ts    <workspaceId>     # "GraphRAG literature review (draft)" in a Demo folder
run scripts/graph-report.ts  <workspaceId>     # what is indexed in FalkorDB, cross-checked with Postgres
run scripts/reembed.ts       <workspaceId|--all> # re-embed papers, passages and notes after changing the embedding model
run scripts/test-jev.ts [--fallback]           # sanity-check the relevance layer
```

### Using the MCP server

Set `MCP_TOKEN` (16+ characters) in `.env.local`, then:

```bash
claude mcp add --transport http neura http://localhost:3000/api/mcp --header "Authorization: Bearer $MCP_TOKEN"
```

## Where things are

| Path | What |
|---|---|
| `src/lib/graph/` | FalkorDB client, schema/indexes, all Cypher, the Librarian (`ingest.ts`, `document-index.ts`), document → claims sync, team search |
| `src/lib/agents/` | One file per agent, plus `base.ts` (runs, traces, proposals) and `router.ts` |
| `src/lib/jev.ts` | Typed JEV questions with fallbacks |
| `src/app/api/agents/*`, `src/app/api/graph/*`, `src/app/api/mcp` | Agent, graph-view and MCP endpoints |
| `src/components/novel/` | Editor integrations: Cite Scout panel, ghost text, citation check, notebook, draft review |
| `src/components/graph/research-graph-view.tsx` | Research graph page: team map, paper focus and agent provenance on `@falkordb/canvas` |
| `src/components/library/` | Research library: library, index health, OpenAlex search, new papers, upload/import |

### Built during the hackathon vs. pre-existing

**Pre-existing:** the neura-query app itself (auth, workspaces, folders and files, the TipTap/Yjs collaborative editor, Zotero OAuth, the original bubble-menu AI and Stripe) was imported in the first commit.

**Built during the hackathon (Oct 15–18):**
- Everything under `src/lib/graph`, `src/lib/agents`, `src/lib/jev.ts` and `src/lib/citations.ts`.
- The agent, graph and MCP routes.
- The research library rebuild: OpenAlex search and import, full-text indexing, and index health.
- Every editor integration listed above.
- The Research graph page and the seed and report scripts.
- Upgrade to Next 16.
- Fixes to the editor plumbing it depended on:
  - slash commands and Tab indentation;
  - collaborator presence;
  - draft-wiping and cross-document autosave bugs.

### FalkorDB notes from building this

Engine quirks we hit and worked around (details in the plan doc):
- **Null lists:** returning a `collect()` list containing nulls crashed the server, so lists are filtered before they're returned.
- **Delete then merge:** `MATCH … DELETE … WITH count(*) … UNWIND … MERGE` silently created nothing, so it is split into two queries.
- **NUL bytes:** a NUL byte inside a string parameter fails the query, so text is stripped of control characters on ingest.
- **`shortestPath` placement:** `shortestPath` is accepted only in `WITH`/`RETURN`. `MATCH p = allShortestPaths(...)` after a `WITH` works for undirected citation paths.
