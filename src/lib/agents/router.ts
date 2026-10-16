// Router — one job: decide which specialist agent should handle a chat message (JEV choice),
// run it, and hand back a grounded brief the chat model answers from. Agents keep their one
// job; the chat just becomes a front door to them.

import { citationLabel } from "../citations";
import { searchTeamLibrary } from "../graph/team-search";
import { classify } from "../jev";
import { runCitationCheck } from "./citation-checker";
import { runCiteScout } from "./cite-scout";
import { recall, timeline } from "./historian";
import { runNextSteps } from "./next-steps";
import { runScoutWatcher } from "./scout-watcher";
import { runSynthesis } from "./synthesis";

export type Route = "cite_scout" | "citation_checker" | "next_steps" | "historian" | "team_library" | "synthesis" | "scout_watcher" | "general";

const ROUTES: Record<Route, string> = {
  cite_scout: "Finding papers to cite for a specific sentence or claim the user wrote",
  citation_checker: "Checking whether the claims or citations in the user's current draft are supported",
  next_steps: "Suggesting what to research, read or try next",
  historian: "Recalling or recording the team's hypotheses, findings, past decisions or dead ends",
  synthesis: "Writing or drafting a literature review, survey or related-work section from the team's papers",
  scout_watcher: "Finding new or recent papers published since the team's library was built, or what new work cites the team's papers",
  team_library: "Questions about which papers the team or a collaborator has, or what the team's papers say about a topic",
  general: "Anything else: explanations, general questions, writing help, or searching papers outside the team's library",
};

export interface RoutedBrief {
  route: Route;
  confidence: number;
  /** Plain-text evidence for the chat model to answer from */
  brief: string;
}

export async function routeMessage(input: {
  workspaceId: string;
  userId: string;
  fileId?: string;
  message: string;
}): Promise<RoutedBrief> {
  const picked = await classify(input.message, "Which assistant should handle this research request?", ROUTES);
  const route = picked.result.label;
  const confidence = picked.result.confidence;
  const lines: string[] = [];

  if (route === "cite_scout") {
    const r = await runCiteScout({ workspaceId: input.workspaceId, userId: input.userId, paragraph: input.message, fileId: input.fileId });
    if (r.deadEnd) lines.push(`Warning: ${r.deadEnd.byName} dropped a similar hypothesis (${r.deadEnd.reason ?? "no reason recorded"}).`);
    if (r.outcome === "SKIPPED") lines.push("The text doesn't look like a claim that needs a citation.");
    for (const s of r.items) {
      lines.push(`- ${s.label} “${s.title}” — ${Math.round(s.relevance * 100)}% match, ${s.reason}${s.passage ? ` Passage: "${s.passage.slice(0, 220)}"` : ""}`);
    }
    if (!r.items.length && r.outcome !== "SKIPPED") lines.push("Nothing in the team's library supports it yet.");
  } else if (route === "citation_checker" && input.fileId) {
    const r = await runCitationCheck({ workspaceId: input.workspaceId, fileId: input.fileId, userId: input.userId });
    for (const c of r.items.filter((c) => c.verdict !== "ok")) {
      lines.push(`- [${c.verdict}] "${c.text.slice(0, 160)}" — ${c.why}${c.suggestion ? ` Suggest ${c.suggestion.label}.` : ""}`);
    }
    if (!lines.length) lines.push("Every claim in the draft is supported or needs no citation.");
  } else if (route === "next_steps") {
    const r = await runNextSteps({ workspaceId: input.workspaceId, userId: input.userId, fileId: input.fileId });
    for (const i of r.items) {
      lines.push(`- ${i.title} (${i.kind}; novelty ${Math.round(i.novelty * 100)}%, feasibility ${Math.round(i.feasibility * 100)}%): ${i.text} First step: ${i.action}. Grounded in: ${i.evidence.map((e) => e.label).join("; ")}`);
    }
  } else if (route === "historian") {
    const [similar, all] = await Promise.all([recall({ workspaceId: input.workspaceId, text: input.message, limit: 5, maxDistance: 0.55 }), timeline(input.workspaceId, 15)]);
    const items = similar.length ? similar : all;
    for (const m of items) {
      lines.push(`- ${m.kind} (${m.status}) by ${m.byName}, ${new Date(m.validFrom).toDateString()}: "${m.text}"${m.reason ? ` — reason: ${m.reason}` : ""}`);
    }
    if (!lines.length) lines.push("The team hasn't recorded any hypotheses or findings yet (use /hypothesis in the editor).");
  } else if (route === "scout_watcher") {
    const r = await runScoutWatcher({ workspaceId: input.workspaceId, userId: input.userId });
    for (const p of r.items) {
      lines.push(
        `- “${p.title}” (${p.publicationDate ?? p.year}) cites ${p.cites.length} team papers (${p.owners.join(" & ")}'s)${p.challenge >= 0.7 ? `; may contradict “${p.closest?.title}”` : ""}`,
      );
    }
    if (!lines.length) lines.push("No recent papers cite two or more of the team's papers.");
    lines.push("The user can add any of these from Research papers → New papers.");
  } else if (route === "synthesis") {
    const topic = input.message.replace(/^.*?\b(?:review|survey|related work)\b\s*(?:of|on|about|for)?\s*/i, "").replace(/[.?!]+$/, "");
    const r = await runSynthesis({ workspaceId: input.workspaceId, userId: input.userId, topic: topic.length > 3 ? topic : "", fileId: input.fileId });
    if (r.fileId) {
      lines.push(`Drafted "${r.title}" as a new document in the workspace (tell the user to open it from the sidebar). Sections:`);
      for (const s of r.items) lines.push(`- ${s.heading}: ${s.papers.map((p) => p.label).join(", ")}`);
    } else lines.push("Not enough team papers on this topic to draft a review.");
  } else if (route === "team_library") {
    const found = await searchTeamLibrary(input.workspaceId, input.message, { limit: 10 });
    // "Which papers does Bea have…" — keep only that collaborator's papers when one is named
    const msg = input.message.toLowerCase();
    const named = [...new Set(found.flatMap((p) => p.owners))].filter((o) => {
      const first = o.split(/[\s(]/)[0].toLowerCase();
      return first.length > 1 && new RegExp(`\\b${first}\\b`).test(msg);
    });
    const r = (named.length ? found.filter((p) => p.owners.some((o) => named.includes(o))) : found).slice(0, 6);
    for (const p of r) lines.push(`- ${citationLabel(p)} “${p.title}” — in ${p.owners.join(" & ")}'s library${p.passage ? `. Passage: "${p.passage.text.replace(/\s+/g, " ").slice(0, 200)}"` : ""}`);
    if (!lines.length) lines.push("No papers in the team's library match.");
  }

  return { route, confidence, brief: lines.join("\n") };
}

export const ROUTE_NAMES: Record<Route, string> = {
  cite_scout: "Cite Scout",
  citation_checker: "Citation Checker",
  next_steps: "Next-Step",
  historian: "Historian",
  team_library: "Team library",
  synthesis: "Synthesis",
  scout_watcher: "Scout Watcher",
  general: "Neura AI",
};
