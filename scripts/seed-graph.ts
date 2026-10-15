/**
 * Seed a workspace research graph for the demo: three collaborators with overlapping
 * libraries in retrieval-augmented generation / GraphRAG.
 *
 *   node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/seed-graph.ts <workspaceId> [--reset]
 *
 * Collaborator A is the workspace owner (a real user, so their suggestions show in the app);
 * B and C are graph-only demo users. Nothing is written to Postgres.
 */
import postgres from "postgres";
import { getFalkor, getWorkspaceGraph } from "../src/lib/graph/client";
import { ingestLibrary, type LibraryItem } from "../src/lib/graph/ingest";
import { GRAPH_STATS, IMPORTS_PER_USER } from "../src/lib/graph/queries";
import { ensureSchema } from "../src/lib/graph/schema";

type Seed = { title: string; arxiv: string };

const A_PAPERS: Seed[] = [
  { title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks", arxiv: "2005.11401" },
  { title: "Dense Passage Retrieval for Open-Domain Question Answering", arxiv: "2004.04906" },
  { title: "REALM: Retrieval-Augmented Language Model Pre-Training", arxiv: "2002.08909" },
  { title: "Leveraging Passage Retrieval with Generative Models for Open Domain Question Answering", arxiv: "2007.01282" },
  { title: "Improving language models by retrieving from trillions of tokens", arxiv: "2112.04426" },
  { title: "Atlas: Few-shot Learning with Retrieval Augmented Language Models", arxiv: "2208.03299" },
  { title: "Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection", arxiv: "2310.11511" },
  { title: "ColBERT: Efficient and Effective Passage Search via Contextualized Late Interaction over BERT", arxiv: "2004.12832" },
  { title: "In-Context Retrieval-Augmented Language Models", arxiv: "2302.00083" },
  { title: "Lost in the Middle: How Language Models Use Long Contexts", arxiv: "2307.03172" },
];

const B_PAPERS: Seed[] = [
  { title: "From Local to Global: A Graph RAG Approach to Query-Focused Summarization", arxiv: "2404.16130" },
  { title: "Graph Retrieval-Augmented Generation: A Survey", arxiv: "2408.08921" },
  { title: "Think-on-Graph: Deep and Responsible Reasoning of Large Language Model on Knowledge Graph", arxiv: "2307.07697" },
  { title: "G-Retriever: Retrieval-Augmented Generation for Textual Graph Understanding and Question Answering", arxiv: "2402.07630" },
  { title: "HippoRAG: Neurobiologically Inspired Long-Term Memory for Large Language Models", arxiv: "2405.14831" },
  { title: "LightRAG: Simple and Fast Retrieval-Augmented Generation", arxiv: "2410.05779" },
];

const C_PAPERS: Seed[] = [
  { title: "Retrieval-Augmented Generation for Large Language Models: A Survey", arxiv: "2312.10997" },
  { title: "Toolformer: Language Models Can Teach Themselves to Use Tools", arxiv: "2302.04761" },
  { title: "ReAct: Synergizing Reasoning and Acting in Language Models", arxiv: "2210.03629" },
  { title: "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models", arxiv: "2201.11903" },
  { title: "Precise Zero-Shot Dense Retrieval without Relevance Labels", arxiv: "2212.10496" },
  { title: "RAPTOR: Recursive Abstractive Processing for Tree-Organized Retrieval", arxiv: "2401.18059" },
  { title: "KILT: a Benchmark for Knowledge Intensive Language Tasks", arxiv: "2009.02252" },
];

async function main() {
  const [workspaceId, ...flags] = process.argv.slice(2);
  if (!workspaceId) {
    console.error("usage: seed-graph.ts <workspaceId> [--reset]");
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const [ws] = await sql<{ owner: string; title: string; name: string | null; email: string | null }[]>`
    select w.workspace_owner as owner, w.title, u.name, u.email
    from workspaces w left join users u on u.id = w.workspace_owner
    where w.id = ${workspaceId}`;
  await sql.end();
  if (!ws) throw new Error(`workspace ${workspaceId} not found`);
  console.log(`Seeding "${ws.title}" (ws:${workspaceId})`);

  const graph = await getWorkspaceGraph(workspaceId);
  if (flags.includes("--reset")) {
    await graph.delete().catch(() => {});
    await ensureSchema(graph); // client caches "schema ready" per graph, so recreate indexes here
    console.log("  · reset graph");
  }

  const users = [
    { id: ws.owner, name: ws.name || ws.email || "You", papers: A_PAPERS },
    { id: "demo-user-bea", name: "Bea (demo)", papers: B_PAPERS },
    { id: "demo-user-chen", name: "Chen (demo)", papers: C_PAPERS },
  ];

  for (const u of users) {
    const items: LibraryItem[] = u.papers.map((p) => ({
      pgPaperId: `seed-${p.arxiv}`,
      title: p.title,
      doi: `10.48550/arXiv.${p.arxiv}`,
      userId: u.id,
      userName: u.name,
      source: "seed",
    }));
    const res = await ingestLibrary(workspaceId, items, {
      maxReferences: 40,
      maxCiting: 15,
      log: (m) => console.log(`  · [${u.name}] ${m}`),
    });
    console.log(
      `  ✓ ${u.name}: ${res.matched}/${res.library} matched, +${res.frontier} frontier, ${res.cites} cites, ${(res.ms / 1000).toFixed(1)}s`,
    );
    if (res.unmatched.length) console.log(`    unmatched: ${res.unmatched.join("; ")}`);
  }

  const fresh = await getWorkspaceGraph(workspaceId);
  console.log("\nGraph:", JSON.stringify((await fresh.roQuery(GRAPH_STATS)).data?.[0]));
  console.log("Imports:", JSON.stringify((await fresh.roQuery(IMPORTS_PER_USER)).data));
  await (await getFalkor()).close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
