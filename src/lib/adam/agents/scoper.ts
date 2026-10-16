// Scoper — one job: turn the researcher's brief into a Question page (spec, Phase 0).
// Reads the brief and constraints; writes the page: hunch, why it matters, 3–5 answerable
// sub-questions, search vocabulary including the names neighbouring fields use for the same
// problem, and a scope fence. A separate scope checker (which sees only the page, never the
// Scoper's reasoning) asks the step's question: is each sub-question answerable, and does the
// fence exclude something the hunch depends on? The researcher approves the page (gate 1).

import type { Graph } from "falkordb";
import { z } from "zod";
import { TEAM_PAPER_DETAILS } from "../../graph/queries";
import { startRun } from "../../agents/base";
import { structured } from "../llm";
import { writeQuestionPage, type QuestionPage, type ScopeChecks } from "../question-page";
import type { AdamProject } from "../types";

const PageSchema = z.object({
  hunch: z.string().describe("The researcher's hunch, restated in one or two sentences as a claim that could be wrong"),
  why: z.string().describe("Why answering this matters, in a short paragraph"),
  subquestions: z
    .array(
      z.object({
        id: z.string().describe("q1, q2, …"),
        text: z.string().describe("A sub-question an experiment or a body of evidence could settle"),
        answerableBy: z.string().describe("What evidence or experiment would settle it"),
      }),
    )
    .min(3)
    .max(5),
  vocabulary: z.object({
    terms: z.array(z.string()).min(5).max(25).describe("Search terms the field itself uses"),
    adjacentTerms: z
      .array(z.object({ term: z.string(), field: z.string() }))
      .min(2)
      .max(12)
      .describe("The same problem under other names in neighbouring fields"),
  }),
  scopeFence: z.object({
    inside: z.array(z.string()).min(2).max(10).describe("What is in scope"),
    outside: z.array(z.string()).min(2).max(10).describe("What is deliberately out of scope"),
  }),
});

const ChecksSchema = z.object({
  subquestions: z.array(
    z.object({
      id: z.string(),
      answerable: z.boolean().describe("Could a specific experiment or body of evidence settle it?"),
      issue: z.string().nullable().describe("Why not, or what would make it answerable; null if fine"),
    }),
  ),
  fenceIssues: z.array(z.string()).describe("Things the fence excludes that the hunch actually depends on; empty if none"),
});

const SCOPER_SYSTEM = `You are the Scoper in a research-agent system. The premise of the system: a new result is a new combination of known steps. Your page decides what the Searcher reads and what the Extractor looks for, so be concrete and specific to the researcher's topic. Sub-questions must be ones that evidence could settle (not "is X interesting?"). Adjacent terms matter: the same problem is often solved under another name in a neighbouring field, and the Searcher can only find it if you name it. The scope fence keeps the sweep finite; put real, tempting-but-out-of-scope things in "outside".`;

const CHECKER_SYSTEM = `You are the scope checker. You see only a Question page, never the reasoning behind it. Answer two questions honestly: (1) for each sub-question, could a specific experiment or body of evidence actually settle it? A question no experiment could settle is a failure. (2) Does the scope fence exclude something the hunch itself depends on? Be strict but fair; most reasonable pages pass.`;

export async function runScoper(graph: Graph, workspaceId: string, project: AdamProject, opts: { note?: string } = {}): Promise<QuestionPage> {
  const run = await startRun("adam-scoper", workspaceId, { projectId: project.id, pass: project.pass });

  // Seed papers the researcher trusts / distrusts, by title, so the page can lean on them
  const seedIds = project.seeds.map((s) => s.paperId);
  const seeds = seedIds.length
    ? ((await run.step(
        "graph.seedPapers",
        async () => (await graph.roQuery<{ paperId: string; title: string; year: number | null }>(TEAM_PAPER_DETAILS, { params: { ids: seedIds } as never })).data ?? [],
        { source: "graph", cypher: "TEAM_PAPER_DETAILS" },
      )) as { paperId: string; title: string; year: number | null }[])
    : [];
  const seedLines = seeds.map((s) => {
    const label = project.seeds.find((x) => x.paperId === s.paperId)?.label ?? "trusted";
    return `- [${label}] ${s.title}${s.year ? ` (${s.year})` : ""}`;
  });

  const c = project.constraints;
  const brief = [
    `Topic: ${project.topic || project.title}`,
    project.understanding ? `Researcher's current understanding (what they believe, have read, suspect is wrong):\n${project.understanding}` : "",
    `Constraints: equipment ${c.equipment.join(", ") || "unspecified"}; data ${c.data.join(", ") || "unspecified"}; skills ${c.skills.join(", ") || "unspecified"}; time ${c.timeWeeks ?? "?"} weeks; budget ${c.budgetUsd ?? "?"} USD`,
    seedLines.length ? `Seed papers:\n${seedLines.join("\n")}` : "",
    opts.note ? `Note from the researcher on the previous version: ${opts.note}` : "",
    project.pass > 1 ? `This is pass ${project.pass}: sharpen the sub-questions from what earlier passes left open.` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const page = await run.step("llm.scoper", () => structured({ graph, projectId: project.id, schema: PageSchema, system: SCOPER_SYSTEM, prompt: brief, label: "scoper" }), {
    source: "llm",
  });

  const checks = await run.step(
    "llm.scopeChecker",
    () =>
      structured({
        graph,
        projectId: project.id,
        schema: ChecksSchema,
        system: CHECKER_SYSTEM,
        prompt: `Question page:\n${JSON.stringify(page.object, null, 2)}`,
        label: "scope-checker",
      }),
    { source: "llm" },
  );

  const scopeChecks: ScopeChecks = {
    subquestions: page.object.subquestions.map((q) => {
      const v = checks.object.subquestions.find((x) => x.id === q.id);
      return { id: q.id, answerable: v?.answerable ?? true, issue: v?.issue ?? null };
    }),
    fenceIssues: checks.object.fenceIssues,
    ready: checks.object.subquestions.every((x) => x.answerable) && checks.object.fenceIssues.length === 0,
  };

  const written = await writeQuestionPage(graph, {
    projectId: project.id,
    pass: project.pass,
    ...page.object,
    checks: scopeChecks,
    state: scopeChecks.ready ? "agent_verified" : "low_confidence",
    runId: run.runId,
  });
  await run.finish("ANSWERED", [written], project.createdBy);
  return written;
}
