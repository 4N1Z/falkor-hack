import type { Graph } from "falkordb";

export const EMBEDDING_DIM = 1024; // Cohere embed-english-v3.0 (see embeddings.ts)

/** Bump when indexes change so running servers re-run ensureSchema (it caches per graph). */
export const SCHEMA_VERSION = 8; // 8: section-aware chunks, Claim→Sentence rename, adam labels

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
  // Draft sentences (sync-document.ts). Was `Claim` before schema 8; `Claim` is now a
  // statement extracted from a paper by adam.
  ["Sentence", "id"],
  ["Hypothesis", "id"],
  ["Idea", "id"],
  ["AgentRun", "id"],
  ["Chunk", "id"],
  ["Chunk", "paperId"],
  ["IngestStatus", "pgPaperId"],
  ["Memory", "id"],
  ["Idea", "status"],
  ["ChatMessage", "id"],
  ["ChatMessage", "threadId"],
  // Full-text index v2 (document-index.ts): passages addressed by page, section and kind
  ["Chunk", "section"],
  ["Chunk", "kind"],
  ["Chunk", "doc"],
  // adam (docs/adam-spec-creation.md): the research graph of known steps, and its orchestration
  ["AdamProject", "id"],
  ["AdamProject", "workspaceId"],
  ["QuestionPage", "id"],
  ["QuestionPage", "projectId"],
  ["Claim", "id"],
  ["Claim", "projectId"],
  ["Claim", "state"],
  ["Claim", "paperId"],
  ["Evidence", "id"],
  ["Evidence", "projectId"],
  ["Method", "id"],
  ["Method", "projectId"],
  ["Method", "nameKey"],
  ["Procedure", "id"],
  ["Procedure", "projectId"],
  ["Instrument", "id"],
  ["Instrument", "nameKey"],
  ["Assumption", "id"],
  ["Assumption", "projectId"],
  ["Result", "id"],
  ["Result", "projectId"],
  ["Condition", "id"],
  ["OpenQuestion", "id"],
  ["OpenQuestion", "projectId"],
  ["ExtractionCard", "id"],
  ["ExtractionCard", "paperId"],
  ["Candidate", "id"],
  ["Candidate", "projectId"],
  ["Hypothesis", "projectId"],
  ["Attack", "id"],
  ["ExperimentPlan", "id"],
  ["Observation", "id"],
  ["Observation", "projectId"],
  ["AdamJob", "id"],
  ["AdamJob", "status"],
  ["AdamJob", "projectId"],
  ["AdamJob", "dedupeKey"],
  ["AdamEvent", "projectId"],
  ["ClusterStat", "projectId"],
  ["SchemaMeta", "key"],
];

const VECTOR_LABELS = ["Paper", "Chunk", "Memory", "ChatMessage", "Claim", "Method", "Assumption", "Procedure", "Result", "Hypothesis"];

const STATEMENTS: string[] = [
  ...RANGE_INDEXES.map(([label, prop]) => `CREATE INDEX FOR (n:${label}) ON (n.${prop})`),
  "CREATE FULLTEXT INDEX FOR (p:Paper) ON (p.title, p.abstract)",
  `CREATE VECTOR INDEX FOR (p:Paper) ON (p.embedding) OPTIONS {dimension: ${EMBEDDING_DIM}, similarityFunction: 'cosine'}`,
  // Passage-level retrieval over full text (document-index.ts)
  `CREATE VECTOR INDEX FOR (c:Chunk) ON (c.embedding) OPTIONS {dimension: ${EMBEDDING_DIM}, similarityFunction: 'cosine'}`,
  "CREATE FULLTEXT INDEX FOR (c:Chunk) ON (c.text)",
  // Research memory (Historian): recall similar hypotheses / findings
  `CREATE VECTOR INDEX FOR (m:Memory) ON (m.embedding) OPTIONS {dimension: ${EMBEDDING_DIM}, similarityFunction: 'cosine'}`,
  // Workspace chat mirror: questions the team asked, so agents can recall them
  `CREATE VECTOR INDEX FOR (c:ChatMessage) ON (c.embedding) OPTIONS {dimension: ${EMBEDDING_DIM}, similarityFunction: 'cosine'}`,
  // adam: entity resolution (Method / Assumption), evidence search (Claim), path search (Result / Procedure)
  ...["Claim", "Method", "Assumption", "Procedure", "Result", "Hypothesis"].map(
    (l) => `CREATE VECTOR INDEX FOR (n:${l}) ON (n.embedding) OPTIONS {dimension: ${EMBEDDING_DIM}, similarityFunction: 'cosine'}`,
  ),
  "CREATE FULLTEXT INDEX FOR (c:Claim) ON (c.text)",
  "CREATE FULLTEXT INDEX FOR (p:Procedure) ON (p.name)",
];

const isAlreadyExists = (err: unknown) =>
  err instanceof Error && /already (exists|indexed)/i.test(err.message);

/**
 * Vector indexes built for another embedding model (e.g. the old 1536-d OpenAI vectors) are
 * dropped, and their stale vectors removed — they can't be compared with the new model's.
 * scripts/reembed.ts then re-embeds from the stored text.
 */
async function dropMismatchedVectorIndexes(graph: Graph) {
  let rows: { label: string; options: Record<string, { dimension?: number }> }[] = [];
  try {
    rows =
      (await graph.roQuery<{ label: string; options: Record<string, { dimension?: number }> }>(
        "CALL db.indexes() YIELD label, options RETURN label, options",
      )).data ?? [];
  } catch (err) {
    // A graph that doesn't exist yet rejects read-only queries ("Invalid graph operation on empty
    // key"). Nothing to drop; the CREATE INDEX statements below bring the graph into being.
    if (err instanceof Error && /empty key/i.test(err.message)) return;
    throw err;
  }
  for (const r of rows) {
    const dim = r.options?.embedding?.dimension;
    if (!VECTOR_LABELS.includes(r.label) || dim === undefined || dim === EMBEDDING_DIM) continue;
    await graph.query(`DROP VECTOR INDEX FOR (n:${r.label}) ON (n.embedding)`);
    await graph.query(`MATCH (n:${r.label}) WHERE n.embedding IS NOT NULL REMOVE n.embedding`);
    console.warn(`[graph] ${r.label} vectors were ${dim}-d, model is ${EMBEDDING_DIM}-d: index rebuilt, run scripts/reembed.ts`);
  }
}

/**
 * One-time data migrations, each recorded as a (:SchemaMeta {key}) node so they run once per
 * graph. Kept as separate statements: FalkorDB silently no-ops a label change combined with
 * other writes in one query.
 */
const MIGRATIONS: Array<{ key: string; statements: string[] }> = [
  {
    // Draft sentences were labelled Claim before adam; the spec's Claim is a paper statement.
    key: "claim_to_sentence",
    statements: [
      "MATCH (:Document)-[:CONTAINS]->(c:Claim) SET c:Sentence",
      "MATCH (c:Sentence:Claim) REMOVE c:Claim",
    ],
  },
];

async function runMigrations(graph: Graph) {
  for (const m of MIGRATIONS) {
    const done = (await graph.roQuery<{ n: number }>("MATCH (s:SchemaMeta {key: $key}) RETURN count(s) AS n", { params: { key: m.key } as never }))
      .data?.[0]?.n;
    if (done) continue;
    for (const s of m.statements) await graph.query(s);
    await graph.query("MERGE (s:SchemaMeta {key: $key}) SET s.at = $at", { params: { key: m.key, at: Date.now() } as never });
    console.log(`[graph] migration ${m.key} applied`);
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
  await runMigrations(graph);
}
