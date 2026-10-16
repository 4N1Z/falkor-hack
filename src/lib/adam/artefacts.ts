// Linked artefacts (spec: "Beyond papers"): code repositories, datasets, protocols and
// theses linked from a paper are indexed as their own documents attached to the paper
// (Chunk.doc = 'artefact'), with the same page-and-passage addressing. The Methods Hunter
// reads them because a README or a protocol page is usually where the parameters live.

import type { Graph } from "falkordb";
import { fetchDocumentText, indexPaperText } from "../graph/document-index";
import { ADD_PAPER_ARTEFACT } from "./queries-methods";

/** Hosts worth fetching for method details. Publisher landing pages are not. */
const ARTEFACT_HOST = /^(https?:\/\/)?(www\.)?(github\.com|gitlab\.com|huggingface\.co|protocols\.io|zenodo\.org|osf\.io|figshare\.com|arxiv\.org\/html|paperswithcode\.com|bitbucket\.org)\//i;
const URL_RE = /https?:\/\/[^\s)\]>"',;]+/g;
const MAX_PER_METHOD = 6;

/** GitHub pages are fetched as their README (raw) so the text is the documentation, not the UI. */
export function fetchableUrl(url: string): string | null {
  const clean = url.replace(/[.,;:)\]]+$/, "");
  if (!ARTEFACT_HOST.test(clean)) return null;
  const gh = clean.match(/^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  if (gh) {
    const repo = gh[2].replace(/\.git$/, "");
    return `https://raw.githubusercontent.com/${gh[1]}/${repo}/HEAD/README.md`;
  }
  const hf = clean.match(/^https?:\/\/huggingface\.co\/([^/\s]+\/[^/\s#?]+)/i);
  if (hf) return `https://huggingface.co/${hf[1]}/raw/main/README.md`;
  return clean;
}

export function urlsIn(text: string): string[] {
  return [...new Set((text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:)\]]+$/, "")))];
}

export interface ArtefactResult {
  url: string;
  fetchUrl: string;
  paperId: string;
  chunks: number;
  reason: string | null;
}

/**
 * Fetch and index the artefacts a set of passages link to, once per paper and URL.
 * Returns what happened per URL so the Hunter can say which sources it read.
 */
export async function indexArtefacts(
  graph: Graph,
  workspaceId: string,
  rows: { paperId: string; text: string; fetched: string[] }[],
  log: (m: string) => void = () => {},
): Promise<ArtefactResult[]> {
  const seen = new Set<string>();
  const results: ArtefactResult[] = [];
  for (const row of rows) {
    for (const url of urlsIn(row.text)) {
      const fetchUrl = fetchableUrl(url);
      if (!fetchUrl) continue;
      const key = `${row.paperId}|${fetchUrl}`;
      if (seen.has(key) || row.fetched.includes(fetchUrl)) continue;
      seen.add(key);
      if (results.length >= MAX_PER_METHOD) return results;
      const fetched = await fetchDocumentText(fetchUrl, { allowHtml: true });
      await graph.query(ADD_PAPER_ARTEFACT, { params: { paperId: row.paperId, url: fetchUrl } as never }).catch(() => {});
      if (!fetched.ok) {
        results.push({ url, fetchUrl, paperId: row.paperId, chunks: 0, reason: fetched.reason });
        log(`artefact ${fetchUrl}: ${fetched.reason}`);
        continue;
      }
      const n = await indexPaperText(workspaceId, row.paperId, fetched.doc, { doc: "artefact", sourceUrl: fetchUrl, maxChunks: 40 }).catch((err) => {
        log(`artefact ${fetchUrl}: index failed ${err instanceof Error ? err.message : err}`);
        return 0;
      });
      results.push({ url, fetchUrl, paperId: row.paperId, chunks: n, reason: n ? null : "unreadable" });
      log(`artefact ${fetchUrl}: ${n} passages`);
    }
  }
  return results;
}
