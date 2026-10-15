import { after } from "next/server";
import { eq, inArray } from "drizzle-orm";
import db from "@/db";
import { files, users } from "@/db/schema";
import { ingestLibrary, type LibraryItem } from "./ingest";
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
}

const toSource = (s: string | null): LibraryItem["source"] =>
  s === "zotero" || s === "manual" ? s : "other";

/** Ingest papers into the workspace graph now (awaits). Rows may span users, not workspaces. */
export async function ingestPaperRows(rows: PaperRow[]) {
  if (!rows.length) return null;
  const workspaceId = rows[0].workspaceId;
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const names = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(userIds.length === 1 ? eq(users.id, userIds[0]) : inArray(users.id, userIds));
  const nameOf = new Map(names.map((u) => [u.id, u.name || u.email]));

  return ingestLibrary(
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
