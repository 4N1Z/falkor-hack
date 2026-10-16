// Citation formatting shared by the browser (editor) and server (agents).

/** "[Karpukhin et al., 2020]" */
export function citationLabel(p: { authors: string[]; year: number | null; title: string }): string {
  const surname = (n: string) => n.trim().split(/\s+/).pop() ?? n;
  const who =
    p.authors.length === 0
      ? p.title.split(/\s+/).slice(0, 3).join(" ")
      : p.authors.length === 1
        ? surname(p.authors[0])
        : p.authors.length === 2
          ? `${surname(p.authors[0])} & ${surname(p.authors[1])}`
          : `${surname(p.authors[0])} et al.`;
  return `[${who}${p.year ? `, ${p.year}` : ""}]`;
}

/** Link the editor inserts for a citation; sync-document resolves it back to the graph node. */
export function citationHref(p: { doi: string | null; arxivId?: string | null; paperId: string }): string {
  if (p.doi) return `https://doi.org/${p.doi}`;
  if (p.arxivId) return `https://arxiv.org/abs/${p.arxivId}`;
  return `https://openalex.org/${p.paperId}`;
}

/** TipTap content for a citation: a linked label, preceded by a space when needed. */
export function citationContent(label: string, href: string, needsLeadingSpace: boolean) {
  return [
    ...(needsLeadingSpace ? [{ type: "text", text: " " }] : []),
    { type: "text", text: label, marks: [{ type: "link", attrs: { href } }] },
  ];
}
