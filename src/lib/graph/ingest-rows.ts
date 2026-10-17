// The Librarian pipeline for rows of the Postgres `papers` table, runnable from anywhere:
// Next route handlers (via hooks.ts, which wraps it in `after()`), scripts, and the adam
// worker (scripts/adam-worker.ts). This file must not import `next/server`.

import { eq, inArray } from "drizzle-orm";
import db from "@/db";
import { papers, users } from "@/db/schema";
import { getWorkspaceGraph } from "./client";
import { fetchDocumentText, indexPaperText, type DocumentText, type FullTextState } from "./document-index";
import { ingestLibrary, type LibraryItem } from "./ingest";
import { MARK_INGESTED, PAPERS_BY_PG_ID, SET_PAPER_ACCESS, UPSERT_INGEST_STATUS } from "./queries";

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

export interface IngestRowsOptions {
  /** Passages per paper. The library default keeps embedding cost bounded; adam asks for more. */
  maxChunks?: number;
}

const toSource = (s: string | null): LibraryItem["source"] =>
  s === "zotero" || s === "manual" || s === "seed" ? s : "other";

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
export async function ingestPaperRows(rows: PaperRow[], opts: IngestRowsOptions = {}) {
  if (!rows.length) return null;
  const workspaceId = rows[0].workspaceId;
  await setIngestStatus(workspaceId, rows.map((r) => ({ pgPaperId: r.id, state: "indexing" })));
  try {
    const result = await runIngest(rows, opts);
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
 * 3. Full text: section-aware passages → (:Chunk)-[:CHUNK_OF]->(:Paper), access status on the Paper
 */
async function runIngest(rows: PaperRow[], opts: IngestRowsOptions) {
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
  const graph = await getWorkspaceGraph(workspaceId);
  if (pdfText.size) {
    const nodes =
      (await graph.roQuery<{ pgPaperId: string; paperId: string }>(PAPERS_BY_PG_ID, {
        params: { pgIds: [...pdfText.keys()] } as never,
      })).data ?? [];
    for (const { pgPaperId, paperId } of nodes) {
      const n = await indexPaperText(workspaceId, paperId, pdfText.get(pgPaperId)!, { maxChunks: opts.maxChunks }).catch((err) => {
        console.error(`[graph] full-text indexing failed for ${paperId}`, err);
        return 0;
      });
      chunks += n;
      fullTextState.set(pgPaperId, n > 0 ? "indexed" : "unreadable");
    }
  }
  // Access status for papers without passages (spec: abstract-only claims are capped)
  const noText = rows.filter((r) => fullTextState.get(r.id) !== "indexed");
  for (const state of new Set(noText.map((r) => fullTextState.get(r.id) ?? "no_file"))) {
    const pgIds = noText.filter((r) => (fullTextState.get(r.id) ?? "no_file") === state).map((r) => r.id);
    await graph.query(SET_PAPER_ACCESS, { params: { pgIds, state } as never }).catch(() => {});
  }
  // Legacy done marker (kept for papers indexed before IngestStatus existed)
  await graph.query(MARK_INGESTED, { params: { pgIds: rows.map((r) => r.id), at: Date.now() } as never });
  return { ...result, fullText: pdfText.size, chunks, fullTextState };
}
