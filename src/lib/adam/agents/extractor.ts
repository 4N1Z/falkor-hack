// Extractor — one job: one paper's full text in, one extraction card out (spec, Phase 2).
// It sees the paper's passages with their ids, pages and sections, and must quote a passage
// verbatim for every item: an item it cannot source, it cannot write. The card is written to
// the graph as nodes in state `extracted`; the Verifier (a different agent that never sees
// this reasoning) checks every quote against the source before anything counts.
// Dual extraction: for core and contradicting papers a second instance (slot b) works the
// same paper with a different order, temperature and wording; the Verifier compares them.

import type { Graph } from "falkordb";
import { startRun } from "../../agents/base";
import type { Section } from "../../graph/document-index";
import { embedTexts } from "../../graph/embeddings";
import { clip, structured } from "../llm";
import { spend } from "../project";
import {
  CREATE_CLAIMS,
  CREATE_CONDITIONS,
  CREATE_EVIDENCE,
  CREATE_OPEN_QUESTIONS,
  DELETE_CARD_ASSUMPTION_MENTIONS,
  DELETE_CARD_METHOD_MENTIONS,
  DELETE_CARD_NODES,
  LINK_ASSUMPTION_MENTION,
  LINK_CLAIM_DEPENDS,
  LINK_CLAIM_USES,
  LINK_EVIDENCE_SUPPORTS,
  LINK_FAILS_UNDER,
  LINK_METHOD_MENTION,
  PAPER_CHUNKS_FOR_PROMPT,
  PAPER_FOR_EXTRACTION,
  SET_PAPER_ADAM_STATE,
  SET_TRIAGE_NODE_COUNTS,
  UPSERT_CARD,
} from "../queries-extract";
import { resolveAssumption, resolveMethod, type MergeLog } from "../resolve";
import { ExtractionCardSchema, type ExtractionCard } from "../schemas";
import type { AdamProject } from "../types";

export type Slot = "a" | "b";

export interface PromptChunk {
  id: string;
  idx: number;
  text: string;
  page: number;
  section: Section;
  kind: string;
  locator: string | null;
  doc: string;
}

/** Above this many passages the paper is read in two calls (methods group, results group). */
const SINGLE_CALL_MAX_CHUNKS = 50;
const QUOTE_MAX = 400;

const SYSTEM = `You are the Extractor in a research-agent system whose premise is: a new result is a new combination of known steps. You read one paper and fill a fixed card. The card feeds a graph that other agents reason over, so precision and provenance matter more than coverage.

Rules you must follow:
1. Every item carries a chunkId that is one of the [c:…] ids shown, and a quote copied VERBATIM (20–400 characters, exact characters, no paraphrase, no ellipsis) from THAT chunk. An item you cannot quote, you must not write.
2. The item's section is the section shown in the chunk header. A statement from Discussion or Conclusion is marked speculative:true; Results and Methods statements are not.
3. Claims are precise: keep the numbers, the dataset, the conditions ("reduces Y by 40% at 37 °C on dataset Z"). One claim per finding. Do not restate the abstract; prefer Results.
4. Evidence is the figure, table, statistic or passage that backs a claim, with its locator ("Table 2", "Figure 3b", "n = 12"). Caption chunks are the best source for numbers.
5. Methods are techniques as the paper names them, with the parameters the paper gives (sizes, settings, versions). Methods matter as much as claims: the how is what gets reused.
6. Assumptions are what must be true for a claim to hold, stated or not ("the sample is homogeneous", "the baseline was tuned"). Link them to the claims that depend on them.
7. Limitations are the conditions under which the paper says its claims stop holding. Gaps are what the paper says nobody has tested. Contradictions are where it disagrees with prior work or itself.
8. Use short localIds (c1, e1, m1, a1, l1, g1) and reference them exactly in the ref lists. Stay within the maximum counts in the schema; choose the most important items.`;

const SLOT_B_NOTE = `This is an independent second reading of the paper. Read it fresh: do not assume what another reader found. Prefer the most defensible items; where the paper is ambiguous, say so with a lower confidence.`;

const header = (c: PromptChunk) => `[c:${c.id} | p.${c.page} | ${c.section} | ${c.kind}${c.locator ? ` ${c.locator}` : ""}${c.doc !== "body" ? ` | ${c.doc}` : ""}]`;
const render = (chunks: PromptChunk[]) => chunks.map((c) => `${header(c)}\n${c.text}`).join("\n\n");

const METHODS_GROUP: Section[] = ["front", "abstract", "introduction", "methods", "appendix", "supplementary"];

/** Split a long paper into the methods-side and results-side reads; unknown sections go to the smaller side. */
function groupChunks(chunks: PromptChunk[]): { methods: PromptChunk[]; results: PromptChunk[] } {
  const methods: PromptChunk[] = [];
  const results: PromptChunk[] = [];
  const unknown: PromptChunk[] = [];
  for (const c of chunks) (c.section === "unknown" ? unknown : METHODS_GROUP.includes(c.section) ? methods : results).push(c);
  for (const c of unknown) (methods.reduce((n, x) => n + x.text.length, 0) <= results.reduce((n, x) => n + x.text.length, 0) ? methods : results).push(c);
  const byIdx = (a: PromptChunk, b: PromptChunk) => a.idx - b.idx;
  return { methods: methods.sort(byIdx), results: results.sort(byIdx) };
}

const emptyCard = (): ExtractionCard => ({ claims: [], evidence: [], methods: [], assumptions: [], limitations: [], gaps: [], contradictions: [] });

function mergeCards(prefixA: string, a: ExtractionCard, prefixB: string, b: ExtractionCard): ExtractionCard {
  const re = (p: string) => (id: string) => (id.startsWith(`${p}-`) ? id : `${p}-${id}`);
  const tag = <T extends { localId: string }>(p: string, items: T[]) => items.map((it) => ({ ...it, localId: re(p)(it.localId) }));
  const refs = (p: string, ids: string[]) => ids.map(re(p));
  const fix = (p: string, card: ExtractionCard): ExtractionCard => ({
    claims: tag(p, card.claims).map((c) => ({ ...c, evidenceRefs: refs(p, c.evidenceRefs), methodRefs: refs(p, c.methodRefs), assumptionRefs: refs(p, c.assumptionRefs) })),
    evidence: tag(p, card.evidence),
    methods: tag(p, card.methods),
    assumptions: tag(p, card.assumptions).map((x) => ({ ...x, claimRefs: refs(p, x.claimRefs) })),
    limitations: tag(p, card.limitations).map((x) => ({ ...x, claimRefs: refs(p, x.claimRefs) })),
    gaps: tag(p, card.gaps),
    contradictions: card.contradictions.map((x) => ({ ...x, claimRef: re(p)(x.claimRef) })),
  });
  const A = fix(prefixA, a);
  const B = fix(prefixB, b);
  return {
    claims: [...A.claims, ...B.claims],
    evidence: [...A.evidence, ...B.evidence],
    methods: [...A.methods, ...B.methods],
    assumptions: [...A.assumptions, ...B.assumptions],
    limitations: [...A.limitations, ...B.limitations],
    gaps: [...A.gaps, ...B.gaps],
    contradictions: [...A.contradictions, ...B.contradictions],
  };
}

export interface ExtractResult {
  cardId: string;
  slot: Slot;
  calls: number;
  counts: Record<string, number>;
  dropped: number;
  merges: MergeLog[];
  nodesNew: number;
  nodesReused: number;
  abstractOnly: boolean;
}

export async function runExtractor(
  graph: Graph,
  workspaceId: string,
  project: AdamProject,
  paperId: string,
  slot: Slot,
  opts: { note?: string; heartbeat?: (p: Record<string, unknown>) => Promise<void>; log?: (m: string) => void } = {},
): Promise<ExtractResult> {
  const run = await startRun("adam-extractor", workspaceId, { projectId: project.id, paperId, slot });
  const beat = opts.heartbeat ?? (async () => {});
  const log = opts.log ?? (() => {});
  const params = <T>(p: T) => ({ params: p as never });

  const paper = (await graph.roQuery<{ paperId: string; title: string; abstract: string | null; year: number | null; chunks: number; textVersion: number; accessStatus: string }>(
    PAPER_FOR_EXTRACTION,
    params({ paperId }),
  )).data?.[0];
  if (!paper) throw new Error(`paper ${paperId} not in graph`);
  await graph.query(SET_PAPER_ADAM_STATE, params({ paperId, state: "extracting", at: Date.now(), projectId: project.id }));

  // Passages. An abstract-only paper is read from its abstract as one virtual passage; everything
  // it yields is capped at low confidence by the Verifier (spec: access status per paper).
  let chunks = (await graph.roQuery<PromptChunk>(PAPER_CHUNKS_FOR_PROMPT, params({ paperId }))).data ?? [];
  const abstractOnly = chunks.length === 0;
  if (abstractOnly) {
    if (!paper.abstract) throw new Error("paper has neither passages nor an abstract");
    chunks = [{ id: `${paperId}#abstract`, idx: 0, text: paper.abstract, page: 0, section: "abstract", kind: "body", locator: null, doc: "body" }];
  }
  if (slot === "b") {
    // A different reading order within each section keeps the second extractor independent
    const bySection = new Map<string, PromptChunk[]>();
    for (const c of chunks) bySection.set(c.section, [...(bySection.get(c.section) ?? []), c]);
    chunks = [...bySection.values()].flatMap((arr) => arr.reverse());
  }
  const chunkIds = new Set(chunks.map((c) => c.id));
  const chunkById = new Map(chunks.map((c) => [c.id, c]));

  // 1. Read (one call, or methods-side then results-side with the found methods carried over)
  const intro = `Paper: ${paper.title}${paper.year ? ` (${paper.year})` : ""}${abstractOnly ? "\nOnly the abstract is available; extract what it states and nothing more." : ""}${opts.note ? `\nNote from the researcher on the previous card: ${opts.note}` : ""}${slot === "b" ? `\n${SLOT_B_NOTE}` : ""}`;
  const tier = "heavy" as const;
  const temperature = slot === "b" ? 0.6 : 0.2;
  let card: ExtractionCard;
  let calls = 0;
  if (chunks.length <= SINGLE_CALL_MAX_CHUNKS) {
    const r = await run.step(
      "llm.extract",
      () => structured({ graph, projectId: project.id, schema: ExtractionCardSchema, system: SYSTEM, prompt: `${intro}\n\n${render(chunks)}`, tier, temperature, maxTokens: 14000, label: `extract:${paperId}:${slot}` }),
      { source: "llm" },
    );
    card = r.object;
    calls = r.attempts;
  } else {
    const { methods, results } = groupChunks(chunks);
    const m = await run.step(
      "llm.extract.methods",
      () =>
        structured({
          graph,
          projectId: project.id,
          schema: ExtractionCardSchema,
          system: SYSTEM,
          prompt: `${intro}\n\nThis is the first of two reads: the front matter, methods and appendices. Focus on methods, assumptions and the claims these sections make.\n\n${render(methods)}`,
          tier,
          temperature,
          maxTokens: 14000,
          label: `extract:${paperId}:${slot}:methods`,
        }),
      { source: "llm" },
    );
    await beat({ step: "read-methods" });
    const known = m.object.methods.map((x) => `- m-${x.localId}: ${x.name}`).join("\n");
    const r = await run.step(
      "llm.extract.results",
      () =>
        structured({
          graph,
          projectId: project.id,
          schema: ExtractionCardSchema,
          system: SYSTEM,
          prompt: `${intro}\n\nThis is the second of two reads: results, discussion, limitations and conclusions. Focus on claims with their evidence, limitations, gaps and contradictions.\nMethods already found in the first read (reference them by these ids in methodRefs instead of re-describing them):\n${known || "(none)"}\n\n${render(results)}`,
          tier,
          temperature,
          maxTokens: 14000,
          label: `extract:${paperId}:${slot}:results`,
        }),
      { source: "llm" },
    );
    card = mergeCards("m", m.object, "r", r.object);
    calls = m.attempts + r.attempts;
  }
  await beat({ step: "read", calls });

  // 2. Guards: a chunkId the paper does not have is repaired from the quote when the quote can be
  // found (models echo the "c:" prefix or pick a neighbouring chunk); otherwise the item is dropped.
  // The Verifier does the fine check afterwards; this only keeps unsourced items out of the graph.
  let dropped = 0;
  const normQ = (s: string) => s.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, " ").trim();
  const normChunks = chunks.map((c) => ({ id: c.id, text: normQ(c.text) }));
  const keepItem = <T extends { chunkId: string; quote: string }>(it: T): boolean => {
    it.chunkId = it.chunkId.trim().replace(/^c:/i, "");
    it.quote = clip(it.quote.trim(), QUOTE_MAX);
    if (chunkIds.has(it.chunkId)) return true;
    const q = normQ(it.quote);
    const probe = q.length > 60 ? q.slice(0, 60) : q;
    const found = probe.length >= 15 ? normChunks.find((c) => c.text.includes(probe)) : undefined;
    if (found) {
      it.chunkId = found.id;
      return true;
    }
    dropped++;
    return false;
  };
  card.claims = card.claims.filter(keepItem);
  card.evidence = card.evidence.filter(keepItem);
  card.methods = card.methods.filter(keepItem);
  card.assumptions = card.assumptions.filter(keepItem);
  card.limitations = card.limitations.filter(keepItem);
  card.gaps = card.gaps.filter(keepItem);
  card.contradictions = card.contradictions.filter((x) => chunkIds.has(x.chunkId));
  const claimIds = new Set(card.claims.map((c) => c.localId));

  // 3. Replace this slot's previous card (idempotent re-runs), then write
  const cardId = `card:${project.id.slice(0, 8)}:${paperId}:${slot}`;
  await graph.query(DELETE_CARD_METHOD_MENTIONS, params({ cardId }));
  await graph.query(DELETE_CARD_ASSUMPTION_MENTIONS, params({ cardId }));
  await graph.query(DELETE_CARD_NODES, params({ cardId }));

  const at = Date.now();
  const nodeId = (kind: string, localId: string) => `${kind}:${project.id.slice(0, 8)}:${paperId}:${slot}:${localId}`;
  const pageOf = (chunkId: string) => chunkById.get(chunkId)?.page ?? 0;
  const locatorOf = (chunkId: string) => chunkById.get(chunkId)?.locator ?? null;
  const merges: MergeLog[] = [];
  let nodesNew = 0;
  let nodesReused = 0;

  const claimVecs = card.claims.length ? await embedTexts(card.claims.map((c) => c.text), "document") : [];
  if (card.claims.length) {
    await graph.query(
      CREATE_CLAIMS,
      params({
        projectId: project.id,
        paperId,
        cardId,
        slot,
        runId: run.runId,
        textVersion: paper.textVersion,
        at,
        rows: card.claims.map((c, i) => ({
          id: nodeId("claim", c.localId),
          localId: c.localId,
          text: c.text,
          section: c.section,
          speculative: c.speculative,
          conditions: c.conditions,
          quote: c.quote,
          chunkId: c.chunkId,
          page: pageOf(c.chunkId),
          locator: locatorOf(c.chunkId),
          contradictions: JSON.stringify(card.contradictions.filter((x) => x.claimRef === c.localId)),
          confidence: c.confidence,
          embedding: claimVecs[i],
        })),
      }),
    );
    nodesNew += card.claims.length;
  }

  if (card.evidence.length) {
    await graph.query(
      CREATE_EVIDENCE,
      params({
        projectId: project.id,
        paperId,
        cardId,
        slot,
        runId: run.runId,
        textVersion: paper.textVersion,
        at,
        rows: card.evidence.map((e) => ({ id: nodeId("evidence", e.localId), localId: e.localId, text: e.text, kind: e.kind, locator: e.locator ?? null, quote: e.quote, chunkId: e.chunkId, page: pageOf(e.chunkId), confidence: e.confidence })),
      }),
    );
    nodesNew += card.evidence.length;
    const links = card.claims.flatMap((c) => c.evidenceRefs.filter((r) => card.evidence.some((e) => e.localId === r)).map((r) => ({ evidenceId: nodeId("evidence", r), claimId: nodeId("claim", c.localId) })));
    if (links.length) await graph.query(LINK_EVIDENCE_SUPPORTS, params({ rows: links, by: "agent:adam-extractor", runId: run.runId, at }));
  }

  // Methods and assumptions are shared across papers: resolve, then link this paper's mention
  const methodIdByLocal = new Map<string, string>();
  const methodVecs = card.methods.length ? await embedTexts(card.methods.map((m) => m.name), "document") : [];
  for (const [i, m] of card.methods.entries()) {
    const r = await resolveMethod(graph, { projectId: project.id, paperId, name: m.name, quote: m.quote, chunkId: m.chunkId, page: pageOf(m.chunkId), confidence: m.confidence, runId: run.runId, embedding: methodVecs[i] }, merges);
    methodIdByLocal.set(m.localId, r.id);
    r.created ? nodesNew++ : nodesReused++;
    await graph.query(
      LINK_METHOD_MENTION,
      params({ methodId: r.id, paperId, cardId, localId: m.localId, quote: m.quote, chunkId: m.chunkId, page: pageOf(m.chunkId), parameters: m.parameters, name: m.name, confidence: m.confidence, runId: run.runId, at, slot }),
    );
  }
  const uses = card.claims.flatMap((c) =>
    c.methodRefs
      .filter((r) => methodIdByLocal.has(r))
      .map((r) => ({ claimId: nodeId("claim", c.localId), methodId: methodIdByLocal.get(r)!, parameters: card.methods.find((m) => m.localId === r)?.parameters ?? [] })),
  );
  if (uses.length) await graph.query(LINK_CLAIM_USES, params({ rows: uses, by: "agent:adam-extractor", runId: run.runId, at }));

  const assumptionIdByLocal = new Map<string, string>();
  const assumptionVecs = card.assumptions.length ? await embedTexts(card.assumptions.map((a) => a.text), "document") : [];
  for (const [i, a] of card.assumptions.entries()) {
    const r = await resolveAssumption(
      graph,
      { projectId: project.id, paperId, cardId, slot, localId: a.localId, text: a.text, stated: a.stated, quote: a.quote, chunkId: a.chunkId, page: pageOf(a.chunkId), confidence: a.confidence, runId: run.runId, textVersion: paper.textVersion, embedding: assumptionVecs[i] },
      merges,
    );
    assumptionIdByLocal.set(a.localId, r.id);
    r.created ? nodesNew++ : nodesReused++;
    await graph.query(LINK_ASSUMPTION_MENTION, params({ assumptionId: r.id, paperId, cardId, quote: a.quote, chunkId: a.chunkId, page: pageOf(a.chunkId), runId: run.runId, at }));
  }
  const depends = [
    ...card.claims.flatMap((c) => c.assumptionRefs.filter((r) => assumptionIdByLocal.has(r)).map((r) => ({ claimId: nodeId("claim", c.localId), assumptionId: assumptionIdByLocal.get(r)! }))),
    ...card.assumptions.flatMap((a) => a.claimRefs.filter((r) => claimIds.has(r)).map((r) => ({ claimId: nodeId("claim", r), assumptionId: assumptionIdByLocal.get(a.localId)! }))),
  ];
  if (depends.length) await graph.query(LINK_CLAIM_DEPENDS, params({ rows: depends, by: "agent:adam-extractor", runId: run.runId, at }));

  if (card.limitations.length) {
    await graph.query(
      CREATE_CONDITIONS,
      params({
        projectId: project.id,
        paperId,
        cardId,
        slot,
        runId: run.runId,
        textVersion: paper.textVersion,
        at,
        rows: card.limitations.map((l) => ({ id: nodeId("condition", l.localId), localId: l.localId, text: l.text, quote: l.quote, chunkId: l.chunkId, page: pageOf(l.chunkId), confidence: l.confidence })),
      }),
    );
    nodesNew += card.limitations.length;
    const fails = card.limitations.flatMap((l) => l.claimRefs.filter((r) => claimIds.has(r)).map((r) => ({ claimId: nodeId("claim", r), conditionId: nodeId("condition", l.localId) })));
    if (fails.length) await graph.query(LINK_FAILS_UNDER, params({ rows: fails, by: "agent:adam-extractor", runId: run.runId, at }));
  }

  if (card.gaps.length) {
    await graph.query(
      CREATE_OPEN_QUESTIONS,
      params({
        projectId: project.id,
        paperId,
        cardId,
        slot,
        runId: run.runId,
        textVersion: paper.textVersion,
        at,
        rows: card.gaps.map((g) => ({ id: nodeId("gap", g.localId), localId: g.localId, text: g.text, quote: g.quote, chunkId: g.chunkId, page: pageOf(g.chunkId), confidence: g.confidence })),
      }),
    );
    nodesNew += card.gaps.length;
  }

  const counts = { claims: card.claims.length, evidence: card.evidence.length, methods: card.methods.length, assumptions: card.assumptions.length, limitations: card.limitations.length, gaps: card.gaps.length, contradictions: card.contradictions.length };
  await graph.query(UPSERT_CARD, params({ id: cardId, projectId: project.id, paperId, slot, runId: run.runId, at, textVersion: paper.textVersion, counts: JSON.stringify(counts), calls }));
  if (slot === "a") await graph.query(SET_TRIAGE_NODE_COUNTS, params({ projectId: project.id, paperId, nodesNew, nodesReused, at }));
  await graph.query(SET_PAPER_ADAM_STATE, params({ paperId, state: "extracted", at: Date.now(), projectId: project.id }));
  await spend(graph, project.id, { papers: 0 });

  run.highlight.add(paperId);
  log(`card ${slot}: ${JSON.stringify(counts)}, dropped ${dropped}, merges ${merges.length}`);
  const result: ExtractResult = { cardId, slot, calls, counts, dropped, merges, nodesNew, nodesReused, abstractOnly };
  await run.finish("ANSWERED", [result], project.createdBy);
  return result;
}
