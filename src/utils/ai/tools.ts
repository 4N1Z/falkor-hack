// Tools for the general Neura AI chat path. Paper search is graph-first: the team's own
// library in FalkorDB (every collaborator's papers, by meaning, passages and keywords), then
// OpenAlex for the wider literature. Semantic Scholar is gone: its anonymous endpoint is
// rate-limited for minutes at a time and returned nothing for most searches.

import { searchWorks } from "@/lib/graph/openalex";
import { searchTeamLibrary } from "@/lib/graph/team-search";
import { tool as createTool } from "ai";
import { z } from "zod";

/** The shape the chat renders (research-message-block.tsx). */
export interface ChatPaper {
  paperId: string;
  title: string;
  authors: { name: string }[];
  year: number | null;
  externalIds?: { DOI?: string };
  /** "team" = in a collaborator's library (FalkorDB); "openalex" = wider literature */
  source: "team" | "openalex";
  /** Collaborators who have it, for team papers */
  owners?: string[];
  /** Best matching full-text passage, for team papers */
  passage?: string;
}

export interface ChatPaperResult {
  status: "SUCCESS" | "NO_RESULTS" | "ERROR";
  papers: ChatPaper[];
  message?: string;
}

const MAX_TEAM = 5;
const MAX_WIDER = 5;

/** Search the team library first, then OpenAlex. Without a workspace, OpenAlex only. */
export async function searchPapersForChat(keyword: string, workspaceId?: string): Promise<ChatPaperResult> {
  const q = keyword.trim();
  if (q.length < 3) return { status: "NO_RESULTS", papers: [], message: "Search term too short." };
  try {
    const [team, wider] = await Promise.all([
      workspaceId ? searchTeamLibrary(workspaceId, q, { limit: MAX_TEAM }).catch(() => []) : Promise.resolve([]),
      searchWorks(q.split(/\s+/).slice(0, 12).join(" "), MAX_WIDER).catch(() => []),
    ]);
    const seen = new Set(team.map((p) => p.paperId));
    const papers: ChatPaper[] = [
      ...team.map((p) => ({
        paperId: p.paperId,
        title: p.title,
        authors: p.authors.map((name) => ({ name })),
        year: p.year,
        externalIds: p.doi ? { DOI: p.doi } : undefined,
        source: "team" as const,
        owners: p.owners,
        passage: p.passage?.text.replace(/\s+/g, " ").slice(0, 240),
      })),
      ...wider
        .filter((w) => !seen.has(w.openalexId))
        .map((w) => ({
          paperId: w.openalexId,
          title: w.title,
          authors: w.authors.map((name) => ({ name })),
          year: w.year,
          externalIds: w.doi ? { DOI: w.doi } : undefined,
          source: "openalex" as const,
        })),
    ];
    if (!papers.length) return { status: "NO_RESULTS", papers: [], message: `No papers found for "${q}". Try a shorter phrase or a different term.` };
    return { status: "SUCCESS", papers };
  } catch {
    return { status: "ERROR", papers: [], message: `Couldn't search for "${q}" right now.` };
  }
}

/** Tool set for one chat request; `workspaceId` scopes the team-library half of the search. */
export const researchTools = (workspaceId?: string) => ({
  getResearchPaper: createTool({
    description:
      "Search for research papers on a topic, title or author. Looks in the team's own library first (every collaborator's papers, with the matching passage), then the wider literature on OpenAlex.",
    parameters: z.object({
      keyword: z.string().describe("The topic, title fragment or author to search for"),
    }),
    execute: ({ keyword }) => searchPapersForChat(keyword, workspaceId),
  }),
});

/** Kept for callers without a workspace (OpenAlex only). */
export const myTools = researchTools();
