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

export interface DocumentText {
  text: string;
  /** First DOI printed in the paper, if any (most papers print their own on page 1) */
  doi: string | null;
}

/**
 * Why a paper does or doesn't have full text in the graph. Shown in the library UI so
 * "abstract only" is never a mystery.
 */
export type FullTextState =
  | "indexed" // passages are in the graph
  | "no_file" // nothing to read (e.g. OpenAlex paper without an open-access PDF)
  | "blocked" // the host refused (publisher 403s are common for servers)
  | "unreadable" // no text layer (scanned) or a corrupt file
  | "too_large" // over MAX_PDF_BYTES
  | "unsupported"; // a format we can't read (e.g. legacy .doc)

export type FetchTextResult = { ok: true; doc: DocumentText } | { ok: false; reason: Exclude<FullTextState, "indexed"> };

const findDoi = (text: string) => {
  const m = text.slice(0, 6000).match(/\b10\.\d{4,9}\/[^\s"<>]+/);
  return m ? normalizeDoi(m[0].replace(/[.,;)\]]+$/, "")) : null;
};

// FalkorDB inlines query params as text and rejects any string containing a NUL byte
// ("Failed to parse the value of parameter"); PDFs often contain them. Strip all C0
// control characters except tab/newline.
// eslint-disable-next-line no-control-regex
const stripControl = (t: string) => t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

const cleanText = (t: string) => stripControl(t).replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();

/** Download a paper's file (PDF or DOCX) and extract its text, or say why it couldn't. */
export async function fetchDocumentText(url: string): Promise<FetchTextResult> {
  let res: Response;
  try {
    res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  } catch {
    return { ok: false, reason: "blocked" };
  }
  if (!res.ok) return { ok: false, reason: "blocked" };

  const type = res.headers.get("content-type") ?? "";
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_PDF_BYTES) return { ok: false, reason: "too_large" };
  const magic = String.fromCharCode(...bytes.slice(0, 5));

  try {
    let text: string;
    if (type.includes("pdf") || magic === "%PDF-") {
      const pdf = await getDocumentProxy(bytes);
      const out = await extractText(pdf, { mergePages: true });
      text = Array.isArray(out.text) ? out.text.join("\n") : out.text;
    } else if (type.includes("wordprocessingml") || (magic.startsWith("PK") && /\.docx(\?|$)/i.test(url))) {
      const mammoth = await import("mammoth");
      text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
    } else if (type.includes("text/html")) {
      // Publisher "PDF" links often answer bots with an HTML landing / challenge page
      return { ok: false, reason: "blocked" };
    } else {
      return { ok: false, reason: "unsupported" };
    }
    const clean = cleanText(text);
    if (clean.length < 200) return { ok: false, reason: "unreadable" }; // scanned, no text layer
    return { ok: true, doc: { text: clean, doi: findDoi(clean) } };
  } catch (err) {
    console.error(`[graph] could not read ${url}:`, err instanceof Error ? err.message : err);
    return { ok: false, reason: "unreadable" };
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
  const vectors = await embedTexts(chunks, "document");
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
