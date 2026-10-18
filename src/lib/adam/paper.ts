// From artefacts to paper (spec, "From artefacts to paper"). The system's outputs are the
// paper's sections nearly one to one, so writing the pass up is assembly: the question page
// becomes the introduction, the graph and saturation view the related work, the methods
// dossier the methods, the briefs with their kill criteria the hypotheses, the falsification
// log the discussion, and every node's source the references. A reviewer who asks "where did
// this come from?" can be answered with a click, because every sentence traces to a node and
// every node to a passage. The document is a normal workspace file in an "Adam" folder, so
// collaborators read, edit and cite it like any other draft.

import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import type { Graph } from "falkordb";
import { z } from "zod";
import db from "@/db";
import { files, folders } from "@/db/schema";
import { startRun } from "../agents/base";
import { citationHref, citationLabel } from "../citations";
import { emit } from "./events";
import { structured } from "./llm";
import { CANDIDATES } from "./queries-analyst";
import { OBSERVATIONS, PLANS, VERDICTS } from "./queries-experiments";
import { ATTACKS_FOR, BRIEF_EVIDENCE, BRIEFS, WRITER_CLAIMS } from "./queries-hypotheses";
import { METHODS_DOSSIER } from "./queries-methods";
import { ADD_PROJECT_PAPER, TRIAGED_PAPERS } from "./queries";
import { OPEN_QUESTIONS } from "./queries-saturation";
import { getQuestionPage } from "./question-page";
import { clusterStats } from "./saturation";
import { parseJson, type AdamProject } from "./types";

type Mark = { type: string; attrs?: Record<string, unknown> };
type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string; marks?: Mark[] };

const text = (t: string, marks?: Mark[]): Node => ({ type: "text", text: t, ...(marks ? { marks } : {}) });
const h = (level: number, t: string): Node => ({ type: "heading", attrs: { level }, content: [text(t)] });
const p = (...nodes: (Node | string)[]): Node => ({ type: "paragraph", content: nodes.map((n) => (typeof n === "string" ? text(n) : n)) });
const bullets = (items: Node[][]): Node => ({ type: "bulletList", content: items.map((c) => ({ type: "listItem", content: [{ type: "paragraph", content: c }] })) });

/** ProseMirror rejects empty text nodes and empty paragraphs; the editor crashes on them. Strip them before saving. */
function clean(nodes: Node[]): Node[] {
  const out: Node[] = [];
  for (const n of nodes) {
    if (n.type === "text") {
      if (n.text) out.push(n);
      continue;
    }
    const content = n.content ? clean(n.content) : undefined;
    if ((n.type === "paragraph" || n.type === "listItem" || n.type === "bulletList" || n.type === "orderedList") && (!content || content.length === 0)) continue;
    out.push(content ? { ...n, content } : n);
  }
  return out;
}

const ProseSchema = z.object({
  abstract: z.string().describe("Four to six sentences: the question, what was read, what the graph shows, the hypotheses and what would kill them"),
  introduction: z.string().describe("Two paragraphs: the hunch and why it matters, then the sub-questions as a research programme. Plain prose, no citations"),
  discussion: z.string().describe("Two paragraphs: what the attacks established, what remains open, and where the boundary of the claims lies. Plain prose"),
});

const params = <T>(x: T) => ({ params: x as never });

export interface PaperResult {
  fileId: string;
  folderId: string;
  title: string;
  sections: number;
  references: number;
}

export async function writePassPaper(graph: Graph, workspaceId: string, project: AdamProject, userId: string): Promise<PaperResult> {
  const run = await startRun("adam-writer", workspaceId, { projectId: project.id, pass: project.pass, action: "paper" });
  const pid = project.id;

  // 1. Gather the artefacts
  const [page, clusters, claims, methods, briefs, plans, candidates, questions, papers] = await Promise.all([
    getQuestionPage(graph, pid),
    clusterStats(graph, pid),
    graph.roQuery<{ id: string; text: string; section: string; speculative: boolean; conditions: string[]; paperId: string; paper: string; year: number; page: number; triage: string }>(WRITER_CLAIMS, params({ projectId: pid, limit: 80 })).then((r) => r.data ?? []),
    graph.roQuery<{ id: string; name: string; procedureName: string | null; runnability: string | null; feasibility: string | null; inputs: string[]; outputs: string[]; steps: string[]; missing: string[]; claims: number; expected: string | null; sources: string }>(METHODS_DOSSIER, params({ projectId: pid })).then((r) => r.data ?? []),
    graph.roQuery<{ id: string; pass: number; status: string; statement: string; mechanism: string; boundaryHolds: string[]; boundaryFails: string[]; predictionIfTrue: string; predictionIfFalse: string; killCriteria: string; killSignedAt: number | null; convergenceRounds: number; minimumExperiment: string | null; costToKill: number }>(BRIEFS, params({ projectId: pid })).then((r) => r.data ?? []),
    graph.roQuery<{ id: string; hypothesisId: string; steps: string; controls: string; rationale: string; killTest: string; costToKill: number; approvedAt: number | null; designPasses: boolean }>(PLANS, params({ projectId: pid })).then((r) => r.data ?? []),
    graph.roQuery<{ kind: string; summary: string; detail: string; sane: boolean }>(CANDIDATES, params({ projectId: pid })).then((r) => r.data ?? []),
    graph.roQuery<{ kind: string; text: string; chainsNeeding: number }>(OPEN_QUESTIONS, params({ projectId: pid })).then((r) => r.data ?? []),
    graph.roQuery<{ paperId: string; title: string; year: number | null; doi: string | null; arxivId: string | null; label: string; accessStatus: string; chunks: number }>(TRIAGED_PAPERS, params({ projectId: pid })).then((r) => r.data ?? []),
  ]);
  if (!page) throw new Error("No question page to write up");
  const paperOf = new Map(papers.map((x) => [x.paperId, x]));
  const cite = (paperId: string): Node[] => {
    const pp = paperOf.get(paperId);
    if (!pp) return [];
    const label = citationLabel({ authors: [], year: pp.year, title: pp.title });
    return [text(" "), text(label, [{ type: "link", attrs: { href: citationHref({ doi: pp.doi, arxivId: pp.arxivId, paperId: pp.paperId }) ?? "#" } }])];
  };
  const briefAttacks = new Map<string, { kind: string; text: string; answer: string; status: string; control: string }[]>();
  const briefEvidence = new Map<string, { type: string; id: string; text: string; paper: string; year: number; page: number }[]>();
  for (const b of briefs) {
    briefAttacks.set(b.id, (await graph.roQuery<{ kind: string; text: string; answer: string; status: string; control: string }>(ATTACKS_FOR, params({ id: b.id }))).data ?? []);
    briefEvidence.set(b.id, (await graph.roQuery<{ type: string; id: string; text: string; paper: string; year: number; page: number }>(BRIEF_EVIDENCE, params({ id: b.id }))).data ?? []);
  }
  const thisPass = briefs.filter((b) => b.pass === project.pass);
  const claimPaper = new Map(claims.map((c) => [c.id, c.paperId]));

  // 2. The prose sections (abstract, introduction, discussion), written only from the assembled facts
  const facts = [
    `Project: ${project.title}. Pass ${project.pass}.`,
    `Hunch: ${page.hunch}\nWhy: ${page.why}\nSub-questions:\n${page.subquestions.map((q) => `- ${q.text}`).join("\n")}`,
    `Papers triaged: ${papers.length} (${papers.filter((x) => x.label === "core").length} core, ${papers.filter((x) => x.label === "contradicts").length} contradicting, ${papers.filter((x) => x.label === "method_only").length} method); ${papers.filter((x) => x.chunks > 0).length} read in full.`,
    `Clusters: ${clusters.map((c) => `${c.label}: ${c.papers} papers, ${c.saturated ? "saturated" : "still learning"}`).join("; ")}`,
    `Verified claims (sample): ${claims.slice(0, 25).map((c) => `"${c.text}" (${c.paper}, ${c.year || "n.d."})`).join("; ")}`,
    `Methods with procedures: ${methods.filter((m) => m.procedureName).map((m) => `${m.name} (${m.runnability})`).slice(0, 20).join("; ")}`,
    `Analyst candidates: ${candidates.filter((c) => c.sane).map((c) => `[${c.kind}] ${c.summary}`).join("; ") || "none"}`,
    `Hypotheses this pass:\n${thisPass.map((b) => `- (${b.status}) ${b.statement}\n  holds: ${b.boundaryHolds.join("; ")}\n  fails: ${b.boundaryFails.join("; ")}\n  kill: ${b.killCriteria}\n  attacks: ${(briefAttacks.get(b.id) ?? []).map((a) => `${a.kind}/${a.status}`).join(", ")}`).join("\n")}`,
    `Open questions: ${questions.map((q) => q.text).slice(0, 10).join("; ") || "none"}`,
  ].join("\n\n");
  const prose = await run.step(
    "llm.prose",
    () =>
      structured({
        graph,
        projectId: pid,
        schema: ProseSchema,
        system: "You write the narrative sections of a research write-up from a structured record of what an agent system found. Use only the facts given; never invent results, numbers or papers. Plain, precise prose a reviewer would respect.",
        prompt: facts,
        tier: "heavy",
        maxTokens: 4000,
        label: "paper:prose",
      }),
    { source: "llm" },
  );
  const paras = (s: string) => s.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean).map((x) => p(x));

  // 3. Assemble the document
  const title = `${project.title}: pass ${project.pass}`;
  const c: Node[] = [
    h(1, title),
    p(text(`Written by Adam from the research graph on ${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}. Every statement below traces to a node in the graph, and every node to a passage in a source. Edit freely; the Citation Checker understands the links.`, [{ type: "italic" }])),
    h(2, "Abstract"),
    ...paras(prose.object.abstract),
    h(2, "1. Introduction: the question"),
    ...paras(prose.object.introduction),
    bullets(page.subquestions.map((q, i) => [text(`Q${i + 1}. ${q.text}`), text(q.answerableBy ? ` Settled by: ${q.answerableBy}` : "", [{ type: "italic" }])])),
    p(text("In scope: ", [{ type: "bold" }]), page.scopeFence.inside.join("; "), text(" Out of scope: ", [{ type: "bold" }]), page.scopeFence.outside.join("; ")),
    h(2, "2. Related work: what is known, where it conflicts, what is untested"),
    p(`${papers.length} papers were triaged (${papers.filter((x) => x.label === "core").length} core, ${papers.filter((x) => x.label === "contradicts").length} contradicting, ${papers.filter((x) => x.label === "method_only").length} method), ${papers.filter((x) => x.chunks > 0).length} read in full. Coverage by cluster:`),
    bullets(clusters.map((cl) => [text(`${cl.label}: ${cl.papers} papers read; `), text(cl.saturated ? "saturated (the last papers added nothing new)" : cl.papers < 5 ? "thin" : "still adding new claims")])),
  ];
  for (const cl of clusters) {
    const inCluster = claims.filter((x) => paperOf.get(x.paperId) && x.triage !== "background").slice(0, 60);
    const mine = inCluster.filter((x) => papers.find((pp) => pp.paperId === x.paperId)).slice(0, 8);
    if (!mine.length) continue;
    c.push(h(3, cl.label));
    c.push(bullets(mine.map((x) => [text(x.text), ...cite(x.paperId), text(x.page ? ` (p.${x.page}, ${x.section})` : ` (${x.section})`, [{ type: "italic" }])])));
  }
  const conflicts = candidates.filter((x) => x.kind === "conflict" && x.sane);
  const loadBearing = candidates.filter((x) => x.kind === "load_bearing" && x.sane);
  const holes = candidates.filter((x) => x.kind === "hole" && x.sane);
  if (conflicts.length) {
    c.push(h(3, "Where the literature disagrees"));
    c.push(bullets(conflicts.map((x) => [text(x.summary), text(` Possible explanations: ${(parseJson<{ explanations?: string[] }>(x.detail, {}).explanations ?? []).join("; ")}`, [{ type: "italic" }])])));
  }
  if (loadBearing.length) {
    c.push(h(3, "Assumptions many claims rest on that nothing has tested"));
    c.push(bullets(loadBearing.map((x) => [text(x.summary), text(` Cheapest test: ${parseJson<{ cheapestTest?: string }>(x.detail, {}).cheapestTest ?? ""}`, [{ type: "italic" }])])));
  }
  if (holes.length) {
    c.push(h(3, "Related clusters nobody has connected"));
    c.push(bullets(holes.map((x) => [text(x.summary), text(` ${parseJson<{ question?: string }>(x.detail, {}).question ?? ""}`, [{ type: "italic" }])])));
  }

  c.push(h(2, "3. Methods: the known steps"));
  const withProc = methods.filter((m) => m.procedureName);
  c.push(p(`${methods.length} methods appear in the verified claims; ${withProc.length} were filled in to procedures (${withProc.filter((m) => m.runnability === "runnable").length} runnable as written, ${withProc.filter((m) => m.runnability === "partial").length} partial, ${withProc.filter((m) => m.runnability === "unknown").length} unknown).`));
  for (const m of withProc.slice(0, 25)) {
    c.push(h(3, `${m.procedureName ?? m.name} (${m.runnability ?? "unknown"}${m.feasibility ? `, ${m.feasibility.replace(/_/g, " ")}` : ""})`));
    if (m.expected) c.push(p(text("Produces: ", [{ type: "bold" }]), m.expected));
    if (m.inputs.length || m.outputs.length) c.push(p(text("Inputs: ", [{ type: "bold" }]), m.inputs.join("; ") || "—", text(" Outputs: ", [{ type: "bold" }]), m.outputs.join("; ") || "—"));
    if (m.steps.length) c.push({ type: "orderedList", content: m.steps.map((s) => ({ type: "listItem", content: [p(s)] })) });
    if (m.missing.length) c.push(p(text("Still missing: ", [{ type: "bold" }]), m.missing.join("; ")));
    const srcs = parseJson<{ chunkId: string; quote: string }[]>(m.sources, []);
    if (srcs.length) c.push(p(text(`Sources: ${srcs.slice(0, 3).map((s) => `“${s.quote.slice(0, 120)}”`).join(" · ")}`, [{ type: "italic" }])));
  }

  c.push(h(2, "4. Hypotheses and predictions, stated before results"));
  for (const b of thisPass) {
    const ev = briefEvidence.get(b.id) ?? [];
    c.push(h(3, `${b.statement} (${b.status})`));
    c.push(p(b.mechanism));
    c.push(p(text("Holds under: ", [{ type: "bold" }]), b.boundaryHolds.join("; ") || "—", text(" Fails under: ", [{ type: "bold" }]), b.boundaryFails.join("; ") || "no failure condition named"));
    c.push(p(text("Prediction: ", [{ type: "bold" }]), `If true, ${b.predictionIfTrue} If false, ${b.predictionIfFalse}`));
    c.push(p(text("Kill criterion", [{ type: "bold" }]), text(b.killSignedAt ? ` (signed ${new Date(b.killSignedAt).toLocaleDateString()}): ` : " (unsigned): "), b.killCriteria || "—"));
    const forE = ev.filter((e) => e.type === "EVIDENCE_FOR");
    const against = ev.filter((e) => e.type === "EVIDENCE_AGAINST");
    if (forE.length) c.push(p(text("Evidence for:", [{ type: "bold" }])), bullets(forE.map((e) => [text(e.text), ...cite(claimPaper.get(e.id) ?? ""), text(e.page ? ` (p.${e.page})` : "", [{ type: "italic" }])])));
    if (against.length) c.push(p(text("Evidence against:", [{ type: "bold" }])), bullets(against.map((e) => [text(e.text), ...cite(claimPaper.get(e.id) ?? ""), text(e.page ? ` (p.${e.page})` : "", [{ type: "italic" }])])));
    if (b.minimumExperiment) c.push(p(text("Minimum viable experiment: ", [{ type: "bold" }]), `${b.minimumExperiment} (cost to kill ${Math.round(b.costToKill)})`));
  }

  const planRows = plans.filter((x) => thisPass.some((b) => b.id === x.hypothesisId));
  if (planRows.length) {
    c.push(h(2, "5. Experiment plans"));
    for (const pl of planRows) {
      const b = thisPass.find((x) => x.id === pl.hypothesisId)!;
      const steps = parseJson<{ name: string; purpose: string; status: string; gap: boolean; control: string | null }[]>(pl.steps, []);
      const controls = parseJson<{ rival: string; control: string }[]>(pl.controls, []);
      c.push(h(3, `Plan for: ${b.statement}${pl.approvedAt ? " (approved)" : ""}`));
      c.push({ type: "orderedList", content: steps.map((s) => ({ type: "listItem", content: [p(text(`${s.name} [${s.status}${s.gap ? ", gap" : ""}]: `, [{ type: "bold" }]), s.purpose, s.control ? ` Control: ${s.control}` : "")] })) });
      if (controls.length) c.push(p(text("Controls for rival explanations: ", [{ type: "bold" }]), controls.map((x) => `${x.rival} → ${x.control}`).join("; ")));
      if (pl.killTest) c.push(p(text("Maps to the kill criterion: ", [{ type: "bold" }]), pl.killTest));
      if (!pl.designPasses) c.push(p(text("The design check flagged issues with this plan; see the Experiments tab.", [{ type: "italic" }])));
    }
  }

  c.push(h(2, "6. Results"));
  const [observations, verdicts] = await Promise.all([
    graph.roQuery<{ planId: string; hypothesisId: string; order: number; text: string; done: boolean; observedAt: number | null }>(OBSERVATIONS, params({ projectId: pid })).then((r) => r.data ?? []),
    graph.roQuery<{ id: string; verdict: string; note: string; at: number | null }>(VERDICTS, params({ projectId: pid })).then((r) => r.data ?? []),
  ]);
  const observed = planRows.filter((pl) => observations.some((o) => o.planId === pl.id && (o.text || o.done)));
  if (!observed.length && !verdicts.some((v) => thisPass.some((b) => b.id === v.id))) {
    c.push(p("No laboratory results have been recorded for this pass. When the approved plan is run, the observations and the verdict recorded in the Experiment step appear here, with the researcher as their source."));
  }
  for (const pl of observed) {
    const b = thisPass.find((x) => x.id === pl.hypothesisId)!;
    const steps = parseJson<{ name: string }[]>(pl.steps, []);
    c.push(h(3, `Observations for: ${b.statement}`));
    c.push({
      type: "orderedList",
      content: observations
        .filter((o) => o.planId === pl.id && (o.text || o.done))
        .sort((x, y) => x.order - y.order)
        .map((o) => ({ type: "listItem", content: [p(text(`${steps[o.order - 1]?.name ?? `Step ${o.order}`}${o.done ? " (done)" : ""}: `, [{ type: "bold" }]), o.text || "no notes", text(o.observedAt ? ` [${new Date(o.observedAt).toLocaleDateString()}]` : "", [{ type: "italic" }]))] })),
    });
  }
  for (const v of verdicts.filter((x) => thisPass.some((b) => b.id === x.id))) {
    const b = thisPass.find((x) => x.id === v.id)!;
    c.push(p(text(v.verdict === "killed" ? "Verdict: dropped. " : "Verdict: stands, so far. ", [{ type: "bold" }]), `${v.verdict === "killed" ? "The kill result appeared" : "The kill result did not appear"} when the plan for “${b.statement}” was run${v.note ? `: ${v.note}` : "."}`, text(v.at ? ` Recorded ${new Date(v.at).toLocaleDateString()} by the researcher.` : "", [{ type: "italic" }])));
  }

  c.push(h(2, "7. Discussion, limitations and controls"));
  c.push(...paras(prose.object.discussion));
  for (const b of thisPass) {
    const atk = briefAttacks.get(b.id) ?? [];
    if (!atk.length) continue;
    c.push(h(3, `Falsification log: ${b.statement.slice(0, 90)}${b.statement.length > 90 ? "…" : ""}`));
    c.push(bullets(atk.map((a) => [text(`${a.kind.replace(/_/g, " ")} (${a.status}): `, [{ type: "bold" }]), text(a.text), text(a.answer ? ` Answer: ${a.answer}` : "", [{ type: "italic" }]), text(a.control ? ` Control: ${a.control}` : "")])));
  }
  if (questions.length) {
    c.push(h(3, "Open questions"));
    c.push(bullets(questions.slice(0, 15).map((q) => [text(q.text), text(q.chainsNeeding ? ` (${q.chainsNeeding} chain${q.chainsNeeding === 1 ? "" : "s"} need this)` : "", [{ type: "italic" }])])));
  }

  const cited = [...new Set([...claims.map((x) => x.paperId), ...[...briefEvidence.values()].flat().map((e) => claimPaper.get(e.id) ?? "")])].filter((id) => paperOf.has(id));
  c.push(h(2, "References"));
  c.push(bullets(cited.map((id) => {
    const pp = paperOf.get(id)!;
    return [text(`${pp.title}${pp.year ? ` (${pp.year})` : ""}. `), text(citationHref({ doi: pp.doi, arxivId: pp.arxivId, paperId: pp.paperId }) ?? "", [{ type: "link", attrs: { href: citationHref({ doi: pp.doi, arxivId: pp.arxivId, paperId: pp.paperId }) ?? "#" } }])];
  })));

  // 4. Save as a file in the workspace's "Adam" folder
  const fileId = randomUUID();
  const folderId = await run.step(
    "db.createFile",
    async () => {
      let [folder] = await db.select({ id: folders.id }).from(folders).where(and(eq(folders.workspaceId, workspaceId), eq(folders.title, "Adam")));
      if (!folder) [folder] = await db.insert(folders).values({ title: "Adam", iconId: "🧪", workspaceId, inTrash: "" }).returning({ id: folders.id });
      await db.insert(files).values({ id: fileId, title: title.slice(0, 120), iconId: "🧪", data: JSON.stringify({ type: "doc", content: clean(c) }), workspaceId, folderId: folder.id, inTrash: "" });
      return folder.id;
    },
    { source: "graph" },
  );
  await graph.query(ADD_PROJECT_PAPER, params({ id: pid, entry: JSON.stringify({ pass: project.pass, fileId, title, at: Date.now() }), at: Date.now() }));
  await emit(graph, pid, "paper_written", { pass: project.pass, fileId, title, by: userId });
  const result: PaperResult = { fileId, folderId, title, sections: c.filter((n) => n.type === "heading" && n.attrs?.level === 2).length, references: cited.length };
  await run.finish("ANSWERED", [result], userId);
  return result;
}
