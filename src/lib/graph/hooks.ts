import { after } from "next/server";
import { eq, inArray } from "drizzle-orm";
import db from "@/db";
import { files, papers, users } from "@/db/schema";
import { getWorkspaceGraph } from "./client";
import { fetchDocumentText, indexPaperText, type DocumentText, type FullTextState } from "./document-index";
import { ingestLibrary, type LibraryItem } from "./ingest";
import { MARK_INGESTED, PAPERS_BY_PG_ID, UPSERT_INGEST_STATUS } from "./queries";
import { syncDocument, type DocNode } from "./sync-document";

/** The subset of a `papers` row the Librarian needs. */
export interface PaperRow {
  id: string;
  title: string;
  abstract: string | null;
  doi: string | null;
  userId: string;
  workspaceId: string;
  source: string | null;
  uploadUrl?: string | null;
}

const toSource = (s: string | null): LibraryItem["source"] =>
  s === "zotero" || s === "manual" ? s : "other";

/** Text between an "Abstract" heading and the introduction, for PDFs uploaded without one. */
function abstractFromText(text: string): string | null {
  const m = text.slice(0, 8000).match(/abstract[\s.:—-]*\n?([\s\S]{200,2500}?)(?:\n\s*(?:\d\.?\s*)?(?:introduction|keywords|index terms)\b)/i);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

type IngestState = "indexing" | "done" | "failed";

/** Record index health in the workspace graph (best effort: never fails the ingest). */
export async function setIngestStatus(
  workspaceId: string,
  rows: { pgPaperId: string; state: IngestState; error?: string | null; fullText?: FullTextState | null }[],
) {
  if (!rows.length) return;
  try {
    const graph = await getWorkspaceGraph(workspaceId);
    const at = Date.now();
    await graph.query(UPSERT_INGEST_STATUS, {
      params: {
        rows: rows.map((r) => ({ pgPaperId: r.pgPaperId, state: r.state, error: r.error ?? null, fullText: r.fullText ?? null, at })),
      } as never,
    });
  } catch (err) {
    console.error("[graph] could not record ingest status", err);
  }
}

/**
 * Ingest papers into the workspace graph now (awaits). Rows may span users, not workspaces.
 * Status is tracked per paper in the graph: indexing → done (with full-text outcome) | failed.
 */
export async function ingestPaperRows(rows: PaperRow[]) {
  if (!rows.length) return null;
  const workspaceId = rows[0].workspaceId;
  await setIngestStatus(workspaceId, rows.map((r) => ({ pgPaperId: r.id, state: "indexing" })));
  try {
    const result = await runIngest(rows);
    await setIngestStatus(
      workspaceId,
      rows.map((r) => ({ pgPaperId: r.id, state: "done", fullText: result.fullTextState.get(r.id) ?? "no_file" })),
    );
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setIngestStatus(workspaceId, rows.map((r) => ({ pgPaperId: r.id, state: "failed", error: message.slice(0, 300) })));
    throw err;
  }
}

/**
 * 1. Read each file once (PDF/DOCX): fills a missing DOI / abstract (also saved back to Postgres)
 * 2. Librarian: OpenAlex resolution, citations, authors, concepts, embeddings
 * 3. Full text: passages → (:Chunk)-[:CHUNK_OF]->(:Paper) for passage-level retrieval
 */
async function runIngest(rows: PaperRow[]) {
  const workspaceId = rows[0].workspaceId;
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const names = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(userIds.length === 1 ? eq(users.id, userIds[0]) : inArray(users.id, userIds));
  const nameOf = new Map(names.map((u) => [u.id, u.name || u.email]));

  // 1. Files (sequential: bounded memory, and these are usually 1–10 papers)
  const pdfText = new Map<string, DocumentText>();
  const fullTextState = new Map<string, FullTextState>();
  for (const r of rows) {
    if (!r.uploadUrl) {
      fullTextState.set(r.id, "no_file");
      continue;
    }
    const fetched = await fetchDocumentText(r.uploadUrl);
    if (!fetched.ok) {
      fullTextState.set(r.id, fetched.reason);
      continue;
    }
    const pdf = fetched.doc;
    pdfText.set(r.id, pdf);
    const doi = r.doi || pdf.doi;
    const abstract = r.abstract?.trim() || abstractFromText(pdf.text);
    if ((doi && doi !== r.doi) || (abstract && abstract !== r.abstract)) {
      r.doi = doi;
      r.abstract = abstract;
      await db.update(papers).set({ doi, abstract }).where(eq(papers.id, r.id)).catch(() => {});
    }
  }

  // 2. Librarian
  const result = await ingestLibrary(
    workspaceId,
    rows.map((r) => ({
      pgPaperId: r.id,
      title: r.title,
      abstract: r.abstract,
      doi: r.doi,
      userId: r.userId,
      userName: nameOf.get(r.userId) ?? null,
      source: toSource(r.source),
    })),
  );

  // 3. Full text, attached to whichever node the Librarian settled on for each paper
  let chunks = 0;
  if (pdfText.size) {
    const graph = await getWorkspaceGraph(workspaceId);
    const nodes =
      (await graph.roQuery<{ pgPaperId: string; paperId: string }>(PAPERS_BY_PG_ID, {
        params: { pgIds: [...pdfText.keys()] } as never,
      })).data ?? [];
    for (const { pgPaperId, paperId } of nodes) {
      const n = await indexPaperText(workspaceId, paperId, pdfText.get(pgPaperId)!.text).catch((err) => {
        console.error(`[graph] full-text indexing failed for ${paperId}`, err);
        return 0;
      });
      chunks += n;
      fullTextState.set(pgPaperId, n > 0 ? "indexed" : "unreadable");
    }
  }
  // Legacy done marker (kept for papers indexed before IngestStatus existed)
  const graph = await getWorkspaceGraph(workspaceId);
  await graph.query(MARK_INGESTED, { params: { pgIds: rows.map((r) => r.id), at: Date.now() } as never });
  return { ...result, fullText: pdfText.size, chunks, fullTextState };
}

/**
 * Run the Librarian after the response is sent, so importing a paper never waits on
 * OpenAlex/embeddings. Graph sync failures are logged, never surfaced to the import.
 */
export function scheduleLibraryIngest(rows: PaperRow[]) {
  if (!rows.length) return;
  after(async () => {
    try {
      const result = await ingestPaperRows(rows);
      console.log(`[graph] ingested ${rows.length} paper(s) into ws:${rows[0].workspaceId}`, result);
    } catch (err) {
      console.error(`[graph] ingest failed for ws:${rows[0].workspaceId}`, err);
    }
  });
}

/**
 * After a document save, mirror its sentences and citations into the graph.
 * `data` is the TipTap JSON string the editor saves into files.data.
 */
export function scheduleDocumentSync(input: { fileId: string; data: string; userId: string; userName: string | null }) {
  after(async () => {
    try {
      const [file] = await db
        .select({ workspaceId: files.workspaceId, title: files.title })
        .from(files)
        .where(eq(files.id, input.fileId));
      if (!file) return;
      const result = await syncDocument({
        workspaceId: file.workspaceId,
        fileId: input.fileId,
        title: file.title,
        userId: input.userId,
        userName: input.userName,
        doc: JSON.parse(input.data) as DocNode,
      });
      if (result.unresolved.length) {
        console.log(`[graph] doc ${input.fileId}: ${result.unresolved.length} citation(s) not in the graph yet`);
      }
    } catch (err) {
      console.error(`[graph] document sync failed for ${input.fileId}`, err);
    }
  });
}
