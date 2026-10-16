// Cite Scout — one job: while someone writes, suggest citations for the sentence they're on,
// from every collaborator's library first, with the evidence and graph path behind each.
//
//   1. JEV gate      — does this sentence make a claim that needs a citation?
//   2. Graph search  — team library by meaning, full-text passages and keywords
//   3. JEV relevance — score every candidate against the sentence in one request
//   4. Provenance    — shortest citation chain from each pick to the user's own library
//   5. Proposals     — (Claim)-[:SUGGESTS_CITE {status:'suggested'}]->(Paper); dismissed ones never return

import { citationHref, citationLabel } from "../citations";
import { embedText } from "../graph/embeddings";
import { CLAIM_EXCLUSIONS, PATHS_TO_USER_LIBRARY, UPSERT_CITE_PROPOSALS } from "../graph/queries";
import { claimId } from "../graph/sync-document";
import { searchTeamLibrary, type TeamPaper } from "../graph/team-search";
import { needsCitation, scoreRelevance } from "../jev";
import { startRun, type AgentResult, type ProvenancePath } from "./base";
import { recall, SAME_IDEA_DISTANCE, type SimilarMemory } from "./historian";

/** Below this the sentence is treated as not needing a citation (opinion, transition, plan). */
const NEEDS_CITATION_MIN = 0.5;
/** Minimum JEV relevance (0..1, ~"related work" on the rubric) for a suggestion to be shown. */
const RELEVANCE_MIN = 0.5;
const MAX_SUGGESTIONS = 3;

export interface CiteSuggestion {
  paperId: string;
  title: string;
  /** "[Karpukhin et al., 2020]" */
  label: string;
  href: string;
  /** Collaborators who brought this paper in */
  owners: string[];
  /** True when it's already in the requesting user's own library */
  fromMyLibrary: boolean;
  relevance: number;
  confidence: number;
  /** Best matching passage from the paper's full text (evidence) */
  passage: string | null;
  /** Citation chain to the user's own library, when one exists */
  path: ProvenancePath | null;
  /** One-line, human explanation */
  reason: string;
}

export interface CiteScoutInput {
  workspaceId: string;
  userId: string;
  /** The paragraph being written */
  paragraph: string;
  /** Document, so proposals attach to the right claim */
  fileId?: string;
}

export interface CiteScoutResult extends AgentResult<CiteSuggestion> {
  /** The sentence Cite Scout looked at */
  sentence: string;
  /** JEV's probability that the sentence needs a citation */
  needsCitation: number | null;
  source: "jev" | "fallback" | null;
  /** A hypothesis the team already dropped that this sentence closely resembles */
  deadEnd: SimilarMemory | null;
}

/** The sentence to work on: the last complete one in the paragraph that has no citation yet. */
export function targetSentence(paragraph: string): string | null {
  const sentences = paragraph
    .split(/(?<=[.!?])\s+(?=["'(\[]?[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 30);
  for (let i = sentences.length - 1; i >= 0; i--) {
    if (!/\[[^\]]+\]\s*$/.test(sentences[i])) return sentences[i];
  }
  return null;
}

function reasonFor(s: Omit<CiteSuggestion, "reason">, userName: string): string {
  const owner = s.fromMyLibrary ? "your library" : `${s.owners.join(" & ")}'s library`;
  if (s.path && s.path.nodes.length > 1) {
    const mine = s.path.nodes[s.path.nodes.length - 1].label;
    const hops = s.path.nodes.length - 1;
    return `From ${owner}. ${hops === 1 ? "Directly linked by citation to" : "Two citation hops from"} ${userName === "you" ? "your" : `${userName}'s`} “${mine}”.`;
  }
  return `From ${owner}.`;
}

export async function runCiteScout(input: CiteScoutInput): Promise<CiteScoutResult> {
  const run = await startRun("cite-scout", input.workspaceId, { fileId: input.fileId, paragraph: input.paragraph.slice(0, 500) });
  const sentence = targetSentence(input.paragraph);
  const done = async (outcome: "ANSWERED" | "SKIPPED" | "NOT_IN_GRAPH", items: CiteSuggestion[], extra: Partial<CiteScoutResult> = {}) => ({
    ...(await run.finish(outcome, items, input.userId)),
    sentence: sentence ?? "",
    needsCitation: null,
    source: null,
    deadEnd: null,
    ...extra,
  });
  if (!sentence) return done("SKIPPED", []);

  // 1. Does it need a citation at all? (JEV, ~0.3s)
  const gate = await run.step("jev.needsCitation", () => needsCitation(sentence, input.paragraph), { source: "jev" });
  run.trace[run.trace.length - 1].source = gate.source;
  if (gate.result.value < NEEDS_CITATION_MIN) {
    return done("SKIPPED", [], { needsCitation: gate.result.value, source: gate.source });
  }

  // 2. Team library candidates, minus what's already cited or was dismissed for this claim
  const cId = input.fileId ? claimId(input.fileId, sentence) : null;
  const excluded = cId
    ? ((await run.graph.roQuery<{ paperId: string }>(CLAIM_EXCLUSIONS, { params: { claimId: cId } as never })).data ?? []).map(
        (r) => r.paperId,
      )
    : [];
  const vector = await embedText(sentence);
  // Historian: has the team already dropped a hypothesis like this one?
  const [deadEnd] = await run.step(
    "historian.recallDropped",
    () => recall({ workspaceId: input.workspaceId, vector, kind: "hypothesis", status: "dropped", limit: 1, maxDistance: SAME_IDEA_DISTANCE }),
    { source: "graph", cypher: "SIMILAR_MEMORIES" },
  );
  const candidates: TeamPaper[] = await run.step(
    "graph.searchTeamLibrary",
    () => searchTeamLibrary(input.workspaceId, sentence, { limit: 8, vector, exclude: excluded }),
    { source: "graph", cypher: "TEAM_VECTOR_SEARCH + TEAM_CHUNK_SEARCH + TEAM_FULLTEXT_SEARCH (RRF)", args: { k: 8 } },
  );
  if (!candidates.length) return done("NOT_IN_GRAPH", [], { needsCitation: gate.result.value, source: gate.source, deadEnd: deadEnd ?? null });

  // 3. Relevance of each candidate, judged on its best passage when we have one (one JEV call)
  const rel = await run.step(
    "jev.scoreRelevance",
    () =>
      scoreRelevance(
        sentence,
        candidates.map((c) => ({ id: c.paperId, title: c.title, abstract: c.passage?.text ?? c.abstract })),
      ),
    { args: { candidates: candidates.length } },
  );
  run.trace[run.trace.length - 1].source = rel.source;

  const ranked = candidates
    .map((c) => ({ c, j: rel.result.get(c.paperId) ?? { value: 0, confidence: 0 } }))
    .filter(({ j }) => j.value >= RELEVANCE_MIN)
    .sort((a, b) => b.j.value - a.j.value || b.j.confidence - a.j.confidence)
    .slice(0, MAX_SUGGESTIONS);
  if (!ranked.length) return done("NOT_IN_GRAPH", [], { needsCitation: gate.result.value, source: rel.source, deadEnd: deadEnd ?? null });

  // 4. Provenance: citation chain from each pick to the user's own library
  const paths = new Map<string, ProvenancePath>();
  const pathRows = await run.step(
    "graph.pathsToUserLibrary",
    async () =>
      (await run.graph.roQuery<{ paperId: string; nodeIds: string[]; titles: string[]; from: string[] }>(PATHS_TO_USER_LIBRARY, {
        params: { ids: ranked.map((r) => r.c.paperId), userId: input.userId } as never,
      })).data ?? [],
    { source: "graph", cypher: "PATHS_TO_USER_LIBRARY", args: { maxHops: 2 } },
  );
  for (const r of pathRows) {
    paths.set(r.paperId, {
      nodes: r.nodeIds.map((id, i) => ({ id, label: r.titles[i], kind: "Paper" as const })),
      rels: r.from.map((fromId, i) => (fromId === r.nodeIds[i] ? "CITES→" : "←CITES")),
    });
  }

  const items: CiteSuggestion[] = ranked.map(({ c, j }) => {
    const base = {
      paperId: c.paperId,
      title: c.title,
      label: citationLabel(c),
      href: citationHref(c),
      owners: c.owners,
      fromMyLibrary: c.ownerIds.includes(input.userId),
      relevance: j.value,
      confidence: j.confidence,
      passage: c.passage?.text.replace(/\s+/g, " ").trim().slice(0, 320) ?? null,
      path: paths.get(c.paperId) ?? null,
    };
    return { ...base, reason: reasonFor(base, "you") };
  });
  // Graph page: highlight suggested papers and their provenance chains
  for (const i of items) {
    run.highlight.add(i.paperId);
    i.path?.nodes.forEach((n) => run.highlight.add(n.id));
  }

  // 5. Proposals on the claim (only once the sentence has been saved and synced as a Claim)
  if (cId) {
    await run.step(
      "graph.recordProposals",
      () =>
        run.graph
          .query(UPSERT_CITE_PROPOSALS, {
            params: {
              claimId: cId,
              runId: run.runId,
              at: Date.now(),
              rows: items.map((i) => ({ paperId: i.paperId, relevance: i.relevance, confidence: i.confidence })),
            } as never,
          })
          .then((r) => r.data ?? []),
      { source: "graph", cypher: "UPSERT_CITE_PROPOSALS" },
    );
  }

  return done("ANSWERED", items, { needsCitation: gate.result.value, source: rel.source, deadEnd: deadEnd ?? null });
}
