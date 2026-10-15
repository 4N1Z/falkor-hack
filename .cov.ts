import postgres from "postgres";
import { getFalkor, getWorkspaceGraph } from "./src/lib/graph/client";
(async () => {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const rows = await sql`select w.title as ws, p.workspace_id, p.id, p.source, p.external_source, p.file_type, p.upload_url is not null as has_file, p.doi is not null as has_doi from papers p join workspaces w on w.id = p.workspace_id`;
  await sql.end();
  const byWs = new Map<string, any[]>();
  for (const r of rows) byWs.set(r.workspace_id, [...(byWs.get(r.workspace_id) ?? []), r]);
  for (const [ws, list] of byWs) {
    const g = await getWorkspaceGraph(ws);
    const st = (await g.roQuery(`MATCH (p:Paper) WHERE p.pgPaperId IN $ids RETURN p.pgPaperId AS id, p.paperId STARTS WITH 'local:' AS local, coalesce(p.chunkCount,0) AS chunks`, { params: { ids: list.map((r) => r.id) } as any })).data as any[];
    const m = new Map(st.map((s) => [s.id, s]));
    const inGraph = list.filter((r) => m.has(r.id)).length;
    const full = list.filter((r) => m.get(r.id)?.chunks > 0).length;
    const local = list.filter((r) => m.get(r.id)?.local).length;
    const bySrc: Record<string, number> = {};
    for (const r of list) { const k = `${r.external_source ?? r.source}${r.has_file ? "+file" : ""}`; bySrc[k] = (bySrc[k] ?? 0) + 1; }
    console.log(`"${list[0].ws}": ${list.length} papers | in graph ${inGraph} | full text ${full} | unmatched ${local} | sources ${JSON.stringify(bySrc)}`);
    const missing = list.filter((r) => !m.has(r.id));
    if (missing.length) console.log(`   not in graph: ${missing.length} (${JSON.stringify(missing.map((r) => r.source + (r.has_file ? "+file" : "")))})`);
    const noText = list.filter((r) => m.has(r.id) && !(m.get(r.id)!.chunks > 0));
    if (noText.length) console.log(`   in graph but no full text: ${JSON.stringify(noText.map((r) => `${r.external_source ?? r.source}${r.has_file ? "+file(" + r.file_type + ")" : " (no file)"}`))}`);
  }
  await (await getFalkor()).close();
})().catch((e) => { console.error(e); process.exit(1); });
