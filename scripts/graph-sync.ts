/**
 * Copy a workspace graph from one FalkorDB instance to another, exactly: every node (all
 * labels and properties, embeddings included), every relationship with its properties, and the
 * indexes (created through ensureSchema on the target). Nothing is re-embedded.
 *
 *   node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/graph-sync.ts <workspaceId> --to <url> [options]
 *
 * Options
 *   --from <url>        source instance (default: FALKORDB_URL)
 *   --to <url>          target instance, e.g. falkor://user:pass@host:6379 or falkors://… for TLS
 *   --to-graph <name>   target graph name (default: ws:<workspaceId>)
 *   --replace           delete the target graph first (otherwise a non-empty target is refused)
 *   --dry-run           count what would be copied, write nothing
 *
 * Why not the app's own rebuild: POST /api/graph/sync and Re-index rebuild papers, passages and
 * claims from Postgres, but Notebook memories, ideas, proposals, verdicts, AgentRun traces and
 * the chat mirror exist only in the graph. This copies all of it.
 */
import { FalkorDB, type Graph } from "falkordb";
import { ensureSchema } from "../src/lib/graph/schema";

const PAGE = 400;
const VECTOR_PAGE = 150; // params are inlined as text; 150 × 1024 floats is a comfortable query size

type Props = Record<string, unknown>;

function parseArgs(argv: string[]) {
  const [workspaceId, ...rest] = argv;
  const opt = (name: string) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  return {
    workspaceId,
    from: opt("--from") ?? process.env.FALKORDB_URL,
    to: opt("--to"),
    toGraph: opt("--to-graph") ?? (workspaceId ? `ws:${workspaceId}` : undefined),
    replace: rest.includes("--replace"),
    dryRun: rest.includes("--dry-run"),
  };
}

const q = async <T,>(g: Graph, cypher: string, params: Props = {}) => ((await g.roQuery<T>(cypher, { params: params as never })).data ?? []) as T[];
const w = async <T,>(g: Graph, cypher: string, params: Props = {}) => ((await g.query<T>(cypher, { params: params as never })).data ?? []) as T[];

/** Node property values are written with `+=`; vectors must go back through vecf32() or the index ignores them. */
function splitVectors(props: Props): { plain: Props; vectors: Record<string, number[]> } {
  const plain: Props = {};
  const vectors: Record<string, number[]> = {};
  for (const [k, v] of Object.entries(props)) {
    if (Array.isArray(v) && v.length >= 64 && typeof v[0] === "number" && k.toLowerCase().includes("embedding")) vectors[k] = v as number[];
    else plain[k] = v;
  }
  return { plain, vectors };
}

async function counts(g: Graph) {
  const labels = (await q<{ label: string }>(g, "CALL db.labels() YIELD label RETURN label")).map((r) => r.label);
  const types = (await q<{ relationshipType: string }>(g, "CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType")).map((r) => r.relationshipType);
  const out: Record<string, number> = {};
  for (const l of labels) out[`(:${l})`] = (await q<{ n: number }>(g, `MATCH (n:${l}) RETURN count(n) AS n`))[0]?.n ?? 0;
  for (const t of types) out[`[:${t}]`] = (await q<{ n: number }>(g, `MATCH ()-[r:${t}]->() RETURN count(r) AS n`))[0]?.n ?? 0;
  return { labels, types, out };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.workspaceId || !args.to || !args.from || !args.toGraph) {
    throw new Error("Usage: graph-sync.ts <workspaceId> --to <url> [--from <url>] [--to-graph <name>] [--replace] [--dry-run]");
  }
  const sourceName = `ws:${args.workspaceId}`;
  console.log(`source  ${args.from.replace(/\/\/.*@/, "//…@")}  ${sourceName}`);
  console.log(`target  ${args.to.replace(/\/\/.*@/, "//…@")}  ${args.toGraph}${args.dryRun ? "  (dry run)" : ""}`);

  const src = await FalkorDB.connect({ url: args.from });
  const dst = await FalkorDB.connect({ url: args.to });
  src.on?.("error", (e: unknown) => console.error("[source]", e));
  dst.on?.("error", (e: unknown) => console.error("[target]", e));
  const sg = src.selectGraph(sourceName);
  const tg = dst.selectGraph(args.toGraph);

  if (!(await src.list()).includes(sourceName)) throw new Error(`Source graph ${sourceName} does not exist`);
  const before = await counts(sg);
  const nodeTotal = before.labels.reduce((n, l) => n + before.out[`(:${l})`], 0);
  const relTotal = before.types.reduce((n, t) => n + before.out[`[:${t}]`], 0);
  console.log(`source has ${nodeTotal} nodes across ${before.labels.length} labels and ${relTotal} relationships across ${before.types.length} types`);
  if (args.dryRun) {
    console.table(before.out);
    process.exit(0);
  }

  // Target must be empty unless --replace
  const targetExists = (await dst.list()).includes(args.toGraph);
  if (targetExists) {
    const n = (await q<{ n: number }>(tg, "MATCH (n) RETURN count(n) AS n"))[0]?.n ?? 0;
    if (n > 0 && !args.replace) throw new Error(`Target graph ${args.toGraph} already has ${n} nodes. Re-run with --replace to overwrite it.`);
    if (n > 0) {
      console.log(`deleting target graph ${args.toGraph} (${n} nodes)`);
      await tg.delete();
    }
  }
  await ensureSchema(dst.selectGraph(args.toGraph));
  const target = dst.selectGraph(args.toGraph);
  console.log("target schema ready");

  // Nodes, label by label, keeping a map from source internal id to target internal id
  const idMap = new Map<number, number>();
  const seen = new Set<number>(); // multi-label nodes appear under each label; copy once
  for (const label of before.labels) {
    let copied = 0;
    const started = Date.now();
    for (let skip = 0; ; skip += PAGE) {
      const rows = await q<{ id: number; labels: string[]; props: Props }>(
        sg,
        `MATCH (n:${label}) RETURN id(n) AS id, labels(n) AS labels, properties(n) AS props ORDER BY id(n) SKIP ${skip} LIMIT ${PAGE}`,
      );
      if (!rows.length) break;
      const fresh = rows.filter((r) => !seen.has(r.id));
      fresh.forEach((r) => seen.add(r.id));
      // Group by exact label set so one CREATE pattern fits every row in the batch
      const groups = new Map<string, typeof fresh>();
      for (const r of fresh) {
        const key = [...r.labels].sort().join(":");
        groups.set(key, [...(groups.get(key) ?? []), r]);
      }
      for (const [key, group] of groups) {
        const hasVectors = group.some((r) => Object.keys(splitVectors(r.props).vectors).length);
        const batchSize = hasVectors ? VECTOR_PAGE : PAGE;
        for (let i = 0; i < group.length; i += batchSize) {
          const batch = group.slice(i, i + batchSize).map((r) => {
            const { plain, vectors } = splitVectors(r.props);
            return { oldId: r.id, props: plain, vectorKeys: Object.keys(vectors), vectors: Object.values(vectors) };
          });
          const vectorKeys = [...new Set(batch.flatMap((b) => b.vectorKeys))];
          const setVectors = vectorKeys.map((k, i) => `SET n.${k} = CASE WHEN size(r.vectors) > ${i} THEN vecf32(r.vectors[${i}]) ELSE n.${k} END`).join("\n");
          const created = await w<{ oldId: number; newId: number }>(
            target,
            `UNWIND $rows AS r
             CREATE (n:${key})
             SET n += r.props
             ${setVectors}
             RETURN r.oldId AS oldId, id(n) AS newId`,
            { rows: batch },
          );
          created.forEach((c) => idMap.set(c.oldId, c.newId));
          copied += created.length;
        }
      }
      process.stdout.write(`\r  (:${label}) ${copied}`);
      if (rows.length < PAGE) break;
    }
    console.log(`\r  (:${label}) ${copied} nodes in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  }

  // Relationships, type by type
  for (const type of before.types) {
    let copied = 0;
    const started = Date.now();
    for (let skip = 0; ; skip += PAGE) {
      const rows = await q<{ a: number; b: number; props: Props }>(
        sg,
        `MATCH (a)-[r:${type}]->(b) RETURN id(a) AS a, id(b) AS b, properties(r) AS props ORDER BY id(r) SKIP ${skip} LIMIT ${PAGE}`,
      );
      if (!rows.length) break;
      const mapped = rows
        .map((r) => ({ a: idMap.get(r.a), b: idMap.get(r.b), props: r.props }))
        .filter((r): r is { a: number; b: number; props: Props } => r.a !== undefined && r.b !== undefined);
      if (mapped.length) {
        const [{ n }] = await w<{ n: number }>(
          target,
          `UNWIND $rows AS r
           MATCH (a) WHERE id(a) = r.a
           MATCH (b) WHERE id(b) = r.b
           CREATE (a)-[e:${type}]->(b)
           SET e += r.props
           RETURN count(e) AS n`,
          { rows: mapped },
        );
        copied += n;
      }
      process.stdout.write(`\r  [:${type}] ${copied}`);
      if (rows.length < PAGE) break;
    }
    console.log(`\r  [:${type}] ${copied} relationships in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  }

  // Verify
  const after = await counts(target);
  const rowsOut: Record<string, { source: number; target: number; ok: string }> = {};
  let mismatches = 0;
  for (const k of Object.keys(before.out)) {
    const s = before.out[k];
    const t = after.out[k] ?? 0;
    if (s !== t) mismatches++;
    rowsOut[k] = { source: s, target: t, ok: s === t ? "✓" : "✗" };
  }
  console.table(rowsOut);
  const idx = await q<{ label: string; types: Record<string, string[]> }>(target, "CALL db.indexes() YIELD label, types RETURN label, types");
  const vectorIdx = idx.filter((r) => Object.values(r.types).some((t) => t.includes("VECTOR"))).map((r) => r.label);
  console.log(`target vector indexes: ${vectorIdx.join(", ") || "none"}`);
  const [vec] = await q<{ n: number }>(target, "MATCH (p:Paper) WHERE p.embedding IS NOT NULL RETURN count(p) AS n");
  console.log(`target papers with embeddings: ${vec?.n ?? 0}`);
  console.log(mismatches ? `DONE WITH ${mismatches} COUNT MISMATCH(ES)` : "DONE, counts match");
  await src.close();
  await dst.close();
  process.exit(mismatches ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
