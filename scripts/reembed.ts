/**
 * Re-embed every Paper, Chunk (full-text passage) and Memory in a workspace graph with the
 * current embedding model (after switching models / dimensions).
 *
 *   node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/reembed.ts <workspaceId|--all>
 *
 * ensureSchema drops vector indexes of the wrong dimension (and their stale vectors) first;
 * this then fills in every missing vector from the text already stored in the graph.
 */
import { getFalkor, getWorkspaceGraph } from "../src/lib/graph/client";
import { EMBEDDING_MODEL, embedTexts, paperEmbeddingText } from "../src/lib/graph/embeddings";

const PAGE = 256;

const TARGETS = [
  {
    label: "Paper",
    read: `MATCH (n:Paper) WHERE n.embedding IS NULL AND n.title IS NOT NULL RETURN n.paperId AS id, n.title AS title, n.abstract AS abstract LIMIT ${PAGE}`,
    write: `UNWIND $rows AS r MATCH (n:Paper {paperId: r.id}) SET n.embedding = vecf32(r.v)`,
    text: (r: Record<string, string | null>) => paperEmbeddingText(r.title ?? "", r.abstract),
  },
  {
    label: "Chunk",
    read: `MATCH (n:Chunk) WHERE n.embedding IS NULL AND n.text IS NOT NULL RETURN n.id AS id, n.text AS text LIMIT ${PAGE}`,
    write: `UNWIND $rows AS r MATCH (n:Chunk {id: r.id}) SET n.embedding = vecf32(r.v)`,
    text: (r: Record<string, string | null>) => r.text ?? "",
  },
  {
    label: "Memory",
    read: `MATCH (n:Memory) WHERE n.embedding IS NULL AND n.text IS NOT NULL RETURN n.id AS id, n.text AS text LIMIT ${PAGE}`,
    write: `UNWIND $rows AS r MATCH (n:Memory {id: r.id}) SET n.embedding = vecf32(r.v)`,
    text: (r: Record<string, string | null>) => r.text ?? "",
  },
];

async function reembed(workspaceId: string) {
  const graph = await getWorkspaceGraph(workspaceId); // runs ensureSchema (drops mismatched indexes)
  for (const t of TARGETS) {
    let done = 0;
    const started = Date.now();
    for (;;) {
      const rows = ((await graph.roQuery<Record<string, string | null>>(t.read)).data ?? []) as Record<string, string | null>[];
      if (!rows.length) break;
      const vectors = await embedTexts(rows.map(t.text), "document");
      await graph.query(t.write, { params: { rows: rows.map((r, i) => ({ id: r.id, v: vectors[i] })) } as never });
      done += rows.length;
      process.stdout.write(`\r  ${t.label}: ${done} re-embedded`);
    }
    console.log(`\r  ${t.label}: ${done} re-embedded in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  }
}

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error("Usage: reembed.ts <workspaceId|--all>");
  const ids =
    arg === "--all"
      ? (await (await getFalkor()).list()).filter((n) => n.startsWith("ws:")).map((n) => n.slice(3))
      : [arg];
  console.log(`Embedding model: ${EMBEDDING_MODEL}`);
  for (const id of ids) {
    console.log(`ws:${id}`);
    await reembed(id);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
