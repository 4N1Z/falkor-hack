// Router — one job: decide which specialist agent should handle a chat message (JEV choice),
// run it, and hand back a grounded brief the chat model answers from. Agents keep their one
// job; the chat just becomes a front door to them.

import { citationLabel } from "../citations";
import { searchWorks } from "../graph/openalex";
import { searchTeamLibrary } from "../graph/team-search";
import { classify } from "../jev";
import { runCitationCheck } from "./citation-checker";
import { runCiteScout } from "./cite-scout";
import { recall, timeline } from "./historian";
import { runNextSteps } from "./next-steps";
import { runScoutWatcher } from "./scout-watcher";
import { runSynthesis } from "./synthesis";

import { ROUTE_NAMES, type Route } from "../chat/route-names";
import { similarQuestions } from "../chat/mirror";
import { hypothesisQuery } from "../adam/hypothesis-query";
import { listProjects } from "../adam/project";
import { getWorkspaceGraph } from "../graph/client";

export { ROUTE_NAMES };
export type { Route };

const ROUTES: Record<Route, string> = {
  cite_scout: "Finding papers to cite for a specific sentence or claim the user wrote",
  citation_checker: "Checking whether the claims or citations in the user's current draft are supported",
  next_steps: "Suggesting what to research, read or try next",
  historian: "Recalling or recording the team's hypotheses, findings, past decisions or dead ends",
  synthesis: "Writing or drafting a literature review, survey or related-work section from the team's papers",
  scout_watcher: "Finding new or recent papers published since the team's library was built, or what new work cites the team's papers",
  // Paper searches land here (not in general): the team's graph is searched first, then OpenAlex.
  team_library: "Searching or finding papers on a topic or by name, asking which papers the team or a collaborator has, or what the team's papers say about a topic",
  hypothesis:
    "Testing a hypothesis the user states (\"is it true that…\", \"would X cause Y\", \"could we show that…\"): what verified evidence supports or contradicts it, under what conditions it holds, which chain of known methods could test it, and where the chain breaks",
  general: "Anything else: explanations of concepts, general questions, or help with writing and wording",
};

export interface RoutedBrief {
  route: Route;
  confidence: number;
  /** Plain-text evidence for the chat model to answer from */
  brief: string;
  /** AgentRun id when a specialist agent ran (provenance for the chat mirror) */
  runId: string | null;
  /** Team papers the evidence named, so the chat mirror can link the answer to them */
  paperIds: string[];
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
  let runId: string | null = null;
  const paperIds = new Set<string>();

  if (route === "cite_scout") {
    const r = await runCiteScout({ workspaceId: input.workspaceId, userId: input.userId, paragraph: input.message, fileId: input.fileId });
    runId = r.runId;
    r.items.forEach((s) => paperIds.add(s.paperId));
    if (r.deadEnd) lines.push(`Warning: ${r.deadEnd.byName} dropped a similar hypothesis (${r.deadEnd.reason ?? "no reason recorded"}).`);
    if (r.outcome === "SKIPPED") lines.push("The text doesn't look like a claim that needs a citation.");
    for (const s of r.items) {
      lines.push(`- ${s.label} “${s.title}” — ${Math.round(s.relevance * 100)}% match, ${s.reason}${s.passage ? ` Passage: "${s.passage.slice(0, 220)}"` : ""}`);
    }
    if (!r.items.length && r.outcome !== "SKIPPED") lines.push("Nothing in the team's library supports it yet.");
  } else if (route === "citation_checker" && input.fileId) {
    const r = await runCitationCheck({ workspaceId: input.workspaceId, fileId: input.fileId, userId: input.userId });
    runId = r.runId;
    r.items.forEach((c) => c.sources.forEach((s) => paperIds.add(s.paperId)));
    for (const c of r.items.filter((c) => c.verdict !== "ok")) {
      lines.push(`- [${c.verdict}] "${c.text.slice(0, 160)}" — ${c.why}${c.suggestion ? ` Suggest ${c.suggestion.label}.` : ""}`);
    }
    if (!lines.length) lines.push("Every claim in the draft is supported or needs no citation.");
  } else if (route === "next_steps") {
    const r = await runNextSteps({ workspaceId: input.workspaceId, userId: input.userId, fileId: input.fileId });
    runId = r.runId;
    for (const i of r.items) {
      lines.push(`- ${i.title} (${i.kind}; novelty ${Math.round(i.novelty * 100)}%, feasibility ${Math.round(i.feasibility * 100)}%): ${i.text} First step: ${i.action}. Grounded in: ${i.evidence.map((e) => e.label).join("; ")}`);
    }
  } else if (route === "historian") {
    const [similar, all, asked] = await Promise.all([
      recall({ workspaceId: input.workspaceId, text: input.message, limit: 5, maxDistance: 0.55 }),
      timeline(input.workspaceId, 15),
      similarQuestions(input.workspaceId, { text: input.message, limit: 3, maxDistance: 0.5 }),
    ]);
    const items = similar.length ? similar : all;
    for (const m of items) {
      lines.push(`- ${m.kind} (${m.status}) by ${m.byName}, ${new Date(m.validFrom).toDateString()}: "${m.text}"${m.reason ? ` — reason: ${m.reason}` : ""}`);
    }
    if (!lines.length) lines.push("The team hasn't recorded any hypotheses or findings yet (use /hypothesis in the editor).");
    // What the team already asked in this chat about the same thing
    for (const q of asked) {
      lines.push(`- ${q.byName} asked on ${new Date(q.at).toDateString()}: "${q.text}"${q.answer ? ` — answered (${q.route ?? "chat"}): ${q.answer.replace(/\s+/g, " ").slice(0, 200)}` : ""}`);
    }
  } else if (route === "scout_watcher") {
    const r = await runScoutWatcher({ workspaceId: input.workspaceId, userId: input.userId });
    runId = r.runId;
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
    runId = r.runId;
    r.items.forEach((s) => s.papers.forEach((p) => paperIds.add(p.paperId)));
    if (r.fileId) {
      lines.push(`Drafted "${r.title}" as a new document in the workspace (tell the user to open it from the sidebar). Sections:`);
      for (const s of r.items) lines.push(`- ${s.heading}: ${s.papers.map((p) => p.label).join(", ")}`);
    } else lines.push("Not enough team papers on this topic to draft a review.");
  } else if (route === "hypothesis") {
    // Adam: the most recent research project in the workspace answers hypothesis-as-a-query
    const [project] = await listProjects(input.workspaceId);
    if (!project) {
      lines.push("There is no Adam research project in this workspace yet. Open Adam from the sidebar, write the question page and run the loop; then hypotheses can be tested against the graph of known steps.");
    } else {
      const graph = await getWorkspaceGraph(input.workspaceId);
      const r = await hypothesisQuery(graph, input.workspaceId, project, { text: input.message, userId: input.userId });
      runId = r.runId;
      lines.push(`Hypothesis: ${r.statement}`);
      lines.push(`Predicted result: ${r.predictedResult}`);
      for (const s of r.subclaims) {
        lines.push(`Sub-claim: ${s.text}${s.gap ? " — GAP: nothing verified in the graph supports this" : ""}`);
        for (const h of s.for) {
          paperIds.add(h.paperId);
          lines.push(`  - supports: "${h.text.slice(0, 200)}" (${h.paper}${h.year ? `, ${h.year}` : ""}${h.page ? `, p.${h.page}` : ""}${h.section ? `, ${h.section}` : ""})`);
        }
        for (const h of s.against) {
          paperIds.add(h.paperId);
          lines.push(`  - contradicts: "${h.text.slice(0, 200)}" (${h.paper}${h.year ? `, ${h.year}` : ""}${h.page ? `, p.${h.page}` : ""})`);
        }
      }
      if (r.boundary.holds.length) lines.push(`Holds under: ${r.boundary.holds.slice(0, 6).join("; ")}`);
      if (r.boundary.fails.length) lines.push(`Fails under: ${r.boundary.fails.slice(0, 6).join("; ")}`);
      if (r.boundary.assumptions.length) lines.push(`Rests on assumptions: ${r.boundary.assumptions.slice(0, 5).map((a) => `${a.text}${a.loadBearing ? " (load-bearing)" : ""}`).join("; ")}`);
      if (r.chains.length) {
        lines.push(`Candidate chains of known steps (cheapest to kill first):`);
        for (const c of r.chains.slice(0, 3)) lines.push(`  ${c.rank}. ${c.steps.map((s) => `${s.name} [${s.status}]`).join(" → ")} → ${c.resultText.slice(0, 120)} (cost ${Math.round(c.cost)}, ${c.gaps} gap(s), ${c.feasible ? "feasible for this lab" : "not feasible as is"})`);
      } else lines.push("No chain of procedures in the graph reaches the predicted result yet; the Methods Hunter has been pointed at the gap.");
      for (const g of r.gaps) lines.push(`Gap: ${g.text}`);
      if (r.rivals.length) lines.push(`Rival chains reach a similar result without the mechanism: ${r.rivals.slice(0, 2).map((c) => c.steps.map((s) => s.name).join(" → ")).join(" | ")}`);
      if (r.costToKill) lines.push(`Cost to kill: ${r.costToKill.cost} via ${r.costToKill.description}`);
    }
  } else if (route === "team_library") {
    const found = await searchTeamLibrary(input.workspaceId, input.message, { limit: 10 });
    // "Which papers does Bea have…" — keep only that collaborator's papers when one is named
    const msg = input.message.toLowerCase();
    const named = [...new Set(found.flatMap((p) => p.owners))].filter((o) => {
      const first = o.split(/[\s(]/)[0].toLowerCase();
      return first.length > 1 && new RegExp(`\\b${first}\\b`).test(msg);
    });
    const r = (named.length ? found.filter((p) => p.owners.some((o) => named.includes(o))) : found).slice(0, 6);
    r.forEach((p) => paperIds.add(p.paperId));
    for (const p of r) lines.push(`- ${citationLabel(p)} “${p.title}” — in ${p.owners.join(" & ")}'s library${p.passage ? `. Passage: "${p.passage.text.replace(/\s+/g, " ").slice(0, 200)}"` : ""}`);
    if (!lines.length) {
      // Nothing in the graph: look at the wider literature so a search never comes back empty-handed
      const wider = await searchWorks(input.message.split(/\s+/).slice(0, 12).join(" "), 5).catch(() => []);
      lines.push(named.length ? `${named.join(" & ")} has no papers on this in the team library.` : "Nothing in the team's library matches.");
      if (wider.length) {
        lines.push("From OpenAlex (not in the team library yet; the user can add any of them from Research papers → Search papers):");
        for (const w of wider) lines.push(`- ${citationLabel(w)} “${w.title}”${w.venue ? `, ${w.venue}` : ""}, ${w.citationCount.toLocaleString()} citations`);
      }
    }
  }

  return { route, confidence, brief: lines.join("\n"), runId, paperIds: [...paperIds] };
}
