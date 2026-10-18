# Using Adam

Adam is the research-agent system described in the [README](../README.md#adam-the-research-agent-system). This guide is the practical side: how to run it, what each tab is for, what you are expected to decide, and what a pass costs.

The one idea to keep in mind: **Adam does not summarise papers for you. It builds a graph of known steps, every one traced to a page in a source, and then answers "what chain of steps would test my hypothesis, and where does the chain break?"** Your job is three decisions it cannot make: what the question is, which hypotheses are worth your time, and what result would kill each one.

## 1. Running it

Three processes, all started by `pnpm dev:all`:

| Process | What it does |
|---|---|
| `next dev` | The app, including the Adam page at `/dashboard/<workspace>/adam` and the API under `/api/adam/*` |
| `scripts/serve.mts` | The editor's collaboration server (not Adam's) |
| `scripts/adam-worker.ts` (`pnpm adam`) | **Adam's worker.** It drains `(:AdamJob)` nodes from every workspace graph in FalkorDB and runs the agents. Nothing happens without it. |

Requirements: **Node 22 or newer** wherever the worker runs (PDF.js needs the `Iterator` global; on Node 20 every PDF read fails silently and Adam sees abstracts only; the worker logs a warning at start). In `.env.local`: `FALKORDB_URL`, `DEEPSEEK_API_KEY`, `COHERE_API_KEY`. Optional: `DEEPSEEK_HEAVY_MODEL` (a larger model for the extractor, methods hunter, writer and falsifier), `OPENALEX_API_KEY` (required in practice: measured on 2026-10-18, keyless traffic gets 1,000 units a day at 10 per request, about 100 requests, and one sweep makes about 250; set the key in the environment of **every** worker, including one running in a deployed container, and restart it).

If you change anything under `src/lib/adam/`, restart the worker. A running worker keeps claiming jobs with the code it started with.

## 2. The loop

**Simple view (default).** Five steps: Ask, Read, Pick, Experiment, Write, each with one thing to do. Read runs the four automatic phases and applies the auto-reviewer's clear calls itself; what it could not settle sits under "Things Adam wasn't sure about" and never blocks a step. Experiment is a checklist you run: tick steps, write observations, then answer whether the kill result appeared; that verdict sets the hypothesis to dropped or confirmed-so-far and stores your observations as Result nodes with you as the source. The write-up includes them. The **Advanced** switch in the header shows every tab described below.

### The loop, tab by tab (advanced view)

The status bar at the top shows the phase stepper (Question → Sweep → Extract → Methods → Connect → Hypothesise → Attack → Experiment → Done), the project state, counts, and **Run / Pause**. "Waiting for you" means a gate is open; the tab with the amber dot is where the decision lives.

### Question (phase 0, gate 1)

Write the brief on the left:

- **Topic**: a sentence or a paragraph.
- **Current understanding**: what you believe, what you have read, what you suspect is wrong in the field. This is the most valuable input; the Scoper's sub-questions come from it.
- **Constraints**: equipment, data, skills, time, budget. These decide which chains are feasible, so Adam needs them early.
- Optionally mark seed papers from the library as trusted or distrusted (from the Sweep tab once the page exists).

Press **Write question page** (or **Run**). The Scoper writes a hunch, 3–5 sub-questions, search vocabulary including the names neighbouring fields use, and a scope fence. A separate checker flags sub-questions no experiment could settle and anything the fence excludes that the hunch depends on.

You can edit any block in place (hover → pencil). Your edits outrank the agent's text. **Send back** with a note makes the Scoper rewrite it. **Approve scope** is gate 1: nothing is read until you pass it.

### Sweep (phase 1)

Three rings run in order:

- **Seed**: per sub-question, relevance, most-cited, most-recent and review papers, plus the field's own vocabulary and your seeds.
- **Citation**: backward through the core papers' references, forward through the papers that cite them.
- **Adjacent**: the same problem under other names (the Scoper's adjacent terms) and papers sharing concepts with core papers but never citing them.

Every paper is triaged **core / contradicts / method / background** (out-of-scope papers are not written). Core, contradicting and method papers become library papers and are read in full; background papers are metadata-only nodes. The coverage check then asks whether each core paper's ten most-cited references are present; below 60 percent, the citation ring runs again for that paper.

What you can do here: relabel a paper (your label is never overwritten), **supply a PDF** for a core paper that is abstract-only, and re-run a ring. A ring that fails twice (usually an OpenAlex rate limit) is skipped for the pass with a note and runs again next pass. A spent OpenAlex budget fails the ring at once with the remaining units and reset time in the message, and the loop pauses on it; a job that returns nothing for an hour is abandoned by its worker and retried. If a ring stays "running" with a worker id that is not yours (a deployed container without the key), release it with `scripts/adam-release-job.ts`.

### Extract and verify (phase 2)

Automatic. Each readable paper gets an extraction card: claims, evidence, methods, assumptions, limitations, gaps, contradictions, every item with a verbatim quote, page and section. Core and contradicting papers are read twice by independent extractors.

The Verifier never sees the extractor's reasoning. It checks that the quote is really in the paper (an item with no passage is never judged by a model, it goes straight to the queue as *unsourced*), that a Results claim was not quoted from the Discussion, and then scores whether the passage states the item. Where the two extractors read the same passage differently, the item becomes a *conflict*. Abstract-only papers' items are capped at low confidence.

### Extraction queue

The exception queue is the only place you are asked to look at individual items, and only at what the Verifier flagged:

| Kind | Meaning |
|---|---|
| Conflict | Two extractors read the same passage differently; pick one |
| Unsourced | The quote is not in the paper's text |
| Load-bearing | Many other nodes depend on this; an error here propagates |
| Low confidence | Ambiguous source, abstract-only, or a weak passage |

Each card shows the agent's output on the left and the quoted passage, with the quote marked, on the right. Actions: **Approve**, **Correct** (your text replaces the agent's; the original is kept), **Reject**, **Send back** (re-extracts the paper with your note). Merged entity names can be split again by clicking the alias.

The queue is built for volume. It is paged (40 at a time, filtered by kind and paper on the server), decisions are optimistic (the card leaves at once and the requests go out batched a moment later, so 500 approvals are 500 keystrokes, not 500 waits), and there is multi-select: tick cards or press `x`, "Select all on this page", then **Approve N** or **Reject N** in one request. Keys: `j`/`k` move, `x` select, `a` approve, `r` reject, `c` correct; with a selection, `a` and `r` act on the whole selection.

**Auto-review** (optional, the button at the top) is for when the queue is long. It reviews every open item (a typed judgement against the passage, plus graph corroboration: evidence edges, verified claims that depend on it) and comes back with a proposal: these to approve, those to reject, and the ones it could not call. Nothing is decided by it. A banner shows the totals with **Approve all N** and **Reject all M**; one click applies the proposal as your decisions. You can filter to "to approve" or "to reject" and skim the proposal first, approving or rejecting individual cards; each card shows the suggestion and its reason. Conflicts and unsourced items are never proposed, they stay for you.

A person's decision outranks every agent write and is never undone by a later run.

### Knowledge

Everything the project holds, as a filterable table and as a canvas. Click any node for its provenance: the statement, the passage with the quote marked, the paper, page and section, and every edge around it (what it uses, depends on, contradicts). Nothing that is not in the queue is hidden; it is one click away for audit.

### Methods (phase 3)

Each method a verified claim uses is chased to a **procedure** a lab could follow: inputs, outputs, expected result, conditions, equipment, time, cost, reliability, ordered steps. Sources are the papers' methods sections, captions, supplements and linked READMEs or protocol pages. The runnability check marks it **runnable / partial / unknown** and lists what is still missing; feasibility is judged against your constraints.

"Unknown" is an honest answer: the sources describe a technique, not a procedure. Hunt again with a note, or supply the missing source as a supplement.

### Hypotheses (phases 4–6, gates 2 and 3)

First the Graph Analyst reports what it found: **holes** (two related clusters nobody has connected), **conflicts** (opposite claims, with the unmeasured condition that might explain them), and **load-bearing assumptions** (many claims depend on it; nothing tests it). Each candidate passed a sanity check; the ones that failed are shown greyed with the reason.

Then the Writer drafts two to four competing briefs. Each has the full template: statement, mechanism, boundary (holds under / fails under), evidence for and against with pages, prediction, kill criteria, and later the chains, the minimum viable experiment, rival explanations and the attack log. A brief with no failure condition is marked *not ready*.

**Gate 2**: tick the briefs worth pursuing and **Select**. Agents drift toward safe ideas already in the literature; this choice is yours.

The Falsifier then attacks each selected brief: pre-mortem, dependency attack, rival explanations with the separating control, null and ablation, baseline replication, boundary probe. The Writer answers every attack in writing; each ends *answered*, *open* or *fatal*. You can overrule any status. A brief with a fatal attack is killed; one that survives two rounds with nothing new open has *survived*.

**Gate 3**: for each survivor, read the kill criterion, edit it if you want, then retype it to sign. This is the pre-registration: the result that makes you drop the hypothesis, committed before any data is collected.

Each brief also has a **Map** section: the brief in the middle, its evidence claims (green edges for, red against), the papers they were extracted from and the sub-question each paper was swept for, the methods and assumptions the claims rest on, contradicting claims, every attack with what it cites, and the experiment plan's procedures. Node size shows review state (bigger = approved by a person, grey = retracted) and the line under the map tallies the review done on exactly what you see. Click a node to open its provenance; click a legend chip to hide that kind.

### Experiments (phase 7, plan gate)

The top box is **hypothesis as a query**: type any hypothesis and get, from the graph, the evidence for and against each sub-claim, the boundary, candidate chains of procedures with each step's status, gaps (which point the Methods Hunter back out), rival chains that reach the same result without the mechanism, and the cost to kill. The same question is available in the Neura AI chat ("is it true that…") and as the `hypothesis_query` MCP tool.

Below are the plans the Designer wrote for each signed brief: the chain ordered cheapest-to-kill first, gaps marked as the risky steps, a control per rival explanation, and how the result maps to the kill criterion. The design check flags a plan that tests something adjacent to the kill criterion. **Approve plan** hands it to the lab.

### Saturation

One bar per cluster (sub-question): how far the rate of new nodes per paper has fallen toward zero. A cluster is saturated when its last ten papers added fewer than two new nodes between them. It measures whether Adam has stopped learning from the literature, not whether the literature is right.

From here you also **start the next pass** (back to the question with sharper sub-questions from what the attacks and gaps left open; saturated clusters are not searched again) and **re-sweep recent citations** (papers that cited the core since the last sweep). A brief whose evidence a new paper contradicts is flagged on its card.

### Activity

The event log and the job queue. A failed job shows its error here; **Resume** in the status bar re-runs it.

## 3. The three decisions, in one place

| Gate | Where | What you commit to |
|---|---|---|
| Scope | Question tab | This is the right question and the fence is in the right place |
| Selection | Hypotheses tab | These briefs are worth the lab's time |
| Kill criteria | Hypotheses tab | Exactly this result makes us drop the hypothesis |
| Plan | Experiments tab | This chain tests the kill criterion and goes to the lab |

Everything else (approving queue items, relabelling papers, supplying PDFs, hunting a method again) is optional and can be done at any time.

## 4. What a pass costs

Measured on the first pass of a project with 71 triaged papers (33 read in full, 2,215 passages), with the worker at 4 slots. Counts are per pass; a second pass is much smaller because saturated clusters are skipped and papers already extracted are not re-read.

| Resource | Calls | Where they go |
|---|---|---|
| **DeepSeek (structured LLM calls)** | ~380 | Extractor 101 (1–2 per card, two cards per core paper), Methods Hunter 240 (3 per method: procedure, runnability, feasibility), Analyst 20 (2 per candidate), Writer 4, Falsifier ~3 per selected brief per round, Designer 2 per plan, Scoper 2 |
| **Typed judgements** (small structured calls; DeepSeek fallbacks without a key) | ~100 | Verifier 90 (one request per 25 items), Searcher 11 (one per 20 candidates to triage) |
| **Cohere embeddings** (batched requests, up to 96 texts each) | ~400 | Passages at indexing (1–2 per paper), claims/methods/assumptions per card (3–4), procedure and result per method hunt (1), clusters per ring (1–2), a few per hypothesis query |
| **OpenAlex** | ~250 | Searcher ~60 (4 per sub-question + 12 vocabulary + 1 per core paper forward + 12 adjacent terms), Librarian ~3–5 per new paper (resolve, references, citing works) |
| **PDF / artefact fetches** | ~50 + ~20 | One per new paper with an open-access file; READMEs and protocol pages linked from methods sections |
| **FalkorDB queries** | ~6,000 | Extraction ~35 per card, verification ~15 per card plus one vector query per verified claim, hunting ~15 per method, orchestrator ~5 per tick (every 20 s), plus the UI's polling while you watch |

Tokens are not metered per call, but the heavy calls are predictable: an extraction call carries a whole paper (roughly 15–25k input tokens, 4–6k output), a methods hunt about 8k in and 3k out, a brief or an attack round about 6k in and 3k out. A pass of this size is on the order of 4–5 million input tokens and 0.8 million output tokens on DeepSeek, nearly all of it in extraction and method hunting. The per-pass budget (`maxLlmCalls`, default 3,000; `maxPapers`, default 200) stops the loop before that runs away; the status bar shows the spend.

Wall-clock on this run: the sweep took about 5 minutes per ring, extraction and verification about 40 minutes for 70 cards, method hunting about 15 minutes for 80 methods, the Analyst 25 seconds, the Writer 30 seconds, an attack round about 25 seconds per brief. Most of it is waiting on DeepSeek; more worker slots (`--slots=8`) shorten it until FalkorDB's single writer becomes the limit.

## 5. Checking it before trusting it

`scripts/adam-benchmark.ts <workspaceId> <projectId> <reviewOpenAlexId>` runs the spec's validation: coverage of a review paper's reference list, an extraction sample written to Markdown for an expert to grade, method completeness, and the Analyst's candidates and the briefs for comparison with the review's open problems. Run it after each pass; the thresholds that need tuning on its results are the Verifier's rubric cut-offs (`verifier.ts`), the entity-resolution merge distances (`resolve.ts`) and the saturation window (`saturation.ts`).

## 6. What Adam depends on in FalkorDB

Every statement is a fixed, parameterised template in `src/lib/adam/queries*.ts` (about 200 of them); agents never write free-form Cypher. The dependencies, by kind:

| Dependency | Where | What for |
|---|---|---|
| **Vector indexes** (`db.idx.vector.queryNodes`, cosine, 1024-d Cohere) on `Claim`, `Method`, `Assumption`, `Result`, `Hypothesis`, plus the library's `Paper` and `Chunk` | entity resolution (`resolve.ts`), cross-paper contradictions and sub-claim evidence (`verifier.ts`, `hypothesis-query.ts`), "has anything tested this assumption" (`analyst.ts`), baseline replication (`falsifier.ts`), result lookup for path search, Citation Checker integration | nearest-neighbour search is how the graph is read semantically |
| **Full-text indexes** on `Claim.text`, `Procedure.name` (and the library's `Paper`, `Chunk`) | reserved for keyword search over claims and procedures from the chat and MCP | |
| **Range indexes** on every adam label's `id` and `projectId`, on `Claim.state`, `Method.nameKey`, `Instrument.nameKey`, `AdamJob.status` / `dedupeKey`, `Chunk.section` / `kind` / `doc` | every `MATCH` carries `projectId` so these apply; the job queue's claim and dedupe | |
| **Community detection** `algo.labelPropagation` over `Paper`, `Method`, `Claim` with `CITES`, `USED_IN`, `USES`, `EXTRACTED_FROM` | `analyst.ts`: clusters for hole detection; `clusterId` on triage edges for the saturation bar | the one graph algorithm the loop runs |
| **Variable-length paths** `(:Procedure)-[:DEPENDS_ON*0..5]->(:Procedure)` ending at `<-[:PRODUCES]-(:Result)` | `hypothesis-query.ts`: candidate chains, rival chains | path search is what makes "hypothesis as a query" a query |
| **`UNION ALL`** across labels | queue, knowledge table, node counts, applying suggestions | one request over several node kinds |
| **Atomic single-statement claim** on `(:AdamJob)` (`MATCH … WITH … LIMIT 1 SET …`) | `jobs.ts` | the job queue needs no lock server |
| **`MERGE` on deterministic ids** | every writer | re-running a job replaces instead of duplicating |
| **Multi-graph tenancy** `ws:<workspaceId>` | everything | one graph per workspace, several projects per graph |
| Library templates reused: `UPSERT_PAPERS` / `AUTHORS` / `CONCEPTS` / `VENUES` / `CITES` / `IMPORTED`, `UPSERT_CHUNKS`, `PAPERS_BY_PG_ID`, `TEAM_PAPER_DETAILS` | the Searcher feeds papers through the Librarian | |

Engine rules the templates follow, learned the hard way: a bound node's property cannot be used inside a later `MATCH`'s inline property map (`MATCH (p:Paper {paperId: c.paperId})` fails; use `WHERE p.paperId = c.paperId`); a `null` inside a returned list crashes the server, so every list element is `coalesce`d; a `DELETE` and a `MERGE` in one statement silently create nothing, so they are separate statements; `shortestPath()` is only allowed in `WITH` / `RETURN`. Not used yet but available if path cost becomes weighted: `algo.SPpaths`, `algo.WCC`.

## 7. After a pass: the write-up, and what comes next

A pass ends when its experiment plans are approved. From the Saturation tab, **Write up pass N** assembles the pass into a document in the workspace's **Adam** folder, following the spec's mapping from artefacts to paper:

| Section | Comes from |
|---|---|
| Abstract, 1. Introduction | the question page (hunch, why, sub-questions, scope fence) |
| 2. Related work | the triaged papers by cluster with the saturation state, the verified claims with page and section, the Analyst's conflicts, untested assumptions and holes |
| 3. Methods | the methods dossier: each procedure with inputs, outputs, steps, what is still missing, and its sources |
| 4. Hypotheses and predictions | every brief of the pass with boundary, prediction, the signed kill criterion, and evidence for and against |
| 5. Experiment plans | the Designer's chains, controls and how the result maps to the kill criterion |
| 6. Results | empty until lab results are fed back as Result nodes |
| 7. Discussion, limitations, controls | the falsification log (every attack, its answer and status), rival explanations, open questions |
| References | every paper a cited claim came from, linked |

The narrative paragraphs (abstract, introduction, discussion) are written from the assembled facts only; everything else is the graph, with each claim citing its paper, page and section. Collaborators open it from the sidebar like any document, edit it, and run Check citations on it. The dashboard's Adam section lists each project with its phase, what it is waiting on, and how many write-ups it has.

What comes next, in order:

1. **Run the approved plans in the lab.** Results come back as nodes (add them as a paper or a note the Extractor can read, or record them as findings in the Notebook).
2. **Start the next pass** (Saturation tab). The Scoper rewrites the question page from what the attacks and gaps left open; saturated clusters are not swept again; the briefs' evidence is re-derived as new papers arrive.
3. **Re-sweep recent citations** between passes to keep the graph current; a brief whose evidence a new paper contradicts is flagged.
4. **Benchmark** (`scripts/adam-benchmark.ts`) against a review paper after each pass, and tune the Verifier's cut-offs, the merge distances and the saturation window on the graded sample.

Graph algorithms added for speed: `algo.WCC` gives the Analyst the weakly connected components in one call, so the per-pair link check runs only for clusters that could touch; `algo.SPpaths` (weighted by each prerequisite's time and cost on the `DEPENDS_ON` edge) adds the cheapest chains to the path search so a deep chain is never lost to the enumeration cap.
