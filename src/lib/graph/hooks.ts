// Request-lifecycle wrappers around the graph pipelines: run the Librarian or a document
// sync after the response is sent (Next `after()`). The pipelines themselves live in
// ingest-rows.ts / sync-document.ts so scripts and the adam worker can call them directly.

import { after } from "next/server";
import { eq } from "drizzle-orm";
import db from "@/db";
import { files } from "@/db/schema";
import { ingestPaperRows, type PaperRow } from "./ingest-rows";
import { syncDocument, type DocNode } from "./sync-document";

export { ingestPaperRows, setIngestStatus, type PaperRow } from "./ingest-rows";

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
