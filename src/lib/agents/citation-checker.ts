// Citation Checker — one job: check every claim in a draft against the research graph.
// For each sentence (Claim) it asks: is it cited? does the cited paper's actual text support
// it? and if uncited, does it need a citation (and which team paper fits)? Each verdict
// carries the evidence passage and is recorded as a SUPPORTED_BY proposal edge.

import { citationLabel } from "../citations";
import { embedText, embedTexts } from "../graph/embeddings";
import {
  BEST_PASSAGES_IN_PAPERS,
  DOCUMENT_CLAIMS,
  SET_CLAIM_VERDICT,
  UPSERT_CHECKER_SUGGESTION,
  UPSERT_SUPPORT_VERDICT,
} from "../graph/queries";
import { searchTeamLibrary } from "../graph/team-search";
import { needsCitation, scoreSupport, type SupportLevel } from "../jev";
import { CLAIMS_OF_PAPERS } from "../adam/queries-review";
import { startRun, type AgentResult } from "./base";

/** A verified adam claim this close (cosine distance) to the draft sentence is the evidence to judge on. */
const CLAIM_MATCH_DISTANCE = 0.3;

export type Verdict = "supported" | "weak" | "unsupported" | "contradicted" | "uncited" | "unknown-source" | "ok";

const LEVEL_TO_VERDICT: Record<SupportLevel, Verdict> = {
  supports: "supported",
  partial: "weak",
  unrelated: "unsupported",
  contradicts: "contradicted",
};

export interface CheckedSource {
  paperId: string;
  title: string;
  label: string;
  owners: string[];
  level: SupportLevel;
  score: number;
  confidence: number;
  /** The passage the verdict was judged on: a verified adam claim (with page and section), a full-text passage, or the abstract */
  evidence: string | null;
  evidenceKind: "claim" | "passage" | "abstract" | "none";
  /** For adam claims: where in the paper the claim was made */
  page?: number | null;
  section?: string | null;
}

export interface ClaimCheck {
  claimId: string;
  text: string;
  order: number;
  verdict: Verdict;
  /** Plain-language explanation for the verdict */
  why: string;
  sources: CheckedSource[];
  /** For uncited claims: the best team-library paper to cite */
  suggestion: { paperId: string; title: string; label: string; owners: string[] } | null;
  needsCitation: number | null;
}

const SEVERITY: Verdict[] = ["contradicted", "unsupported", "unknown-source", "uncited", "weak", "supported", "ok"];

async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

export async function runCitationCheck(input: { workspaceId: string; fileId: string; userId: string }): Promise<AgentResult<ClaimCheck>> {
  const run = await startRun("citation-checker", input.workspaceId, { fileId: input.fileId });

  type Row = {
    claimId: string;
    text: string;
    ord: number;
    urlCount: number;
    paperId: string | null;
    title: string | null;
    abstract: string | null;
    year: number | null;
    owners: string[];
  };
  const rows = await run.step(
    "graph.documentClaims",
    async () => (await run.graph.roQuery<Row>(DOCUMENT_CLAIMS, { params: { fileId: input.fileId } as never })).data ?? [],
    { source: "graph", cypher: "DOCUMENT_CLAIMS" },
  );
  if (!rows.length) return run.finish("NOT_IN_GRAPH", [], input.userId);

  // Group rows into claims with their cited papers
  const claims = new Map<string, { text: string; order: number; urlCount: number; papers: Row[] }>();
  for (const r of rows) {
    const c = claims.get(r.claimId) ?? { text: r.text, order: r.ord, urlCount: r.urlCount, papers: [] };
    if (r.paperId) c.papers.push(r);
    claims.set(r.claimId, c);
  }
  const list = [...claims.entries()].map(([claimId, c]) => ({ claimId, ...c }));
  const vectors = await run.step("embed.claims", () => embedTexts(list.map((c) => c.text)), { source: "llm" });
  const vecOf = new Map(list.map((c, i) => [c.claimId, vectors[i]]));

  const checks = await run.step(
    "check.claims",
    () =>
      mapLimit(list, 4, async (c): Promise<ClaimCheck> => {
        const base = { claimId: c.claimId, text: c.text, order: c.order, sources: [], suggestion: null, needsCitation: null };

        // Cited: judge each cited paper on its passage closest to the claim
        if (c.papers.length) {
          const ids = c.papers.map((p) => p.paperId!);
          const passages =
            (await run.graph.roQuery<{ paperId: string; text: string }>(BEST_PASSAGES_IN_PAPERS, {
              params: { v: vecOf.get(c.claimId)!, k: 400, paperIds: ids } as never,
            })).data ?? [];
          const best = new Map<string, string>();
          for (const p of passages) if (!best.has(p.paperId)) best.set(p.paperId, p.text);
          // Adam: a verified claim of the cited paper, with its page and section, beats a raw passage
          const claims =
            (await run.graph
              .roQuery<{ paperId: string; claimId: string; text: string; page: number; section: string; speculative: boolean; score: number }>(CLAIMS_OF_PAPERS, {
                params: { v: vecOf.get(c.claimId)!, k: 200, paperIds: ids } as never,
              })
              .catch(() => ({ data: [] }))).data ?? [];
          const bestClaim = new Map<string, (typeof claims)[number]>();
          for (const cl of claims) if (cl.score <= CLAIM_MATCH_DISTANCE && !bestClaim.has(cl.paperId)) bestClaim.set(cl.paperId, cl);

          const evidence = c.papers.map((p) => {
            const claim = bestClaim.get(p.paperId!);
            const passage = best.get(p.paperId!);
            return {
              p,
              text: claim?.text ?? passage ?? p.abstract ?? null,
              kind: (claim ? "claim" : passage ? "passage" : p.abstract ? "abstract" : "none") as CheckedSource["evidenceKind"],
              page: claim?.page ?? null,
              section: claim?.section ?? null,
              speculative: claim?.speculative ?? false,
            };
          });
          const judged = await scoreSupport(
            c.text,
            evidence.map((e) => ({ id: e.p.paperId!, title: e.p.title ?? "", abstract: e.text })),
          );
          const sources: CheckedSource[] = evidence.map((e) => {
            const j = judged.result.get(e.p.paperId!)!;
            return {
              paperId: e.p.paperId!,
              title: e.p.title ?? "",
              label: citationLabel({ authors: [], year: e.p.year, title: e.p.title ?? "" }),
              owners: e.p.owners,
              level: j.level,
              score: j.value,
              confidence: j.confidence,
              evidence: e.text?.replace(/\s+/g, " ").trim().slice(0, 360) ?? null,
              evidenceKind: e.kind,
              page: e.page,
              section: e.section,
            };
          });
          // The claim is as good as its best source, but any contradiction is surfaced
          const verdict = sources.some((s) => s.level === "contradicts")
            ? "contradicted"
            : LEVEL_TO_VERDICT[[...sources].sort((a, b) => b.score - a.score)[0].level];
          const lead = sources.find((s) => LEVEL_TO_VERDICT[s.level] === verdict) ?? sources[0];
          // A verified adam claim says where in the paper the judgement comes from
          const where = lead.evidenceKind === "claim" ? ` (a verified ${lead.section || "paper"} claim${lead.page ? ` on p.${lead.page}` : ""})` : "";
          const why = {
            contradicted: `“${lead.title}” says the opposite of this claim${where}.`,
            unsupported: `“${lead.title}” doesn't address this claim. It may be the wrong citation.`,
            weak: `“${lead.title}” only partly supports this claim${where}. Consider softening it or adding a source.`,
            supported: `“${lead.title}” supports this claim${where}.`,
          }[verdict as "contradicted" | "unsupported" | "weak" | "supported"];
          return { ...base, verdict, why, sources };
        }

        // Has citation links, but none resolved to a paper in the graph
        if (c.urlCount > 0) {
          return {
            ...base,
            verdict: "unknown-source",
            why: "Cites a source that isn't in your team's research graph, so it can't be checked. Add it to the library.",
          };
        }

        // Uncited: does it need one? If so, the best team paper to cite
        const gate = await needsCitation(c.text);
        if (gate.result.value < 0.5) {
          return { ...base, verdict: "ok", why: "Doesn't need a citation.", needsCitation: gate.result.value };
        }
        const [top] = await searchTeamLibrary(input.workspaceId, c.text, { limit: 1, vector: vecOf.get(c.claimId) });
        return {
          ...base,
          verdict: "uncited",
          needsCitation: gate.result.value,
          why: top
            ? `Needs a citation. Your team has “${top.title}”.`
            : "Needs a citation, and nothing in your team's library covers it yet.",
          suggestion: top ? { paperId: top.paperId, title: top.title, label: citationLabel(top), owners: top.owners } : null,
        };
      }),
    { source: "jev", args: { claims: list.length } },
  );

  // Record verdicts as proposals on the claims
  const at = Date.now();
  await run.step(
    "graph.recordVerdicts",
    async () => {
      for (const c of checks) {
        for (const s of c.sources) {
          await run.graph.query(UPSERT_SUPPORT_VERDICT, {
            params: { claimId: c.claimId, paperId: s.paperId, level: s.level, score: s.score, confidence: s.confidence, runId: run.runId, at } as never,
          });
        }
        // The verdict lives on the claim too, so the evidence map can draw it without re-checking
        await run.graph.query(SET_CLAIM_VERDICT, {
          params: { claimId: c.claimId, verdict: c.verdict, why: c.why, at, runId: run.runId } as never,
        });
        if (c.suggestion) {
          await run.graph.query(UPSERT_CHECKER_SUGGESTION, {
            params: { claimId: c.claimId, paperId: c.suggestion.paperId, runId: run.runId, at } as never,
          });
        }
      }
      return checks.flatMap((c) => c.sources);
    },
    { source: "graph", cypher: "UPSERT_SUPPORT_VERDICT" },
  );

  checks.sort((a, b) => a.order - b.order);
  // Graph page: highlight every cited paper that was judged, and suggested fixes
  for (const c of checks) {
    c.sources.forEach((s) => run.highlight.add(s.paperId));
    if (c.suggestion) run.highlight.add(c.suggestion.paperId);
  }
  return run.finish("ANSWERED", checks, input.userId);
}

/** Sort key used by the UI: worst problems first. */
export const verdictSeverity = (v: Verdict) => SEVERITY.indexOf(v);

// Unused-import guard for embedText (kept for single-claim checks from other agents)
export const embedClaim = embedText;
