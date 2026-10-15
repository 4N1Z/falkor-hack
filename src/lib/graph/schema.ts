import type { Graph } from "falkordb";

export const EMBEDDING_DIM = 1536; // OpenAI text-embedding-3-small

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
];

const STATEMENTS: string[] = [
  ...RANGE_INDEXES.map(([label, prop]) => `CREATE INDEX FOR (n:${label}) ON (n.${prop})`),
  "CREATE FULLTEXT INDEX FOR (p:Paper) ON (p.title, p.abstract)",
  `CREATE VECTOR INDEX FOR (p:Paper) ON (p.embedding) OPTIONS {dimension: ${EMBEDDING_DIM}, similarityFunction: 'cosine'}`,
];

const isAlreadyExists = (err: unknown) =>
  err instanceof Error && /already (exists|indexed)/i.test(err.message);

/** Idempotent: safe to run on every startup / first use of a workspace graph. */
export async function ensureSchema(graph: Graph): Promise<void> {
  for (const statement of STATEMENTS) {
    try {
      await graph.query(statement);
    } catch (err) {
      if (!isAlreadyExists(err)) throw err;
    }
  }
}
