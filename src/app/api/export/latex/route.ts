import { requireWorkspaceMember } from "@/app/api/papers/_access";
import { auth } from "@/auth";
import { latexFileName, toLatex, type LatexPaper } from "@/lib/export/latex";
import { getWorkspaceGraph } from "@/lib/graph/client";
import { EXPORT_PAPERS_BY_ID, RESOLVE_CITED_PAPERS } from "@/lib/graph/queries";
import { parseCitationUrl, type CitationKey, type DocNode } from "@/lib/graph/sync-document";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Every link href in the document, in order of first appearance. */
function collectLinks(doc: DocNode): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (n: DocNode) => {
    const href = n.marks?.find((m) => m.type === "link")?.attrs?.href;
    if (href && !seen.has(href)) {
      seen.add(href);
      out.push(href);
    }
    n.content?.forEach(walk);
  };
  walk(doc);
  return out;
}

/**
 * POST /api/export/latex { workspaceId, fileId, title, content }
 * Returns a .tex file: the draft as LaTeX, citations as \citep{} with a BibTeX section built
 * from the papers in the workspace graph.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { workspaceId?: string; fileId?: string; title?: string; content?: DocNode };
  const access = await requireWorkspaceMember(body.workspaceId);
  if ("error" in access) return access.error;
  if (!body.content || typeof body.content !== "object") return NextResponse.json({ error: "content is required" }, { status: 400 });

  try {
    const hrefs = collectLinks(body.content);
    const keyed = hrefs.map((href) => [href, parseCitationUrl(href)] as const).filter((x): x is readonly [string, CitationKey] => !!x[1]);

    const papers = new Map<string, LatexPaper>();
    if (keyed.length) {
      const graph = await getWorkspaceGraph(access.workspaceId);
      const all = keyed.map(([, k]) => k);
      const resolved =
        (await graph.roQuery<{ paperId: string; doi: string | null; arxivId: string | null; s2Id: string | null }>(RESOLVE_CITED_PAPERS, {
          params: {
            dois: all.map((k) => k.doi).filter(Boolean),
            arxivIds: all.map((k) => k.arxivId).filter(Boolean),
            s2Ids: all.map((k) => k.s2Id).filter(Boolean),
            paperIds: all.map((k) => k.paperId).filter(Boolean),
          } as never,
        })).data ?? [];
      const idFor = (k: CitationKey) =>
        resolved.find(
          (p) => (k.doi && p.doi === k.doi) || (k.arxivId && p.arxivId === k.arxivId) || (k.s2Id && p.s2Id === k.s2Id) || (k.paperId && p.paperId === k.paperId),
        )?.paperId;
      const hrefToId = new Map(keyed.map(([href, k]) => [href, idFor(k)] as const).filter((x): x is readonly [string, string] => !!x[1]));
      const ids = [...new Set(hrefToId.values())];
      const rows = ids.length
        ? ((await graph.roQuery<Omit<LatexPaper, "authors"> & { authorRows: { name: string; pos: number }[] }>(EXPORT_PAPERS_BY_ID, { params: { ids } as never })).data ?? [])
        : [];
      const byId = new Map(
        rows.map(({ authorRows, ...p }) => [p.paperId, { ...p, authors: [...authorRows].sort((a, b) => a.pos - b.pos).map((a) => a.name) } satisfies LatexPaper]),
      );
      for (const [href, id] of hrefToId) {
        const p = byId.get(id);
        if (p) papers.set(href, p);
      }
    }

    const session = await auth();
    const title = body.title?.trim() || "Untitled";
    const bibName = latexFileName(title);
    const { tex, citations, unresolved } = toLatex({ title, author: session?.user?.name ?? null, doc: body.content, papers, bibName });

    return new NextResponse(tex, {
      headers: {
        "Content-Type": "application/x-tex; charset=utf-8",
        "Content-Disposition": `attachment; filename="${bibName}.tex"`,
        "X-Citations": String(citations),
        "X-Unresolved": String(unresolved),
      },
    });
  } catch (err) {
    console.error("[export/latex] failed", err);
    return NextResponse.json({ error: "Couldn't export LaTeX right now." }, { status: 500 });
  }
}
