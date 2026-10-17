// TipTap JSON → LaTeX. Citation links the editor inserted ("[Karpukhin et al., 2020]" linking
// to a DOI / arXiv / OpenAlex URL) become \citep{key} and a BibTeX entry built from the research
// graph, so the exported file compiles into a real bibliography. Links the graph doesn't know
// stay as \href. The .bib is embedded with filecontents*, so one file is enough to compile.

import type { DocNode } from "../graph/sync-document";

export interface LatexPaper {
  paperId: string;
  title: string;
  year: number | null;
  doi: string | null;
  arxivId: string | null;
  venue: string | null;
  /** Byline order */
  authors: string[];
}

export interface LatexExportInput {
  title: string;
  author?: string | null;
  doc: DocNode;
  /** Citation href → paper, for every link the graph resolved */
  papers: Map<string, LatexPaper>;
  /** Base name for the .bib file (no extension) */
  bibName: string;
}

export interface LatexExport {
  tex: string;
  /** Distinct papers cited */
  citations: number;
  /** Citation-looking links that were not in the graph (kept as \href) */
  unresolved: number;
}

type RichNode = DocNode & { attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[] };

// ------------------------------------------------------------------ escaping

const ESCAPES: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "&": "\\&",
  "%": "\\%",
  "$": "\\$",
  "#": "\\#",
  "_": "\\_",
  "{": "\\{",
  "}": "\\}",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
};

/** Escape text for LaTeX body content (inputenc utf8 handles the rest). */
export const escapeLatex = (s: string) => s.replace(/[\\&%$#_{}~^]/g, (c) => ESCAPES[c]);

/** BibTeX field values: braces are structural, so only & % and # need care. */
const escapeBib = (s: string) => s.replace(/[&%#]/g, (c) => ESCAPES[c]);

const ascii = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toLowerCase();

const STOP = new Set(["a", "an", "the", "on", "of", "for", "in", "and", "to", "with", "from", "by", "at", "is", "are", "towards", "toward", "via"]);

/** karpukhin2020dense: first author's surname, year, first meaningful title word. */
function bibKey(p: LatexPaper, taken: Set<string>): string {
  const surname = p.authors[0] ? ascii(p.authors[0].trim().split(/\s+/).pop() ?? "") : "";
  const word = (p.title.toLowerCase().match(/[a-z0-9]+/g) ?? []).find((w) => !STOP.has(w) && w.length > 2) ?? "paper";
  const base = `${surname || "anon"}${p.year ?? ""}${ascii(word)}`;
  let key = base;
  for (let i = 0; taken.has(key); i++) key = `${base}${String.fromCharCode(97 + (i % 26))}`;
  taken.add(key);
  return key;
}

function bibEntry(key: string, p: LatexPaper): string {
  const fields: [string, string][] = [
    ["title", `{${escapeBib(p.title)}}`], // inner braces keep the title's capitalisation
    ["author", escapeBib(p.authors.join(" and ")) || "Unknown"],
  ];
  if (p.year) fields.push(["year", String(p.year)]);
  const isArxivOnly = !!p.arxivId && (!p.venue || /arxiv/i.test(p.venue));
  let type = "misc";
  if (p.venue && !isArxivOnly) {
    type = /proceedings|conference|workshop|symposium|\bconf\b|neurips|icml|iclr|acl|emnlp|naacl|cvpr|iccv|eccv|sigir|kdd|www\b/i.test(p.venue) ? "inproceedings" : "article";
    fields.push([type === "article" ? "journal" : "booktitle", escapeBib(p.venue)]);
  }
  if (p.arxivId) {
    fields.push(["eprint", p.arxivId], ["archivePrefix", "arXiv"]);
    if (type === "misc") fields.push(["howpublished", `arXiv:${p.arxivId}`]);
  }
  if (p.doi) fields.push(["doi", p.doi]);
  fields.push(["url", p.doi ? `https://doi.org/${p.doi}` : p.arxivId ? `https://arxiv.org/abs/${p.arxivId}` : `https://openalex.org/${p.paperId}`]);
  return `@${type}{${key},\n${fields.map(([k, v]) => `  ${k} = {${v}}`).join(",\n")}\n}`;
}

// ------------------------------------------------------------------ document walk

export function toLatex(input: LatexExportInput): LatexExport {
  const keys = new Map<string, string>(); // paperId → bib key
  const taken = new Set<string>();
  const cited = new Map<string, LatexPaper>();
  let unresolved = 0;
  const keyFor = (p: LatexPaper) => {
    let k = keys.get(p.paperId);
    if (!k) {
      k = bibKey(p, taken);
      keys.set(p.paperId, k);
      cited.set(p.paperId, p);
    }
    return k;
  };

  const inline = (nodes: RichNode[] | undefined): string => {
    let out = "";
    for (const n of nodes ?? []) {
      if (n.type === "hardBreak") {
        out += "\\\\\n";
        continue;
      }
      if (n.type !== "text" || !n.text) {
        out += inline(n.content as RichNode[]);
        continue;
      }
      const link = n.marks?.find((m) => m.type === "link")?.attrs?.href as string | undefined;
      if (link) {
        const paper = input.papers.get(link);
        if (paper) {
          out += `\\citep{${keyFor(paper)}}`;
          continue;
        }
        if (/^https?:\/\/(dx\.)?doi\.org|arxiv\.org|openalex\.org|semanticscholar\.org/i.test(link)) unresolved++;
        out += `\\href{${link.replace(/[%#\\]/g, (c) => ESCAPES[c] ?? c)}}{${escapeLatex(n.text)}}`;
        continue;
      }
      let t = escapeLatex(n.text);
      for (const m of n.marks ?? []) {
        if (m.type === "bold") t = `\\textbf{${t}}`;
        else if (m.type === "italic") t = `\\emph{${t}}`;
        else if (m.type === "underline") t = `\\underline{${t}}`;
        else if (m.type === "strike") t = `\\sout{${t}}`;
        else if (m.type === "code") t = `\\texttt{${t}}`;
      }
      out += t;
    }
    return out;
  };

  /** "[A, 2020] [B, 2021]" → one \citep with both keys; a space before a citation becomes a tie. */
  const tidyCitations = (s: string) =>
    s
      .replace(/\\citep\{([^}]+)\}(?:\s*[;,]?\s*)\\citep\{([^}]+)\}/g, (_m, a, b) => `\\citep{${a},${b}}`)
      .replace(/\\citep\{([^}]+)\}(?:\s*[;,]?\s*)\\citep\{([^}]+)\}/g, (_m, a, b) => `\\citep{${a},${b}}`)
      .replace(/ +\\citep/g, "~\\citep")
      .replace(/~\\citep\{([^}]+)\}\s*\./g, "~\\citep{$1}.");

  const body: string[] = [];
  let title = input.title;
  let titleTaken = false;

  const block = (n: RichNode, depth = 0): void => {
    switch (n.type) {
      case "heading": {
        const level = Number(n.attrs?.level ?? 1);
        const text = tidyCitations(inline(n.content as RichNode[]));
        if (!text.trim()) return;
        if (level === 1 && !titleTaken && body.length === 0) {
          // A leading H1 is the paper's title, not a section
          title = text;
          titleTaken = true;
          return;
        }
        const cmd = level <= 1 ? "section" : level === 2 ? "subsection" : "subsubsection";
        body.push(`\\${cmd}{${text}}`);
        return;
      }
      case "paragraph": {
        const text = tidyCitations(inline(n.content as RichNode[]));
        if (text.trim()) body.push(text);
        return;
      }
      case "bulletList":
      case "orderedList":
      case "taskList": {
        const env = n.type === "orderedList" ? "enumerate" : "itemize";
        body.push(`\\begin{${env}}`);
        for (const item of (n.content ?? []) as RichNode[]) {
          const label = n.type === "taskList" ? (item.attrs?.checked ? "[$\\boxtimes$] " : "[$\\square$] ") : "";
          const parts: string[] = [];
          const nested: RichNode[] = [];
          for (const child of (item.content ?? []) as RichNode[]) {
            if (child.type === "paragraph") parts.push(tidyCitations(inline(child.content as RichNode[])));
            else nested.push(child);
          }
          body.push(`  \\item${label} ${parts.join(" ")}`.trimEnd());
          nested.forEach((c) => block(c, depth + 1));
        }
        body.push(`\\end{${env}}`);
        return;
      }
      case "blockquote": {
        body.push("\\begin{quote}");
        (n.content ?? []).forEach((c) => block(c as RichNode, depth + 1));
        body.push("\\end{quote}");
        return;
      }
      case "codeBlock": {
        const code = ((n.content ?? []) as RichNode[]).map((c) => c.text ?? "").join("");
        body.push(`\\begin{verbatim}\n${code}\n\\end{verbatim}`);
        return;
      }
      case "horizontalRule":
        body.push("\\noindent\\rule{\\linewidth}{0.4pt}");
        return;
      case "image": {
        const src = String(n.attrs?.src ?? "");
        body.push(
          `% Image from the draft. Save it next to this file and uncomment:\n% \\begin{figure}[h]\\centering\\includegraphics[width=\\linewidth]{${src.split("/").pop()?.split("?")[0] ?? "image"}}\\end{figure}\n% ${src}`,
        );
        return;
      }
      default:
        (n.content ?? []).forEach((c) => block(c as RichNode, depth));
    }
  };
  ((input.doc.content ?? []) as RichNode[]).forEach((c) => block(c));

  const entries = [...cited.values()].map((p) => bibEntry(keys.get(p.paperId)!, p));
  const bib = entries.length
    ? `% The bibliography is embedded here; LaTeX writes ${input.bibName}.bib next to this file on the first run (LaTeX 2019 or later).\n` +
      `\\begin{filecontents*}[overwrite]{${input.bibName}.bib}\n${entries.join("\n\n")}\n\\end{filecontents*}\n\n`
    : "";

  const tex =
    `% Exported from Neura Query on ${new Date().toISOString().slice(0, 10)}.\n` +
    `% Build: pdflatex ${input.bibName}.tex && bibtex ${input.bibName} && pdflatex ${input.bibName}.tex && pdflatex ${input.bibName}.tex\n` +
    (unresolved ? `% ${unresolved} citation link(s) were not in the research graph and were kept as \\href links.\n` : "") +
    "\n" +
    bib +
    `\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage{microtype}
\\usepackage{amssymb}
\\usepackage[normalem]{ulem}
\\usepackage{graphicx}
\\usepackage[authoryear,round]{natbib}
\\usepackage[hidelinks]{hyperref}

\\title{${titleTaken ? title : escapeLatex(title)}}
\\author{${escapeLatex(input.author?.trim() || "")}}
\\date{\\today}

\\begin{document}
\\maketitle

${body.join("\n\n")}
${entries.length ? `\n\\bibliographystyle{plainnat}\n\\bibliography{${input.bibName}}\n` : ""}
\\end{document}
`;

  return { tex, citations: cited.size, unresolved };
}

/** A safe file name for the .tex / .bib pair. */
export const latexFileName = (title: string) =>
  ascii(title.replace(/\s+/g, "-"))
    .replace(/-+/g, "-")
    .slice(0, 60) || "document";
