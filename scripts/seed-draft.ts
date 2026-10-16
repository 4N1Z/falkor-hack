/**
 * Create (or refresh) a demo draft in a workspace and mirror it into the graph.
 * The draft is written to exercise every agent:
 *   - a correctly cited, supported claim            → Checker: supported
 *   - a cited claim that contradicts its source      → Checker: contradicted
 *   - a claim citing an unrelated paper              → Checker: unrelated/weak
 *   - uncited claims answerable from A's / Bea's library → Cite Scout suggestions
 *   - a non-claim sentence                           → no citation needed
 *
 *   node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/seed-draft.ts <workspaceId> [--remove]
 */
import { randomUUID } from "crypto";
import postgres from "postgres";
import { getFalkor } from "../src/lib/graph/client";
import { syncDocument, type DocNode } from "../src/lib/graph/sync-document";

const FOLDER_TITLE = "Demo";
const FILE_TITLE = "GraphRAG literature review (draft)";

const cite = (label: string, href: string): DocNode => ({ type: "text", text: ` [${label}]`, marks: [{ type: "link", attrs: { href } }] });
const t = (text: string): DocNode => ({ type: "text", text });
const p = (...content: DocNode[]): DocNode => ({ type: "paragraph", content });
const h = (text: string): DocNode => ({ type: "heading", content: [t(text)] } as DocNode);

const DRAFT: DocNode = {
  type: "doc",
  content: [
    h("Retrieval and graphs for grounded LLM answers"),
    p(t("In this review we organise prior work into three threads and close with open questions for our project.")),
    p(
      t("Retrieval-augmented generation combines a parametric language model with a non-parametric index of documents, and produces more specific and factual answers than parametric-only models."),
      cite("Lewis et al., 2020", "https://doi.org/10.48550/arXiv.2005.11401"),
    ),
    p(
      t("Dense passage retrievers trained on question–passage pairs substantially outperform BM25 for open-domain question answering. "),
      t("Language models also use long retrieved contexts poorly when the relevant passage sits in the middle of the prompt."),
      cite("Wei et al., 2022", "https://arxiv.org/abs/2201.11903"),
    ),
    p(
      t("However, building a graph index over the corpus performs worse than naive RAG on global sensemaking questions about an entire dataset."),
      cite("Edge et al., 2024", "https://arxiv.org/abs/2404.16130"),
    ),
    p(t("Personalized PageRank over a knowledge graph extracted from the corpus can mimic hippocampal indexing and improves multi-hop retrieval at a fraction of the cost of iterative retrieval.")),
  ],
};

async function main() {
  const [workspaceId, ...flags] = process.argv.slice(2);
  if (!workspaceId) throw new Error("usage: seed-draft.ts <workspaceId> [--remove]");
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

  const [ws] = await sql<{ owner: string; name: string | null; email: string | null }[]>`
    select w.workspace_owner as owner, u.name, u.email from workspaces w
    left join users u on u.id = w.workspace_owner where w.id = ${workspaceId}`;
  if (!ws) throw new Error(`workspace ${workspaceId} not found`);

  const [existingFolder] = await sql<{ id: string }[]>`
    select id from folders where workspace_id = ${workspaceId} and title = ${FOLDER_TITLE} limit 1`;

  if (flags.includes("--remove")) {
    if (existingFolder) {
      await sql`delete from files where folder_id = ${existingFolder.id}`;
      await sql`delete from folders where id = ${existingFolder.id}`;
      console.log(`Removed folder "${FOLDER_TITLE}" and its files`);
    }
    await sql.end();
    return;
  }

  const folderId = existingFolder?.id ?? randomUUID();
  if (!existingFolder) {
    await sql`insert into folders (id, title, icon_id, workspace_id, created_at, banner_url)
              values (${folderId}, ${FOLDER_TITLE}, '🧪', ${workspaceId}, now(), '')`;
  }
  const [existingFile] = await sql<{ id: string }[]>`
    select id from files where folder_id = ${folderId} and title = ${FILE_TITLE} limit 1`;
  const fileId = existingFile?.id ?? randomUUID();
  const data = JSON.stringify(DRAFT);
  if (existingFile) {
    await sql`update files set data = ${data}, updated_at = now() where id = ${fileId}`;
  } else {
    await sql`insert into files (id, title, icon_id, data, workspace_id, folder_id, created_at, banner_url)
              values (${fileId}, ${FILE_TITLE}, '📝', ${data}, ${workspaceId}, ${folderId}, now(), '')`;
  }
  await sql.end();
  console.log(`${existingFile ? "Updated" : "Created"} "${FOLDER_TITLE}/${FILE_TITLE}"`);
  console.log(`  open: /dashboard/${workspaceId}/${fileId}`);

  const res = await syncDocument({
    workspaceId,
    fileId,
    title: FILE_TITLE,
    userId: ws.owner,
    userName: ws.name || ws.email,
    doc: DRAFT,
  });
  console.log(`  graph: ${res.claims} claims, ${res.cited} citations resolved, unresolved: ${JSON.stringify(res.unresolved)}`);
  await (await getFalkor()).close();
}

main().catch((e) => { console.error(e); process.exit(1); });
