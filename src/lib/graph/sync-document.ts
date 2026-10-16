// Mirrors a neura-query document into the workspace graph:
//   (User)-[:EDITS]->(Document)-[:CONTAINS]->(Claim)-[:CITES]->(Paper)
// Claims are sentences, keyed by a hash of their text, so unchanged sentences keep their
// id (and any agent verdicts attached to them) across saves. Citations are the link marks
// the editor inserts (doi.org / arxiv.org / semanticscholar.org URLs).

import { createHash } from "crypto";
import { getWorkspaceGraph } from "./client";
import { arxivIdFromDoi, normalizeDoi } from "./openalex";
import {
  DELETE_CLAIM_CITES,
  DELETE_STALE_CLAIMS,
  INSERT_CLAIM_CITES,
  RESOLVE_CITED_PAPERS,
  UPSERT_CLAIMS,
  UPSERT_DOCUMENT,
} from "./queries";

/** Minimal TipTap / ProseMirror JSON shape. */
export interface DocNode {
  type?: string;
  text?: string;
  marks?: { type: string; attrs?: { href?: string | null } }[];
  content?: DocNode[];
}

export interface ParsedClaim {
  id: string;
  text: string;
  order: number;
  /** Raw hrefs of citation links inside the sentence */
  citedUrls: string[];
}

export interface CitationKey {
  doi?: string;
  arxivId?: string;
  s2Id?: string;
  /** OpenAlex work id, the graph's own node key */
  paperId?: string;
}

const TEXT_BLOCKS = new Set(["paragraph", "blockquote"]);
const MIN_CLAIM_CHARS = 25;
// Don't split after these (they end in "." but don't end a sentence)
const ABBREVIATIONS = /(?:\bet al|\be\.g|\bi\.e|\bvs|\bfig|\bcf|\bapprox|\bno|\bvol|\bpp|\beq|\bsec)\.$/i;

/** Parse a citation URL into lookup keys. */
export function parseCitationUrl(href: string): CitationKey | null {
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "doi.org" || host === "dx.doi.org") {
      const doi = normalizeDoi(decodeURIComponent(url.pathname.slice(1)))!;
      return { doi, arxivId: arxivIdFromDoi(doi) ?? undefined };
    }
    if (host === "arxiv.org") {
      const id = url.pathname.match(/\/(?:abs|pdf)\/([^/?#]+?)(?:v\d+)?(?:\.pdf)?$/)?.[1];
      return id ? { arxivId: id.toLowerCase(), doi: `10.48550/arxiv.${id.toLowerCase()}` } : null;
    }
    if (host === "openalex.org") {
      const id = url.pathname.match(/\/(W\d+)/i)?.[1];
      return id ? { paperId: id.toUpperCase() } : null;
    }
    if (host === "semanticscholar.org" || host === "api.semanticscholar.org") {
      const id = url.pathname.split("/").filter(Boolean).pop();
      return id ? { s2Id: id } : null;
    }
  } catch {
    // not a URL
  }
  return null;
}

/** Split a block's text into sentences, keeping character offsets. */
function splitSentences(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let start = 0;
  // Citations placed after the full stop ("…models. [Lewis et al., 2020] Next…") stay with
  // the sentence they follow: the boundary is after them, and "[" never starts a sentence.
  const boundary = /[.!?]["')\]]?((?:\s*\[[^\]\n]{1,120}\])*)\s+(?=["'(]?[A-Z0-9])/g;
  let m: RegExpExecArray | null;
  while ((m = boundary.exec(text))) {
    const end = m.index + m[0].trimEnd().length;
    if (ABBREVIATIONS.test(text.slice(start, m.index + 1))) continue;
    out.push({ start, end });
    start = m.index + m[0].length;
  }
  if (start < text.length) out.push({ start, end: text.length });
  return out;
}

export const claimId = (fileId: string, text: string) =>
  `${fileId}:${createHash("sha1").update(text.toLowerCase().replace(/\s+/g, " ").trim()).digest("hex").slice(0, 16)}`;

/** Extract sentence-level claims (with their citation links) from a TipTap document. */
export function parseDocument(fileId: string, doc: DocNode): ParsedClaim[] {
  const claims: ParsedClaim[] = [];

  const visitBlock = (block: DocNode) => {
    let text = "";
    const links: { offset: number; href: string }[] = [];
    const collect = (node: DocNode) => {
      if (node.type === "text" && node.text) {
        const href = node.marks?.find((mk) => mk.type === "link")?.attrs?.href;
        if (href) links.push({ offset: text.length, href });
        text += node.text;
      } else if (node.type === "hardBreak") {
        text += " ";
      }
      node.content?.forEach(collect);
    };
    block.content?.forEach(collect);

    let previous: ParsedClaim | null = null;
    for (const { start, end } of splitSentences(text)) {
      const sentence = text.slice(start, end).trim();
      const inSentence = links.filter((l) => l.offset >= start && l.offset < end).map((l) => l.href);
      // A citation-only "sentence" ("[Shu et al., 2024]" after the full stop) belongs to the
      // sentence before it, not a claim of its own
      if (!sentence.replace(/\[[^\]]*\]/g, "").replace(/[\s.,;]/g, "")) {
        if (previous) previous.citedUrls = [...new Set([...previous.citedUrls, ...inSentence])];
        continue;
      }
      // A citation inserted right after the full stop belongs to the sentence it follows
      const citedUrls = links.filter((l) => l.offset >= start && l.offset < end + 2).map((l) => l.href);
      const plain = sentence.replace(/\s*\[[^\]]*\]\s*$/, "");
      if (plain.length < MIN_CLAIM_CHARS && !citedUrls.length) continue;
      // Key claims by their words only, so adding or removing a citation keeps the same claim
      const claim: ParsedClaim = { id: claimId(fileId, plain), text: plain, order: claims.length, citedUrls: [...new Set(citedUrls)] };
      claims.push(claim);
      previous = claim;
    }
  };

  const walk = (node: DocNode) => {
    if (node.type && TEXT_BLOCKS.has(node.type)) return visitBlock(node);
    if (node.type === "heading" || node.type === "codeBlock") return; // not claims
    node.content?.forEach(walk);
  };
  walk(doc);
  return claims;
}

export interface SyncDocumentInput {
  workspaceId: string;
  fileId: string;
  title: string;
  userId: string;
  userName?: string | null;
  doc: DocNode;
}

/** Replace the graph's view of one document. Idempotent; safe to call on every save. */
export async function syncDocument({ workspaceId, fileId, title, userId, userName, doc }: SyncDocumentInput) {
  const claims = parseDocument(fileId, doc);
  const graph = await getWorkspaceGraph(workspaceId);

  // Resolve cited URLs to Paper nodes (DOI / arXiv / S2 id)
  const keys = new Map<string, CitationKey>();
  for (const c of claims) for (const url of c.citedUrls) {
    const k = parseCitationUrl(url);
    if (k) keys.set(url, k);
  }
  const all = [...keys.values()];
  const resolved = all.length
    ? (
        await graph.roQuery<{ paperId: string; doi: string | null; arxivId: string | null; s2Id: string | null }>(
          RESOLVE_CITED_PAPERS,
          {
            params: {
              dois: all.map((k) => k.doi).filter(Boolean),
              arxivIds: all.map((k) => k.arxivId).filter(Boolean),
              s2Ids: all.map((k) => k.s2Id).filter(Boolean),
              paperIds: all.map((k) => k.paperId).filter(Boolean),
            } as never,
          },
        )
      ).data ?? []
    : [];
  const paperFor = (k: CitationKey) =>
    resolved.find(
      (p) => (k.doi && p.doi === k.doi) || (k.arxivId && p.arxivId === k.arxivId) || (k.s2Id && p.s2Id === k.s2Id) || (k.paperId && p.paperId === k.paperId),
    )?.paperId;

  const cites: { claimId: string; paperId: string }[] = [];
  const unresolved: string[] = [];
  for (const c of claims) for (const url of c.citedUrls) {
    const key = keys.get(url);
    const paperId = key && paperFor(key);
    if (paperId) cites.push({ claimId: c.id, paperId });
    else unresolved.push(url);
  }

  const params = <T>(p: T) => ({ params: p as never });
  await graph.query(UPSERT_DOCUMENT, params({ fileId, title, userId, userName: userName ?? null, at: Date.now() }));
  await graph.query(DELETE_STALE_CLAIMS, params({ fileId, ids: claims.map((c) => c.id) }));
  if (claims.length) {
    await graph.query(
      UPSERT_CLAIMS,
      params({
        fileId,
        claims: claims.map((c) => ({ id: c.id, text: c.text, order: c.order, citedUrls: c.citedUrls })),
      }),
    );
  }
  await graph.query(DELETE_CLAIM_CITES, params({ fileId }));
  if (cites.length) await graph.query(INSERT_CLAIM_CITES, params({ cites }));

  return { claims: claims.length, cited: cites.length, unresolved };
}
