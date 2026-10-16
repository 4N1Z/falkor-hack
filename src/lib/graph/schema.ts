import type { Graph } from "falkordb";

export const EMBEDDING_DIM = 1024; // Cohere embed-english-v3.0 (see embeddings.ts)

/** Bump when indexes change so running servers re-run ensureSchema (it caches per graph). */
export const SCHEMA_VERSION = 6;

// Paper.paperId is the node key: an OpenAlex work id ("W123…"), or "local:<postgres id>"
// when the paper couldn't be matched. doi / s2Id / arxivId are lookup keys so citations
// inserted from Semantic Scholar or DOI links still resolve to the same node.
const RANGE_INDEXES: Array<[label: string, prop: string]> = [
  ["Paper", "paperId"],
  ["Paper", "doi"],
  ["Paper", "s2Id"],
  ["Paper", "arxivId"],
  ["Paper", "pgPaperId"],
  ["Paper", "titleKey"],
  ["Author", "authorId"],
  ["Concept", "name"],
  ["Venue", "name"],
  ["User", "id"],
  ["Document", "fileId"],
  ["Claim", "id"],
  ["Hypothesis", "id"],
  ["Idea", "id"],
  ["AgentRun", "id"],
  ["Chunk", "id"],
  ["Chunk", "paperId"],
  ["IngestStatus", "pgPaperId"],
  ["Memory", "id"],
  ["Idea", "status"],
];

const STATEMENTS: string[] = [
  ...RANGE_INDEXES.map(([label, prop]) => `CREATE INDEX FOR (n:${label}) ON (n.${prop})`),
  "CREATE FULLTEXT INDEX FOR (p:Paper) ON (p.title, p.abstract)",
  `CREATE VECTOR INDEX FOR (p:Paper) ON (p.embedding) OPTIONS {dimension: ${EMBEDDING_DIM}, similarityFunction: 'cosine'}`,
  // Passage-level retrieval over full text (document-index.ts)
  `CREATE VECTOR INDEX FOR (c:Chunk) ON (c.embedding) OPTIONS {dimension: ${EMBEDDING_DIM}, similarityFunction: 'cosine'}`,
  "CREATE FULLTEXT INDEX FOR (c:Chunk) ON (c.text)",
  // Research memory (Historian): recall similar hypotheses / findings
  `CREATE VECTOR INDEX FOR (m:Memory) ON (m.embedding) OPTIONS {dimension: ${EMBEDDING_DIM}, similarityFunction: 'cosine'}`,
];

const isAlreadyExists = (err: unknown) =>
  err instanceof Error && /already (exists|indexed)/i.test(err.message);

const VECTOR_LABELS = ["Paper", "Chunk", "Memory"];

/**
 * Vector indexes built for another embedding model (e.g. the old 1536-d OpenAI vectors) are
 * dropped, and their stale vectors removed — they can't be compared with the new model's.
 * scripts/reembed.ts then re-embeds from the stored text.
 */
async function dropMismatchedVectorIndexes(graph: Graph) {
  const rows =
    (await graph.roQuery<{ label: string; options: Record<string, { dimension?: number }> }>(
      "CALL db.indexes() YIELD label, options RETURN label, options",
    )).data ?? [];
  for (const r of rows) {
    const dim = r.options?.embedding?.dimension;
    if (!VECTOR_LABELS.includes(r.label) || dim === undefined || dim === EMBEDDING_DIM) continue;
    await graph.query(`DROP VECTOR INDEX FOR (n:${r.label}) ON (n.embedding)`);
    await graph.query(`MATCH (n:${r.label}) WHERE n.embedding IS NOT NULL REMOVE n.embedding`);
    console.warn(`[graph] ${r.label} vectors were ${dim}-d, model is ${EMBEDDING_DIM}-d: index rebuilt, run scripts/reembed.ts`);
  }
}

/** Idempotent: safe to run on every startup / first use of a workspace graph. */
export async function ensureSchema(graph: Graph): Promise<void> {
  await dropMismatchedVectorIndexes(graph);
  for (const statement of STATEMENTS) {
    try {
      await graph.query(statement);
    } catch (err) {
      if (!isAlreadyExists(err)) throw err;
    }
  }
}
