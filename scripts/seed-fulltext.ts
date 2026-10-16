/**
 * Index full text for team papers that are in the graph without passages (e.g. the
 * graph-only demo collaborators from seed-graph.ts), using their arXiv PDFs.
 *
 *   node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/seed-fulltext.ts <workspaceId>
 */
import { getFalkor, getWorkspaceGraph } from "../src/lib/graph/client";
import { fetchDocumentText, indexPaperText } from "../src/lib/graph/document-index";

async function main() {
  const workspaceId = process.argv[2];
  if (!workspaceId) throw new Error("usage: seed-fulltext.ts <workspaceId>");
  const graph = await getWorkspaceGraph(workspaceId);
  const todo =
    (await graph.roQuery<{ paperId: string; title: string; arxivId: string }>(
      `MATCH (:User)-[:IMPORTED]->(p:Paper)
       WHERE coalesce(p.chunkCount, 0) = 0 AND p.arxivId IS NOT NULL
       RETURN DISTINCT p.paperId AS paperId, p.title AS title, p.arxivId AS arxivId`,
    )).data ?? [];
  console.log(`${todo.length} team papers without full text`);

  let total = 0;
  for (const p of todo) {
    const t = Date.now();
    const res = await fetchDocumentText(`https://arxiv.org/pdf/${p.arxivId}`);
    if (!res.ok) {
      console.log(`  ✗ ${p.title.slice(0, 60)} — ${res.reason}`);
      continue;
    }
    const n = await indexPaperText(workspaceId, p.paperId, res.doc);
    total += n;
    console.log(`  ✓ ${String(n).padStart(2)} passages  ${p.title.slice(0, 60)}  (${Date.now() - t}ms)`);
    await new Promise((r) => setTimeout(r, 1000)); // be polite to arXiv
  }
  console.log(`indexed ${total} passages`);
  await (await getFalkor()).close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
