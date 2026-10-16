import { requireWorkspaceMember } from "@/app/api/papers/_access";
import type { Verdict } from "@/lib/agents/citation-checker";
import { getWorkspaceGraph } from "@/lib/graph/client";
import { EVIDENCE_CITES, EVIDENCE_CLAIMS, EVIDENCE_SUGGESTIONS, VIEW_CITES, WORKSPACE_USERS } from "@/lib/graph/queries";
import type { SupportLevel } from "@/lib/jev";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export interface EvidenceClaim {
  id: string;
  /** 1-based position in the document */
  n: number;
  text: string;
  /** Citation Checker's latest verdict (null until the draft has been checked) */
  verdict: Verdict | null;
  why: string | null;
  checkedAt: number | null;
  /** Citation links in the sentence (resolved or not) */
  urlCount: number;
}

export interface EvidencePaper {
  id: string;
  title: string;
  year: number | null;
  inLibrary: boolean;
  ownerIds: string[];
  /** How many claims cite it */
  citedBy: number;
}

export interface EvidenceLink {
  claimId: string;
  paperId: string;
  kind: "cites" | "suggested";
  /** For citations: the checker's support level for this claim–paper pair */
  level: SupportLevel | null;
  /** For suggestions: which agent proposed it */
  by: string | null;
}

export interface EvidenceResponse {
  claims: EvidenceClaim[];
  papers: EvidencePaper[];
  links: EvidenceLink[];
  /** Citations between the papers shown (paper → paper) */
  paperCites: { source: string; target: string }[];
  users: { id: string; name: string }[];
}

type PaperRow = { claimId: string; paperId: string; title: string; year: number | null; inLibrary: boolean; ownerIds: string[] };

/**
 * GET /api/graph/[workspaceId]/evidence?fileId=
 * One document's argument as a graph: claims → the papers they cite (with the checker's
 * support level) and the papers agents suggest for them, plus citations among those papers.
 */
export async function GET(req: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const access = await requireWorkspaceMember(workspaceId);
  if ("error" in access) return access.error;
  const fileId = new URL(req.url).searchParams.get("fileId");
  if (!fileId) return NextResponse.json({ error: "fileId is required" }, { status: 400 });

  const graph = await getWorkspaceGraph(workspaceId);
  const q = <T,>(cypher: string, p: Record<string, unknown> = {}) =>
    graph.roQuery<T>(cypher, { params: p as never }).then((r) => (r.data ?? []) as T[]);

  const [claimRows, citeRows, suggestionRows, users] = await Promise.all([
    q<{ id: string; text: string; ord: number; verdict: Verdict | null; why: string | null; checkedAt: number | null; urlCount: number }>(
      EVIDENCE_CLAIMS,
      { fileId },
    ),
    q<PaperRow & { level: SupportLevel | null; score: number | null }>(EVIDENCE_CITES, { fileId }),
    q<PaperRow & { by: string | null; relevance: number }>(EVIDENCE_SUGGESTIONS, { fileId }),
    q<{ id: string; name: string }>(WORKSPACE_USERS),
  ]);

  const claims: EvidenceClaim[] = claimRows.map((c, i) => ({
    id: c.id,
    n: i + 1,
    text: c.text,
    verdict: c.verdict ?? null,
    why: c.why ?? null,
    checkedAt: c.checkedAt ?? null,
    urlCount: c.urlCount,
  }));

  const papers = new Map<string, EvidencePaper>();
  const addPaper = (r: PaperRow) => {
    if (!papers.has(r.paperId))
      papers.set(r.paperId, { id: r.paperId, title: r.title, year: r.year, inLibrary: r.inLibrary, ownerIds: r.ownerIds ?? [], citedBy: 0 });
  };

  const links: EvidenceLink[] = [];
  const cited = new Set<string>();
  for (const r of citeRows) {
    const key = `${r.claimId}>${r.paperId}`;
    if (cited.has(key)) continue;
    cited.add(key);
    addPaper(r);
    papers.get(r.paperId)!.citedBy++;
    links.push({ claimId: r.claimId, paperId: r.paperId, kind: "cites", level: r.level ?? null, by: null });
  }
  // At most two open suggestions per claim, never for a paper it already cites
  const perClaim = new Map<string, number>();
  for (const r of suggestionRows) {
    if (cited.has(`${r.claimId}>${r.paperId}`) || (perClaim.get(r.claimId) ?? 0) >= 2) continue;
    perClaim.set(r.claimId, (perClaim.get(r.claimId) ?? 0) + 1);
    addPaper(r);
    links.push({ claimId: r.claimId, paperId: r.paperId, kind: "suggested", level: null, by: r.by });
  }

  // Claims checked before verdicts were stored on the claim: derive it from the support edges
  // (any contradiction wins, otherwise the best-supporting source), as the Checker does
  for (const c of claims) {
    if (c.verdict) continue;
    const levels = links.filter((l) => l.claimId === c.id && l.kind === "cites" && l.level).map((l) => l.level!);
    if (!levels.length) continue;
    c.verdict = levels.includes("contradicts")
      ? "contradicted"
      : levels.includes("supports")
        ? "supported"
        : levels.includes("partial")
          ? "weak"
          : "unsupported";
  }

  const paperCites = papers.size ? await q<{ source: string; target: string }>(VIEW_CITES, { ids: [...papers.keys()] }) : [];

  return NextResponse.json({ claims, papers: [...papers.values()], links, paperCites, users } satisfies EvidenceResponse);
}
