/**
 * Re-index team papers to the section-aware chunk schema (document-index.ts v2): page
 * numbers, sections, captions. Picks every library paper whose chunks are older than
 * schema 2 (or all with --all), reads its uploaded file (Postgres papers.uploadUrl) or its
 * arXiv PDF, and replaces its body passages.
 *
 *   node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/reindex-fulltext.ts <workspaceId> [--all] [--max=150]
 */
import { eq } from "drizzle-orm";
import db from "../src/db";
import { papers } from "../src/db/schema";
import { getFalkor, getWorkspaceGraph } from "../src/lib/graph/client";
import { fetchDocumentText, indexPaperText } from "../src/lib/graph/document-index";
import { SET_PAPER_ACCESS } from "../src/lib/graph/queries";

async function main() {
  const workspaceId = process.argv[2];
  if (!workspaceId) throw new Error("usage: reindex-fulltext.ts <workspaceId> [--all] [--max=N]");
  const all = process.argv.includes("--all");
  const maxChunks = Number(process.argv.find((a) => a.startsWith("--max="))?.slice(6) ?? 150);

  const graph = await getWorkspaceGraph(workspaceId);
  const todo =
    (await graph.roQuery<{ paperId: string; pgPaperId: string | null; title: string; arxivId: string | null; schema: number }>(
      `MATCH (:User)-[:IMPORTED]->(p:Paper)
       WHERE ${all ? "true" : "coalesce(p.chunkSchema, 1) < 2"}
       RETURN DISTINCT p.paperId AS paperId, p.pgPaperId AS pgPaperId, p.title AS title, p.arxivId AS arxivId,
              coalesce(p.chunkSchema, 1) AS schema`,
    )).data ?? [];
  console.log(`${todo.length} team papers to re-index (schema < 2${all ? ", --all" : ""})`);

  let total = 0;
  for (const p of todo) {
    const t = Date.now();
    let url: string | null = null;
    // Seeded demo papers carry ids like "seed-2005.11401", which have no Postgres row
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.pgPaperId ?? "");
    if (p.pgPaperId && isUuid) {
      const [row] = await db.select({ uploadUrl: papers.uploadUrl }).from(papers).where(eq(papers.id, p.pgPaperId));
      url = row?.uploadUrl ?? null;
    }
    if (!url && p.arxivId) url = `https://arxiv.org/pdf/${p.arxivId}`;
    if (!url) {
      console.log(`  – ${p.title.slice(0, 60)} — no file`);
      if (p.pgPaperId) await graph.query(SET_PAPER_ACCESS, { params: { pgIds: [p.pgPaperId], state: "no_file" } as never });
      continue;
    }
    const res = await fetchDocumentText(url);
    if (!res.ok) {
      console.log(`  ✗ ${p.title.slice(0, 60)} — ${res.reason}`);
      if (p.pgPaperId) await graph.query(SET_PAPER_ACCESS, { params: { pgIds: [p.pgPaperId], state: res.reason } as never });
      continue;
    }
    const n = await indexPaperText(workspaceId, p.paperId, res.doc, { maxChunks });
    total += n;
    console.log(`  ✓ ${String(n).padStart(3)} passages / ${res.doc.pages.length} pages  ${p.title.slice(0, 60)}  (${Date.now() - t}ms)`);
    if (url.includes("arxiv.org")) await new Promise((r) => setTimeout(r, 1000)); // be polite to arXiv
  }
  console.log(`indexed ${total} passages`);
  await (await getFalkor()).close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
