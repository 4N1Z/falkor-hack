// Full-text indexing: turns a paper's PDF into passage-level chunks in the workspace graph,
//   (:Chunk {text, embedding})-[:CHUNK_OF]->(:Paper)
// so agents can retrieve and quote actual passages (not just abstracts) when collaborators
// research. Best effort: a PDF that can't be fetched or parsed just leaves the paper
// indexed at title/abstract level.

import { extractText, getDocumentProxy } from "unpdf";
import { getWorkspaceGraph } from "./client";
import { embedTexts } from "./embeddings";
import { normalizeDoi } from "./openalex";
import { DELETE_PAPER_CHUNKS, SET_PAPER_INDEXED, UPSERT_CHUNKS } from "./queries";

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const CHUNK_CHARS = 1200;
const CHUNK_OVERLAP = 150;
/** ~60 passages ≈ a full 15–20 page paper; keeps embedding cost per paper bounded */
const MAX_CHUNKS = 60;

export interface PdfText {
  text: string;
  pages: number;
  /** First DOI printed in the paper, if any (most papers print their own on page 1) */
  doi: string | null;
}

/** Download a PDF and extract its text. Returns null when it isn't a readable PDF. */
export async function fetchPdfText(url: string): Promise<PdfText | null> {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    const bytes = new Uint8Array(await res.arrayBuffer());
    // Publisher "PDF" links sometimes return an HTML landing page instead
    const isPdf = type.includes("pdf") || String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
    if (!isPdf || bytes.byteLength > MAX_PDF_BYTES) return null;

    const pdf = await getDocumentProxy(bytes);
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    const clean = (Array.isArray(text) ? text.join("\n") : text).replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();
    if (clean.length < 200) return null; // scanned PDF without a text layer

    const doiMatch = clean.slice(0, 6000).match(/\b10\.\d{4,9}\/[^\s"<>]+/);
    const doi = doiMatch ? normalizeDoi(doiMatch[0].replace(/[.,;)\]]+$/, "")) : null;
    return { text: clean, pages: totalPages, doi };
  } catch (err) {
    console.error(`[graph] could not read PDF ${url}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Split text into overlapping passages, preferring paragraph / sentence boundaries. */
export function chunkText(text: string): string[] {
  // References sections are noise for retrieval (and inflate chunk counts)
  const body = text.split(/\n\s*(references|bibliography)\s*\n/i)[0] ?? text;
  const chunks: string[] = [];
  let start = 0;
  while (start < body.length && chunks.length < MAX_CHUNKS) {
    let end = Math.min(start + CHUNK_CHARS, body.length);
    if (end < body.length) {
      const window = body.slice(start + CHUNK_CHARS * 0.6, end);
      const breakAt = Math.max(window.lastIndexOf("\n"), window.lastIndexOf(". "));
      if (breakAt > 0) end = start + Math.floor(CHUNK_CHARS * 0.6) + breakAt + 1;
    }
    const chunk = body.slice(start, end).trim();
    if (chunk.length > 80) chunks.push(chunk);
    if (end >= body.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
}

/** Replace a paper's passages in the graph. Returns the number of chunks written. */
export async function indexPaperText(workspaceId: string, paperId: string, text: string): Promise<number> {
  const chunks = chunkText(text);
  if (!chunks.length) return 0;
  const vectors = await embedTexts(chunks);
  const graph = await getWorkspaceGraph(workspaceId);
  const params = <T>(p: T) => ({ params: p as never });

  await graph.query(DELETE_PAPER_CHUNKS, params({ paperId }));
  for (let i = 0; i < chunks.length; i += 50) {
    await graph.query(
      UPSERT_CHUNKS,
      params({
        paperId,
        rows: chunks.slice(i, i + 50).map((t, j) => ({
          id: `${paperId}#${i + j}`,
          idx: i + j,
          text: t,
          embedding: vectors[i + j],
        })),
      }),
    );
  }
  await graph.query(SET_PAPER_INDEXED, params({ paperId, chunks: chunks.length, at: Date.now() }));
  return chunks.length;
}
