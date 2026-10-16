// Synthesis — one job: draft a literature review of the team's papers into a NEW document.
// Structure comes from the graph: CDLP citation communities and PageRank decide which papers
// belong together and which lead each section. An LLM only names the sections and writes the
// prose, and may cite only the papers it was given for that section, grounded in their
// full-text passages. The output is a separate draft file the team edits — never their own text.

import { randomUUID } from "crypto";
import { chatModel } from "@/lib/ai/models";
import { generateObject } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";
import db from "@/db";
import { files, folders } from "@/db/schema";
import { citationHref, citationLabel } from "../citations";
import { embedTexts } from "../graph/embeddings";
import {
  BEST_PASSAGES_IN_PAPERS,
  CITES_AMONG,
  TEAM_COMMUNITIES,
  TEAM_PAGERANK,
  TEAM_PAPER_DETAILS,
  VIEW_TEAM,
} from "../graph/queries";
import { searchTeamLibrary } from "../graph/team-search";
import { scoreRelevance } from "../jev";
import { startRun, type AgentResult } from "./base";

export interface ReviewSection {
  heading: string;
  papers: { paperId: string; label: string; title: string; owners: string[] }[];
  /** Graph community the section's papers mostly came from */
  community: number | null;
}

export interface SynthesisResult extends AgentResult<ReviewSection> {
  fileId?: string;
  title?: string;
}

const MAX_PAPERS = 24;
/** Minimum JEV relevance for a paper to be included in a topic review */
const TOPIC_MIN = 0.4;

interface PaperInfo {
  paperId: string;
  title: string;
  year: number | null;
  doi: string | null;
  arxivId: string | null;
  abstract: string | null;
  owners: string[];
  authors: string[];
  community: number | null;
  rank: number;
  key: string; // P1, P2… — what the LLM sees
}

type TipTapNode = { type: string; attrs?: Record<string, unknown>; content?: TipTapNode[]; text?: string; marks?: unknown[] };

const text = (t: string, marks?: unknown[]): TipTapNode => ({ type: "text", text: t, ...(marks ? { marks } : {}) });

export async function runSynthesis(input: {
  workspaceId: string;
  userId: string;
  /** Optional focus; empty means the whole team library */
  topic?: string;
  /** The document the request came from (the draft goes in the same folder) */
  fileId?: string;
}): Promise<SynthesisResult> {
  const topic = input.topic?.trim().slice(0, 200) || "";
  const run = await startRun("synthesis", input.workspaceId, { topic, fileId: input.fileId });
  const g = run.graph;

  // 1. Scope: papers on the topic, or the whole team library
  let scopeIds: string[];
  if (topic) {
    const found = await run.step("graph.searchTeamLibrary", () => searchTeamLibrary(input.workspaceId, topic, { limit: MAX_PAPERS }), {
      source: "graph",
      cypher: "TEAM_VECTOR_SEARCH + TEAM_CHUNK_SEARCH + TEAM_FULLTEXT_SEARCH (RRF)",
    });
    // Search always returns its top-k; JEV keeps only papers that belong in a review of the topic
    const rel = await run.step("jev.scoreRelevance", () =>
      scoreRelevance(
        `A literature review section about: ${topic}`,
        found.map((p) => ({ id: p.paperId, title: p.title, abstract: p.abstract })),
      ),
    );
    run.trace[run.trace.length - 1].source = rel.source;
    scopeIds = found.filter((p) => (rel.result.get(p.paperId)?.value ?? 0) >= TOPIC_MIN).map((p) => p.paperId);
  } else
    scopeIds = await run.step("graph.teamPapers", async () => [...new Set(((await g.roQuery<{ paperId: string }>(VIEW_TEAM)).data ?? []).map((r) => r.paperId))], {
        source: "graph",
        cypher: "VIEW_TEAM",
      });
  if (scopeIds.length < 2) return run.finish("NOT_IN_GRAPH", [], input.userId);

  // 2. Graph structure: citation communities (CDLP) and centrality (PageRank)
  const [communities, ranks, details] = await Promise.all([
    run.step("graph.communities", async () => (await g.roQuery<{ paperId: string; communityId: number }>(TEAM_COMMUNITIES)).data ?? [], {
      source: "graph",
      cypher: "TEAM_COMMUNITIES (algo.labelPropagation)",
    }),
    run.step("graph.pageRank", async () => (await g.roQuery<{ paperId: string; score: number }>(TEAM_PAGERANK)).data ?? [], {
      source: "graph",
      cypher: "TEAM_PAGERANK (algo.pageRank)",
    }),
    run.step(
      "graph.paperDetails",
      async () =>
        (
          await g.roQuery<Omit<PaperInfo, "authors" | "community" | "rank" | "key"> & { authorRows: { name: string; pos: number }[] }>(TEAM_PAPER_DETAILS, {
            params: { ids: scopeIds } as never,
          })
        ).data ?? [],
      { source: "graph", cypher: "TEAM_PAPER_DETAILS" },
    ),
  ]);
  const communityOf = new Map(communities.map((c) => [c.paperId, c.communityId]));
  const rankOf = new Map(ranks.map((r) => [r.paperId, r.score]));

  const papers: PaperInfo[] = details
    .map(({ authorRows, ...d }) => ({
      ...d,
      authors: [...authorRows].sort((a, b) => a.pos - b.pos).map((a) => a.name),
      community: communityOf.get(d.paperId) ?? null,
      rank: rankOf.get(d.paperId) ?? 0,
      key: "",
    }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, MAX_PAPERS);
  papers.forEach((p, i) => (p.key = `P${i + 1}`));
  const byKey = new Map(papers.map((p) => [p.key, p]));
  const keyOf = new Map(papers.map((p) => [p.paperId, p.key]));

  const cites = await run.step(
    "graph.citesAmong",
    async () => (await g.roQuery<{ source: string; target: string }>(CITES_AMONG, { params: { ids: papers.map((p) => p.paperId) } as never })).data ?? [],
    { source: "graph", cypher: "CITES_AMONG" },
  );

  // Clusters as the graph sees them, central papers first
  const clusters = new Map<string, PaperInfo[]>();
  for (const p of papers) {
    const k = p.community === null ? "none" : String(p.community);
    clusters.set(k, [...(clusters.get(k) ?? []), p]);
  }
  const clusterText = [...clusters.values()]
    .map((ps, i) => `Cluster ${i + 1} (cite each other): ${ps.map((p) => p.key).join(", ")}`)
    .join("\n");
  const paperText = papers
    .map((p) => `${p.key} ${citationLabel(p)} "${p.title}" — ${(p.abstract ?? "").replace(/\s+/g, " ").slice(0, 380)}`)
    .join("\n");
  const citeText = cites
    .map((c) => `${keyOf.get(c.source)} cites ${keyOf.get(c.target)}`)
    .slice(0, 80)
    .join("; ");

  // 3. Outline: sections follow the graph clusters (a big cluster may be split by theme)
  const { object: outline } = await run.step(
    "llm.outline",
    () =>
      generateObject({
        model: chatModel(),
        temperature: 0.2,
        schema: z.object({
          title: z.string().describe("Title of the review, max 10 words"),
          sections: z
            .array(
              z.object({
                heading: z.string().describe("Section heading naming the shared method or finding, max 8 words"),
                focus: z.string().describe("One sentence: what these papers have in common"),
                paperIds: z.array(z.string()).min(1),
              }),
            )
            .min(2)
            .max(5),
        }),
        system:
          "You organise a research team's papers into a literature review. Sections must follow the citation clusters from the team's research graph: never mix papers from different clusters in one section; you may split a large cluster by method or finding. Every paper id goes in at most one section. Leave out papers that don't fit the topic. Use only the given ids.",
        prompt: `${topic ? `Topic: ${topic}\n\n` : ""}Citation clusters from the research graph:\n${clusterText}\n\nCitations between the papers: ${citeText || "none"}\n\nPapers (most central first):\n${paperText}`,
      }),
    { source: "llm" },
  );

  // Guard: real ids only, each paper once
  const used = new Set<string>();
  const sections = outline.sections
    .map((s) => ({
      ...s,
      papers: s.paperIds
        .filter((k) => byKey.has(k) && !used.has(k) && used.add(k))
        .map((k) => byKey.get(k)!),
    }))
    .filter((s) => s.papers.length > 0);
  if (!sections.length) return run.finish("NOT_IN_GRAPH", [], input.userId);

  // 4. Ground each section in full-text passages, then write it (sections in parallel)
  const vectors = await embedTexts(sections.map((s) => `${s.heading}. ${s.focus}`));
  const written = await run.step(
    "llm.writeSections",
    () =>
      Promise.all(
        sections.map(async (s, i) => {
          const passages =
            (
              await g.roQuery<{ paperId: string; text: string }>(BEST_PASSAGES_IN_PAPERS, {
                params: { v: vectors[i], k: 400, paperIds: s.papers.map((p) => p.paperId) } as never,
              })
            ).data ?? [];
          const best = new Map<string, string[]>();
          for (const p of passages) {
            const list = best.get(p.paperId) ?? [];
            if (list.length < 2) best.set(p.paperId, [...list, p.text.replace(/\s+/g, " ").slice(0, 600)]);
          }
          const evidence = s.papers
            .map(
              (p) =>
                `${p.key} ${citationLabel(p)} "${p.title}" (${p.year ?? "n.d."})\nAbstract: ${(p.abstract ?? "").replace(/\s+/g, " ").slice(0, 500)}${(best.get(p.paperId) ?? []).map((t) => `\nPassage: ${t}`).join("")}`,
            )
            .join("\n\n");
          const { object } = await generateObject({
            model: chatModel(),
            temperature: 0.3,
            schema: z.object({
              paragraphs: z
                .array(
                  z.array(
                    z.object({
                      text: z.string().describe("One sentence, without any citation markers or paper ids"),
                      cites: z.array(z.string()).describe("Ids of the papers this sentence is based on; empty for connective sentences"),
                    }),
                  ),
                )
                .min(1)
                .max(3),
            }),
            system:
              "You write one section of a literature review for a research team. State only what the given abstracts and passages say; compare the papers, note how later work builds on earlier work, and mention disagreements or limitations when the sources show them. Discuss every paper in the list at least once. Every factual sentence must list the ids of the papers it is based on in cites — the formatted citation is appended automatically, so never write author names, years or ids in the sentence text (refer to the work by its method or system name instead, e.g. 'Dense Passage Retrieval showed…'). Never cite a paper that is not in the list. Write in a neutral academic register; no bullet points.",
            prompt: `Section: ${s.heading}\nFocus: ${s.focus}\n\nPapers:\n${evidence}`,
          });
          return object.paragraphs;
        }),
      ),
    { source: "llm" },
  );

  // 5. Build the document: citations are real links to graph papers, so sync-document,
  //    Cite Scout and the Citation Checker understand the draft immediately.
  const reviewTitle = outline.title || `Literature review${topic ? `: ${topic}` : ""}`;
  const content: TipTapNode[] = [
    { type: "heading", attrs: { level: 1 }, content: [text(reviewTitle)] },
    {
      type: "paragraph",
      content: [
        text(
          `Draft by the Synthesis agent from ${used.size} papers in the team library, grouped by citation community in the research graph. Every citation links to a team paper. Edit freely, then run Check citations.`,
          [{ type: "italic" }],
        ),
      ],
    },
  ];
  sections.forEach((s, i) => {
    const allowed = new Set(s.papers.map((p) => p.key));
    content.push({ type: "heading", attrs: { level: 2 }, content: [text(s.heading)] });
    for (const para of written[i]) {
      const nodes: TipTapNode[] = [];
      para.forEach((sentence, j) => {
        // Strip any ids the model leaked into the prose, and the empty brackets they leave
        const body = sentence.text
          .replace(/\bP\d{1,2}\b/g, "")
          .replace(/\s*[([]\s*[,;\s]*[)\]]/g, "")
          .replace(/\s+([,.;])/g, "$1")
          .trim()
          .replace(/\.$/, "");
        if (!body) return;
        nodes.push(text(`${j ? " " : ""}${body}`));
        const refs = [...new Set(sentence.cites)].filter((k) => allowed.has(k)).map((k) => byKey.get(k)!);
        refs.forEach((p, r) => {
          nodes.push(text(r ? "; " : " "));
          nodes.push(text(citationLabel(p), [{ type: "link", attrs: { href: citationHref(p) } }]));
        });
        nodes.push(text("."));
      });
      if (nodes.length) content.push({ type: "paragraph", content: nodes });
    }
  });
  const doc = { type: "doc", content };

  // 6. Save as a new file next to the document the request came from
  const fileId = randomUUID();
  await run.step(
    "db.createDraft",
    async () => {
      const [source] = input.fileId ? await db.select({ folderId: files.folderId }).from(files).where(eq(files.id, input.fileId)) : [];
      const folderId =
        source?.folderId ??
        (await db.select({ id: folders.id }).from(folders).where(eq(folders.workspaceId, input.workspaceId)).limit(1))[0]?.id;
      if (!folderId) throw new Error("This workspace has no folder to put the draft in.");
      await db.insert(files).values({
        id: fileId,
        title: reviewTitle.slice(0, 120),
        iconId: "📚",
        data: JSON.stringify(doc),
        workspaceId: input.workspaceId,
        folderId,
        inTrash: "",
      });
      return [folderId];
    },
    { source: "graph" },
  );

  used.forEach((k) => run.highlight.add(byKey.get(k)!.paperId));
  const items: ReviewSection[] = sections.map((s) => {
    const counts = new Map<number | null, number>();
    s.papers.forEach((p) => counts.set(p.community, (counts.get(p.community) ?? 0) + 1));
    return {
      heading: s.heading,
      community: [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0],
      papers: s.papers.map((p) => ({ paperId: p.paperId, label: citationLabel(p), title: p.title, owners: p.owners })),
    };
  });
  const result = await run.finish("ANSWERED", items, input.userId);
  return { ...result, fileId, title: reviewTitle };
}
