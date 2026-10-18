// Full-text indexing: turns a paper's PDF (or DOCX / HTML artefact) into passage-level chunks
// in the workspace graph,
//   (:Chunk {text, embedding, page, section, kind})-[:CHUNK_OF]->(:Paper)
// so agents can quote actual passages with a page and a section. This is the foundation of
// adam (docs/adam-spec-creation.md, "Full-text indexing requirements"):
//   - chunks follow the paper's sections (Methods, Results, Discussion…), never a fixed token
//     count across a section boundary, so the Extractor knows where a statement was made
//     (a sentence in Results is evidence; the same sentence in Discussion is speculation)
//   - every chunk carries its page range, so a claim can point to "p.7, Results"
//   - figure / table captions are their own chunks (kind:'caption'), because that is where
//     the numbers live
//   - supplementary materials and linked artefacts are indexed as extra documents of the
//     same paper (doc:'supplement' | 'artefact')
// Best effort: a PDF that can't be fetched or parsed just leaves the paper indexed at
// title/abstract level (accessStatus:'abstract_only').

import { createHash } from "crypto";
import { extractText, getDocumentProxy } from "unpdf";

/**
 * PDF.js (the bundle unpdf ships) uses the `Iterator` global, which Node added in 22. On an older
 * runtime every PDF read throws "Iterator is not defined" and the whole pipeline quietly degrades
 * to abstracts. Name the cause once, loudly, instead of failing paper by paper.
 */
export function fullTextRuntimeIssue(): string | null {
  const major = Number(process.versions.node.split(".")[0]);
  if (typeof (globalThis as { Iterator?: unknown }).Iterator !== "undefined" && major >= 22) return null;
  return `Node ${process.versions.node} cannot run PDF.js (it needs the Iterator global, Node 22+): no PDF full text will be read until the runtime is upgraded`;
}
let warnedRuntime = false;
import { getWorkspaceGraph } from "./client";
import { embedTexts } from "./embeddings";
import { normalizeDoi } from "./openalex";
import { DELETE_PAPER_CHUNKS, PAPER_TEXT_VERSION, SET_PAPER_INDEXED, UPSERT_CHUNKS } from "./queries";

const MAX_PDF_BYTES = 25 * 1024 * 1024;
/** Target passage size. Sections are split at paragraph / sentence boundaries near this. */
const CHUNK_CHARS = 1500;
const CHUNK_OVERLAP = 100;
/** Per document. Over this, chunks grow (never dropped) so Discussion / Limitations survive. */
export const DEFAULT_MAX_CHUNKS = 150;
/** A caption chunk: the caption line plus the lines that follow it (table rows), bounded. */
const CAPTION_MAX_LINES = 8;
const CAPTION_MAX_CHARS = 1200;

// ---------------------------------------------------------------- Types

/** Where in a paper a passage lives. `unknown` is honest: never guessed. */
export type Section =
  | "front" // title, authors, affiliations: text before the first recognised heading
  | "abstract"
  | "introduction"
  | "related"
  | "methods"
  | "results"
  | "discussion"
  | "limitations"
  | "conclusion"
  | "appendix"
  | "supplementary"
  | "unknown";

export type ChunkKind = "body" | "caption";
/** Which document of a paper a chunk came from. */
export type ChunkDoc = "body" | "supplement" | "artefact";

export interface Passage {
  idx: number;
  text: string;
  /** 1-based page where the passage starts / ends (1 for single-page sources) */
  page: number;
  pageEnd: number;
  section: Section;
  /** The heading as printed, e.g. "3.2 Experimental setup" */
  sectionRaw: string | null;
  kind: ChunkKind;
  /** For captions: "Figure 3", "Table 2", "Supplementary Figure S1" */
  locator: string | null;
  /** Char offset of the passage in the document's joined text (section-local text is not addressable) */
  charStart: number;
}

export interface DocumentText {
  /** Whole document text, pages joined by newlines */
  text: string;
  /** Per-page text (one entry for DOCX / HTML sources) */
  pages: string[];
  /** First DOI printed in the paper, if any (most papers print their own on page 1) */
  doi: string | null;
  /** sha1 of `text`, so a re-index can tell a new version (preprints change) from a re-run */
  sha1: string;
  format: "pdf" | "docx" | "html";
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

/** Access status recorded on the Paper node (spec: "Access status per paper"). */
export type AccessStatus = "full_text" | "abstract_only" | "unavailable";

export type FetchTextResult = { ok: true; doc: DocumentText } | { ok: false; reason: Exclude<FullTextState, "indexed"> };

// ---------------------------------------------------------------- Text cleaning

const findDoi = (text: string) => {
  const m = text.slice(0, 6000).match(/\b10\.\d{4,9}\/[^\s"<>]+/);
  return m ? normalizeDoi(m[0].replace(/[.,;)\]]+$/, "")) : null;
};

// FalkorDB inlines query params as text and rejects any string containing a NUL byte
// ("Failed to parse the value of parameter"); PDFs often contain them. Strip all C0
// control characters except tab/newline.
// eslint-disable-next-line no-control-regex
const stripControl = (t: string) => t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

const cleanText = (t: string) =>
  stripControl(t)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();

const sha1 = (t: string) => createHash("sha1").update(t).digest("hex");

function toDocumentText(pages: string[], format: DocumentText["format"]): DocumentText {
  const cleanPages = pages.map(cleanText);
  const text = cleanPages.join("\n\n");
  return { text, pages: cleanPages, doi: findDoi(text), sha1: sha1(text), format };
}

/** Minimal HTML → text that keeps headings on their own lines (arXiv HTML, READMEs, protocols). */
export function htmlToText(html: string): string {
  const decode = (s: string) =>
    s
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  return decode(
    html
      .replace(/<(script|style|nav|footer|svg|noscript)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/(h[1-6]|p|div|li|tr|section|article|blockquote|pre|figcaption|caption|dt|dd)>/gi, "\n")
      .replace(/<(br|hr)\s*\/?>/gi, "\n")
      .replace(/<\/(td|th)>/gi, " | ")
      .replace(/<h[1-6][^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\n{3,}/g, "\n\n");
}

// ---------------------------------------------------------------- Fetch

export interface FetchOptions {
  /** Accept HTML pages (arXiv HTML, GitHub READMEs, protocols.io). Off for PDF links, where HTML means a bot wall. */
  allowHtml?: boolean;
}

/** Download a paper's file (PDF, DOCX, or HTML artefact) and extract its text, or say why it couldn't. */
export async function fetchDocumentText(url: string, opts: FetchOptions = {}): Promise<FetchTextResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
      headers: { "User-Agent": "neura-query/1.0 (research indexing; mailto:dev@neuraquery.com)" },
    });
  } catch {
    return { ok: false, reason: "blocked" };
  }
  if (!res.ok) return { ok: false, reason: "blocked" };

  const type = res.headers.get("content-type") ?? "";
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_PDF_BYTES) return { ok: false, reason: "too_large" };
  const magic = String.fromCharCode(...bytes.slice(0, 5));

  try {
    if (type.includes("pdf") || magic === "%PDF-") {
      const runtime = fullTextRuntimeIssue();
      if (runtime) {
        if (!warnedRuntime) console.error(`[graph] ${runtime}`);
        warnedRuntime = true;
        return { ok: false, reason: "unreadable" };
      }
      const pdf = await getDocumentProxy(bytes);
      const out = await extractText(pdf, { mergePages: false });
      const doc = toDocumentText(out.text, "pdf");
      if (doc.text.length < 200) return { ok: false, reason: "unreadable" }; // scanned, no text layer
      return { ok: true, doc };
    }
    if (type.includes("wordprocessingml") || (magic.startsWith("PK") && /\.docx(\?|$)/i.test(url))) {
      const mammoth = await import("mammoth");
      const text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
      const doc = toDocumentText([text], "docx");
      if (doc.text.length < 200) return { ok: false, reason: "unreadable" };
      return { ok: true, doc };
    }
    if (type.includes("text/html") || type.includes("text/plain") || type.includes("markdown")) {
      // Publisher "PDF" links often answer bots with an HTML landing / challenge page
      if (!opts.allowHtml) return { ok: false, reason: "blocked" };
      const raw = new TextDecoder().decode(bytes);
      const text = type.includes("html") ? htmlToText(raw) : raw;
      const doc = toDocumentText([text], "html");
      if (doc.text.length < 200) return { ok: false, reason: "unreadable" };
      return { ok: true, doc };
    }
    return { ok: false, reason: "unsupported" };
  } catch (err) {
    console.error(`[graph] could not read ${url}:`, err instanceof Error ? err.message : err);
    return { ok: false, reason: "unreadable" };
  }
}

// ---------------------------------------------------------------- Section detection

const HEADING_WORDS =
  "abstract|summary|introduction|background|motivation|related works?|prior work|literature review|preliminaries|" +
  "materials and methods|methods?|methodology|approach|model|proposed method|experimental (?:setup|settings?|procedures?|details|design)|experiments?|evaluation|" +
  "results?(?: and discussion)?|findings|analysis|discussion(?: and conclusions?)?|limitations?(?: and future work)?|" +
  "conclusions?(?: and future work)?|future work|broader impacts?|ethics statement|acknowledg(?:e)?ments?|funding|" +
  "references|bibliography|appendix(?:es)?|appendices|supplementary (?:materials?|information|notes?|methods?|results?|data)|supplemental (?:materials?|information)|supporting information";

/** Numbering prefixes: "3", "3.2", "3.2.1", "III.", "A.", "A.1", "Appendix A" is handled by the word list */
const NUMBERING = "(?:(?:\\d{1,2}(?:\\.\\d{1,2}){0,2}\\.?|[IVX]{1,5}\\.?|[A-H](?:\\.\\d{1,2})?\\.?)\\s+)";

/** Whole line is a heading: optional number + heading word (+ optional short subtitle for appendix). */
const HEADING_LINE = new RegExp(`^\\s*${NUMBERING}?(${HEADING_WORDS})(?:\\s*[:.—–-]\\s*(.{0,60}))?\\s*$`, "i");
/** Numbered heading glued to the first body sentence (two-column PDFs): "3 Methods We propose…" */
const HEADING_GLUED = new RegExp(`^\\s*${NUMBERING}(${HEADING_WORDS})\\b(?=\\s+[A-Z])`, "i");
/** A sub-heading inside a known section: "3.2 Datasets" keeps the section, records the raw heading. */
const SUBHEADING_LINE = /^\s*\d{1,2}\.\d{1,2}(?:\.\d{1,2})?\.?\s+[A-Z][^.]{2,70}$/;
/**
 * A numbered top-level heading that is not a standard section name ("II. OVERVIEW OF RAG",
 * "4 Retrieval"): the previous section no longer applies, so the section becomes `unknown`
 * (honest) rather than carrying "introduction" through the whole paper.
 */
const GENERIC_TOP_HEADING = /^\s*(?:\d{1,2}|[IVX]{1,5})\.?\s+[A-Z][A-Za-z][A-Za-z ,:&'()/-]{1,58}$/;

/**
 * A caption line: "Figure 3: …", "Table 2. …", "Fig. 1 | …". The separator is required so
 * body sentences like "Table 1 shows results…" are not taken for captions.
 */
const CAPTION_START =
  /^\s*((?:supplementary|extended data|supp\.?|suppl\.?)\s+)?(figure|fig\.?|table|tab\.?|algorithm|listing|scheme)\s*(S?\d+[a-z]?)\s*[.:|]\s*(\S.*)?$/i;

export function normalizeSection(raw: string): Section {
  const w = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (/^(abstract|summary)$/.test(w)) return "abstract";
  if (/^(introduction|background|motivation)$/.test(w)) return "introduction";
  if (/^(related|prior|literature|preliminaries)/.test(w)) return "related";
  if (/^(materials|methods?$|methodology|approach|model$|proposed|experimental)/.test(w)) return "methods";
  if (/^(experiments?|evaluation|results?|findings|analysis)/.test(w)) return "results";
  if (/^discussion/.test(w)) return "discussion";
  if (/^(limitations?|broader|ethics)/.test(w)) return "limitations";
  if (/^(conclusions?|future work)/.test(w)) return "conclusion";
  if (/^(appendix|appendices)/.test(w)) return "appendix";
  if (/^(supplementary|supplemental|supporting)/.test(w)) return "supplementary";
  // acknowledgements / funding / references / bibliography: skipped by the chunker
  return "unknown";
}

/** Sections that hold no claims and inflate chunk counts. Dropped (OpenAlex supplies references). */
const SKIPPED = /^(acknowledg(?:e)?ments?|funding|references|bibliography)$/i;

interface Line {
  text: string;
  page: number;
}

interface Block {
  section: Section;
  sectionRaw: string | null;
  kind: ChunkKind;
  locator: string | null;
  lines: Line[];
}

/**
 * Walk the pages line by line, assigning each line to a section and pulling captions out as
 * their own blocks. The current section is carried forward until the next recognised heading.
 */
function segment(pages: string[], defaultSection: Section): Block[] {
  const blocks: Block[] = [];
  let section: Section = defaultSection;
  let sectionRaw: string | null = null;
  let skipping = false;
  let current: Block | null = null;
  let caption: { block: Block; lines: number } | null = null;

  const open = (kind: ChunkKind, locator: string | null) => {
    const b: Block = { section, sectionRaw, kind, locator, lines: [] };
    blocks.push(b);
    return b;
  };

  pages.forEach((pageText, i) => {
    const page = i + 1;
    for (const rawLine of pageText.split("\n")) {
      const line = rawLine.trim();
      if (!line) {
        // Blank line ends a caption block
        if (caption) caption = null;
        continue;
      }

      const heading = line.length <= 90 ? line.match(HEADING_LINE) : null;
      const glued = heading ? null : line.match(HEADING_GLUED);
      if (heading || glued) {
        const word = (heading ?? glued)![1];
        if (SKIPPED.test(word.trim())) {
          skipping = true;
          current = null;
          caption = null;
          continue;
        }
        skipping = false;
        section = normalizeSection(word);
        sectionRaw = heading ? line.replace(/\s+/g, " ") : (glued![0] ?? word).trim();
        current = null;
        caption = null;
        if (glued) {
          // Keep the body text that followed the heading on the same line
          const rest = line.slice(glued[0].length).trim();
          if (rest) (current = open("body", null)).lines.push({ text: rest, page });
        }
        continue;
      }
      if (skipping) continue;

      if (SUBHEADING_LINE.test(line)) {
        sectionRaw = line.replace(/\s+/g, " ");
        current = null;
        caption = null;
        continue;
      }
      if (GENERIC_TOP_HEADING.test(line) && !/\b(et al|see|shows|table|figure)\b/i.test(line)) {
        section = "unknown";
        sectionRaw = line.replace(/\s+/g, " ");
        current = null;
        caption = null;
        continue;
      }

      const cap = line.match(CAPTION_START);
      if (cap) {
        const prefix = cap[1] ? cap[1].trim().replace(/\.$/, "") + " " : "";
        const kindWord = cap[2].toLowerCase().startsWith("fig") ? "Figure" : cap[2].toLowerCase().startsWith("tab") ? "Table" : cap[2][0].toUpperCase() + cap[2].slice(1).toLowerCase();
        const locator = `${prefix}${kindWord} ${cap[3]}`.replace(/^supplementary/i, "Supplementary");
        const block = open("caption", locator);
        block.lines.push({ text: line, page });
        caption = { block, lines: 1 };
        current = null;
        continue;
      }

      if (caption) {
        const chars = caption.block.lines.reduce((n, l) => n + l.text.length + 1, 0);
        if (caption.lines < CAPTION_MAX_LINES && chars + line.length <= CAPTION_MAX_CHARS) {
          caption.block.lines.push({ text: line, page });
          caption.lines++;
          continue;
        }
        caption = null;
      }

      if (!current || current.kind !== "body" || current.section !== section) current = open("body", null);
      current.lines.push({ text: line, page });
    }
  });

  return blocks.filter((b) => b.lines.length);
}

// ---------------------------------------------------------------- Chunking

/** Join a block's lines, de-hyphenating line breaks, and keep a (char offset → page) map. */
function joinLines(lines: Line[]): { text: string; pageAt: (offset: number) => number } {
  const starts: { at: number; page: number }[] = [];
  let text = "";
  for (const l of lines) {
    if (text) {
      // "exper-\niment" → "experiment"; otherwise a space, keeping a newline between paragraphs
      if (/[a-z]-$/.test(text) && /^[a-z]/.test(l.text)) text = text.slice(0, -1);
      else text += /[.!?:]$/.test(text) ? "\n" : " ";
    }
    starts.push({ at: text.length, page: l.page });
    text += l.text;
  }
  const pageAt = (offset: number) => {
    let page = starts[0]?.page ?? 1;
    for (const s of starts) {
      if (s.at > offset) break;
      page = s.page;
    }
    return page;
  };
  return { text, pageAt };
}

/** Split one block's text into passages near `size` chars at paragraph / sentence boundaries. */
function splitBlock(text: string, size: number): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const window = text.slice(start + Math.floor(size * 0.6), end);
      const breakAt = Math.max(window.lastIndexOf("\n"), window.lastIndexOf(". "));
      if (breakAt > 0) end = start + Math.floor(size * 0.6) + breakAt + 1;
    }
    const piece = text.slice(start, end);
    if (piece.trim().length > 80) out.push({ text: piece.trim(), start: start + (piece.length - piece.trimStart().length) });
    else if (out.length) out[out.length - 1].text += (out[out.length - 1].text ? " " : "") + piece.trim();
    if (end >= text.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }
  return out;
}

export interface ChunkOptions {
  maxChunks?: number;
  /** Section assumed before the first heading (e.g. 'supplementary' for a supplement file) */
  defaultSection?: Section;
}

/**
 * Section-aware chunking of a document's pages. Passages never cross a section boundary;
 * captions are their own passages; every passage knows its page range.
 */
export function chunkDocument(pages: string[], opts: ChunkOptions = {}): Passage[] {
  const maxChunks = opts.maxChunks ?? DEFAULT_MAX_CHUNKS;
  const blocks = segment(pages, opts.defaultSection ?? "front");
  const joined = blocks.map((b) => ({ block: b, ...joinLines(b.lines) }));

  // Adaptive size: over the cap, passages grow instead of the tail of the paper being dropped
  const totalChars = joined.reduce((n, j) => n + j.text.length, 0);
  const size = Math.max(CHUNK_CHARS, Math.ceil((totalChars / maxChunks) * 1.15));

  const passages: Passage[] = [];
  let docOffset = 0;
  for (const { block, text, pageAt } of joined) {
    const pieces = block.kind === "caption" ? [{ text, start: 0 }] : splitBlock(text, size);
    for (const piece of pieces) {
      if (passages.length >= maxChunks) break;
      passages.push({
        idx: passages.length,
        text: piece.text,
        page: pageAt(piece.start),
        pageEnd: pageAt(piece.start + piece.text.length - 1),
        section: block.section,
        sectionRaw: block.sectionRaw,
        kind: block.kind,
        locator: block.locator,
        charStart: docOffset + piece.start,
      });
    }
    docOffset += text.length + 2;
  }
  return passages;
}

/** Plain-text convenience (single page, no section info). Kept for callers that only have a string. */
export function chunkText(text: string): string[] {
  return chunkDocument([text]).map((p) => p.text);
}

// ---------------------------------------------------------------- Index (graph writes)

export interface IndexOptions extends ChunkOptions {
  /** Which document of the paper this is. Re-indexing one kind never touches the others. */
  doc?: ChunkDoc;
  /** Where the text came from (supplement / artefact URL), recorded on each chunk */
  sourceUrl?: string | null;
}

const CHUNK_PREFIX: Record<ChunkDoc, string> = { body: "b", supplement: "s", artefact: "a" };

/**
 * Replace a paper's passages (of one document kind) in the graph. Returns the number written.
 * Accepts a parsed document (page-aware) or a plain string.
 */
export async function indexPaperText(
  workspaceId: string,
  paperId: string,
  doc: DocumentText | string,
  opts: IndexOptions = {},
): Promise<number> {
  const kind: ChunkDoc = opts.doc ?? "body";
  const pages = typeof doc === "string" ? [doc] : doc.pages;
  const passages = chunkDocument(pages, {
    maxChunks: opts.maxChunks,
    defaultSection: opts.defaultSection ?? (kind === "supplement" ? "supplementary" : kind === "artefact" ? "unknown" : "front"),
  });
  const graph = await getWorkspaceGraph(workspaceId);
  const params = <T>(p: T) => ({ params: p as never });

  await graph.query(DELETE_PAPER_CHUNKS, params({ paperId, doc: kind }));
  if (!passages.length) return 0;

  const vectors = await embedTexts(passages.map((p) => p.text), "document");
  const prefix = CHUNK_PREFIX[kind];
  for (let i = 0; i < passages.length; i += 50) {
    await graph.query(
      UPSERT_CHUNKS,
      params({
        paperId,
        doc: kind,
        sourceUrl: opts.sourceUrl ?? null,
        rows: passages.slice(i, i + 50).map((p, j) => ({
          id: `${paperId}#${prefix}${p.idx}`,
          idx: p.idx,
          text: p.text,
          embedding: vectors[i + j],
          page: p.page,
          pageEnd: p.pageEnd,
          section: p.section,
          sectionRaw: p.sectionRaw,
          kind: p.kind,
          locator: p.locator,
          charStart: p.charStart,
        })),
      }),
    );
  }

  if (kind === "body") {
    const textSha1 = typeof doc === "string" ? sha1(doc) : doc.sha1;
    // Preprints change: a different sha is a new version, and anything extracted from the old
    // version is marked stale by the adam orchestrator.
    const prev = (await graph.roQuery<{ sha: string | null; version: number | null }>(PAPER_TEXT_VERSION, params({ paperId }))).data?.[0];
    const textVersion = prev?.sha === textSha1 ? (prev.version ?? 1) : (prev?.version ?? 0) + 1;
    await graph.query(
      SET_PAPER_INDEXED,
      params({ paperId, chunks: passages.length, at: Date.now(), textSha1, textVersion, pages: pages.length }),
    );
  }
  return passages.length;
}
