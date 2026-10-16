/**
 * What is indexed in FalkorDB for a workspace (or every workspace graph).
 *
 *   node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/graph-report.ts [workspaceId]
 *
 * Cross-checks the Postgres library against the graph, so anything not indexed stands out.
 */
import postgres from "postgres";
import { getFalkor, getWorkspaceGraph } from "../src/lib/graph/client";
import { GRAPH_INDEX_PAPERS, GRAPH_INDEX_TOTALS, INGEST_STATUS_FOR } from "../src/lib/graph/queries";

type Row = { paperId: string; pgPaperId: string | null; title: string; year: number | null; importedBy: string; chunks: number; links: number; unmatched: boolean };

async function report(workspaceId: string, title: string, library: { id: string; title: string }[]) {
  const graph = await getWorkspaceGraph(workspaceId);
  const totals = (await graph.roQuery<Record<string, number>>(GRAPH_INDEX_TOTALS)).data?.[0];
  const papers = ((await graph.roQuery<Row>(GRAPH_INDEX_PAPERS)).data ?? []) as Row[];
  const status = new Map(
    ((await graph.roQuery<{ pgPaperId: string; state: string; fullText: string | null; error: string | null }>(INGEST_STATUS_FOR, {
      params: { pgIds: library.map((l) => l.id) } as never,
    })).data ?? []).map((s) => [s.pgPaperId, s]),
  );

  console.log(`\n━━ ${title}  (ws:${workspaceId})`);
  if (totals) {
    console.log(
      `   ${totals.library} team papers · ${totals.papers} papers in graph · ${totals.citations} citations · ` +
        `${totals.passages} passages · ${totals.authors} authors · ${totals.concepts} concepts · ${totals.claims} draft claims` +
        (totals.suspect ? ` · ${totals.suspect} suspect (excluded)` : ""),
    );
  }

  const byOwner = new Map<string, Row[]>();
  for (const p of papers) byOwner.set(p.importedBy, [...(byOwner.get(p.importedBy) ?? []), p]);
  for (const [owner, rows] of byOwner) {
    console.log(`\n   ${owner} — ${rows.length} paper(s)`);
    for (const p of rows) {
      const where = !p.pgPaperId || p.pgPaperId.startsWith("seed-") ? "graph-only" : "library";
      const text = p.chunks ? `${String(p.chunks).padStart(3)} passages` : "abstract only";
      const links = p.unmatched ? "not matched" : `${p.links} links`;
      console.log(`     ${text.padEnd(13)} ${links.padEnd(12)} ${where.padEnd(10)} ${p.title.slice(0, 70)}${p.year ? ` (${p.year})` : ""}`);
    }
  }

  // Library papers that never made it into the graph, or failed
  const inGraph = new Set(papers.map((p) => p.pgPaperId));
  const problems = library.filter((l) => !inGraph.has(l.id) || status.get(l.id)?.state === "failed");
  if (problems.length) {
    console.log(`\n   ⚠ ${problems.length} library paper(s) not indexed:`);
    for (const l of problems) {
      const s = status.get(l.id);
      console.log(`     ${(s?.state ?? "never indexed").padEnd(14)} ${l.title.slice(0, 70)}${s?.error ? ` — ${s.error}` : ""}`);
    }
  } else if (library.length) {
    console.log(`\n   ✓ all ${library.length} library paper(s) are indexed`);
  }
}

async function main() {
  const only = process.argv[2];
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const workspaces = await sql<{ id: string; title: string }[]>`
    select id, title from workspaces ${only ? sql`where id = ${only}` : sql``} order by title`;
  const lib = await sql<{ id: string; title: string; workspace_id: string }[]>`select id, title, workspace_id from papers`;
  await sql.end();

  const db = await getFalkor();
  const graphs = new Set(await db.list());
  for (const ws of workspaces) {
    const library = lib.filter((l) => l.workspace_id === ws.id);
    if (!graphs.has(`ws:${ws.id}`) && !library.length) continue; // nothing anywhere
    await report(ws.id, ws.title, library);
  }
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
