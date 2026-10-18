// Copy one Adam project from one FalkorDB instance to another, merging into the target's
// workspace graph without touching anything else in it.
//
//   node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/adam-copy-project.ts \
//     --workspace <workspaceId> --project <projectId> --from falkor://localhost:6380 --to falkor://127.0.0.1:6379
//
// What moves: every node carrying the project's id (claims, methods, assumptions, evidence, jobs,
// events, briefs, attacks, plans, cards, cluster stats, question pages), the AdamProject node, the
// papers the project triaged or extracted from, those papers' chunks, and every edge between all of
// those. Papers are merged by paperId (the target keeps its own papers); chunks of the copied papers
// are replaced; existing project data on the target with the same id is removed first, so the copy
// is repeatable. Embeddings are rewritten with vecf32() so the target's vector indexes pick them up.

import { FalkorDB, type Graph } from "falkordb";

type Props = Record<string, unknown>;
interface SrcNode { nid: number; labels: string[]; properties: Props }
interface SrcEdge { a: number; b: number; type: string; properties: Props }

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : fallback;
  if (!v) throw new Error(`--${name} is required`);
  return v;
};
const BATCH = 100;
const chunk = <T>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, (i + 1) * n));
const p = <T>(x: T) => ({ params: x as never });

/** The property that identifies a node of this label on the target. */
function keyOf(labels: string[], props: Props): { prop: string; value: unknown } {
  const label = labels[0];
  if (label === "Paper") return { prop: "paperId", value: props.paperId };
  if (label === "ClusterStat") return { prop: "key", value: `${props.projectId}:${props.clusterId}` };
  return { prop: "id", value: props.id };
}

async function main() {
  const workspaceId = arg("workspace");
  const projectId = arg("project");
  const fromUrl = arg("from");
  const toUrl = arg("to", process.env.FALKORDB_URL);
  const graphName = `ws:${workspaceId}`;
  const t0 = Date.now();

  const src = await FalkorDB.connect({ url: fromUrl });
  const dst = await FalkorDB.connect({ url: toUrl });
  const sg = src.selectGraph(graphName);
  const dg = dst.selectGraph(graphName);
  const rows = async <T>(g: Graph, q: string, params?: object) => ((await g.roQuery<T>(q, params ? p(params) : undefined)).data ?? []) as T[];

  // ---- 1. Collect the source subgraph
  const nodeRows = await rows<{ nid: number; labels: string[]; n: { properties: Props } }>(
    sg,
    "MATCH (n) WHERE n.projectId = $projectId OR (n:AdamProject AND n.id = $projectId) RETURN id(n) AS nid, labels(n) AS labels, n",
    { projectId },
  );
  const nodes = new Map<number, SrcNode>();
  for (const r of nodeRows) nodes.set(r.nid, { nid: r.nid, labels: r.labels, properties: r.n.properties });
  const projectCount = nodes.size;
  if (!nodes.has(-1) && !nodeRows.some((r) => r.labels.includes("AdamProject"))) throw new Error(`project ${projectId} not found in ${graphName} on ${fromUrl}`);

  const paperRows: { nid: number; labels: string[]; n: { properties: Props } }[] = [];
  for (const q of [
    "MATCH (:AdamProject {id: $projectId})-[:TRIAGED]->(p:Paper) RETURN DISTINCT id(p) AS nid, labels(p) AS labels, p AS n",
    "MATCH (n)-[]-(p:Paper) WHERE n.projectId = $projectId RETURN DISTINCT id(p) AS nid, labels(p) AS labels, p AS n",
  ]) {
    for (const r of await rows<{ nid: number; labels: string[]; n: { properties: Props } }>(sg, q, { projectId })) {
      if (nodes.has(r.nid)) continue;
      nodes.set(r.nid, { nid: r.nid, labels: r.labels, properties: r.n.properties });
      paperRows.push(r);
    }
  }
  const paperIds = paperRows.map((r) => r.n.properties.paperId as string);

  const chunkRows: { nid: number; labels: string[]; n: { properties: Props } }[] = [];
  for (const ids of chunk(paperIds, BATCH)) {
    chunkRows.push(...(await rows<{ nid: number; labels: string[]; n: { properties: Props } }>(sg, "MATCH (c:Chunk)-[:CHUNK_OF]->(p:Paper) WHERE p.paperId IN $ids RETURN id(c) AS nid, labels(c) AS labels, c AS n", { ids })));
  }
  for (const r of chunkRows) nodes.set(r.nid, { nid: r.nid, labels: r.labels, properties: r.n.properties });
  console.log(`source: ${projectCount} project nodes, ${paperRows.length} papers, ${chunkRows.length} chunks`);

  const edges: SrcEdge[] = [];
  const seen = new Set<number>();
  const takeEdges = async (q: string, params: object) => {
    const out = await rows<{ eid: number; a: number; b: number; type: string; r: { properties: Props } }>(sg, q, params);
    for (const e of out) {
      if (seen.has(e.eid) || !nodes.has(e.a) || !nodes.has(e.b)) continue;
      seen.add(e.eid);
      edges.push({ a: e.a, b: e.b, type: e.type, properties: e.r.properties });
    }
  };
  const RET = "RETURN id(r) AS eid, id(a) AS a, id(b) AS b, type(r) AS type, r";
  await takeEdges(`MATCH (a)-[r]->(b) WHERE a.projectId = $projectId ${RET}`, { projectId });
  await takeEdges(`MATCH (a)-[r]->(b) WHERE b.projectId = $projectId ${RET}`, { projectId });
  await takeEdges(`MATCH (a:AdamProject {id: $projectId})-[r]->(b) ${RET}`, { projectId });
  for (const ids of chunk(paperIds, BATCH)) {
    await takeEdges(`MATCH (a:Paper)-[r]->(b) WHERE a.paperId IN $ids ${RET}`, { ids });
    await takeEdges(`MATCH (a:Chunk)-[r]->(b:Paper) WHERE b.paperId IN $ids ${RET}`, { ids });
  }
  console.log(`source: ${edges.length} edges inside the subgraph (${Date.now() - t0} ms)`);

  // ---- 2. Clear what the target already holds for this project
  await dg.query("MATCH (n) WHERE n.projectId = $projectId DETACH DELETE n", p({ projectId }));
  await dg.query("MATCH (n:AdamProject {id: $projectId}) DETACH DELETE n", p({ projectId }));
  for (const ids of chunk(paperIds, BATCH)) await dg.query("MATCH (c:Chunk)-[:CHUNK_OF]->(p:Paper) WHERE p.paperId IN $ids DETACH DELETE c", p({ ids }));

  // ---- 3. Nodes, grouped by label set
  const byLabel = new Map<string, SrcNode[]>();
  for (const n of nodes.values()) {
    const k = n.labels.join(":");
    byLabel.set(k, [...(byLabel.get(k) ?? []), n]);
  }
  let written = 0;
  for (const [labelKey, group] of byLabel) {
    const keyProp = keyOf(group[0].labels, group[0].properties).prop;
    for (const batch of chunk(group, BATCH)) {
      const withEmb = batch.filter((n) => Array.isArray(n.properties.embedding));
      const withoutEmb = batch.filter((n) => !Array.isArray(n.properties.embedding));
      const toRow = (n: SrcNode) => {
        const { embedding, ...props } = n.properties;
        const key = keyOf(n.labels, n.properties);
        if (key.value === undefined || key.value === null) throw new Error(`node ${n.nid} (${labelKey}) has no ${key.prop}`);
        const clean = Object.fromEntries(Object.entries({ ...props, [key.prop]: key.value }).filter(([, v]) => v !== undefined && v !== null));
        return Array.isArray(embedding) ? { key: key.value, props: clean, emb: embedding } : { key: key.value, props: clean };
      };
      if (withoutEmb.length) await dg.query(`UNWIND $rows AS r MERGE (n:${labelKey} {${keyProp}: r.key}) SET n += r.props`, p({ rows: withoutEmb.map(toRow) }));
      if (withEmb.length) await dg.query(`UNWIND $rows AS r MERGE (n:${labelKey} {${keyProp}: r.key}) SET n += r.props, n.embedding = vecf32(r.emb)`, p({ rows: withEmb.map(toRow) }));
      written += batch.length;
    }
  }
  console.log(`target: ${written} nodes merged across ${byLabel.size} label sets (${Date.now() - t0} ms)`);

  // ---- 4. Edges, grouped by (type, labels of each end). Paper→Paper edges already exist on the
  // target from the library ingest, so those merge; everything else was cleared above and is created.
  const byShape = new Map<string, SrcEdge[]>();
  for (const e of edges) {
    const la = nodes.get(e.a)!.labels.join(":");
    const lb = nodes.get(e.b)!.labels.join(":");
    const k = `${e.type}\t${la}\t${lb}`;
    byShape.set(k, [...(byShape.get(k) ?? []), e]);
  }
  let linked = 0;
  for (const [shape, group] of byShape) {
    const [type, la, lb] = shape.split("\t");
    const ka = keyOf(la.split(":"), {}).prop;
    const kb = keyOf(lb.split(":"), {}).prop;
    const verb = la === "Paper" && lb === "Paper" ? "MERGE" : "CREATE";
    for (const batch of chunk(group, BATCH)) {
      const rowsIn = batch.map((e) => ({
        a: keyOf(nodes.get(e.a)!.labels, nodes.get(e.a)!.properties).value,
        b: keyOf(nodes.get(e.b)!.labels, nodes.get(e.b)!.properties).value,
        props: Object.fromEntries(Object.entries(e.properties).filter(([, v]) => v !== undefined && v !== null)),
      }));
      await dg.query(
        `UNWIND $rows AS r MATCH (a:${la}) WHERE a.${ka} = r.a MATCH (b:${lb}) WHERE b.${kb} = r.b ${verb} (a)-[e:${type}]->(b) SET e += r.props`,
        p({ rows: rowsIn }),
      );
      linked += batch.length;
    }
  }
  console.log(`target: ${linked} edges written across ${byShape.size} shapes (${Date.now() - t0} ms)`);

  // ---- 5. Verify
  const [s, d] = await Promise.all([
    rows<{ n: number }>(sg, "MATCH (n) WHERE n.projectId = $projectId RETURN count(n) AS n", { projectId }),
    rows<{ n: number }>(dg, "MATCH (n) WHERE n.projectId = $projectId RETURN count(n) AS n", { projectId }),
  ]);
  const [se, de] = await Promise.all([
    rows<{ n: number }>(sg, "MATCH (a)-[r]-(b) WHERE a.projectId = $projectId RETURN count(DISTINCT r) AS n", { projectId }),
    rows<{ n: number }>(dg, "MATCH (a)-[r]-(b) WHERE a.projectId = $projectId RETURN count(DISTINCT r) AS n", { projectId }),
  ]);
  const [sc, dc] = await Promise.all([
    rows<{ n: number }>(sg, "MATCH (c:Chunk)-[:CHUNK_OF]->(p:Paper) WHERE p.paperId IN $ids RETURN count(c) AS n", { ids: paperIds }),
    rows<{ n: number }>(dg, "MATCH (c:Chunk)-[:CHUNK_OF]->(p:Paper) WHERE p.paperId IN $ids RETURN count(c) AS n", { ids: paperIds }),
  ]);
  console.log(`verify: project nodes ${s[0].n} → ${d[0].n}; edges touching them ${se[0].n} → ${de[0].n}; chunks of its papers ${sc[0].n} → ${dc[0].n}`);
  await src.close();
  await dst.close();
  process.exit(s[0].n === d[0].n && se[0].n === de[0].n && sc[0].n === dc[0].n ? 0 : 2);
}

main().catch((e) => {
  console.error("copy failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
