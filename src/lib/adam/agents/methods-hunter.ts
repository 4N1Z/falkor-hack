// Methods Hunter — one job: chase one Method to the point where it could be run (spec,
// Phase 3 · Methods). A Method is a technique as a paper names it, usually underspecified; a
// Procedure is that method filled in: inputs, outputs, expected result, conditions, equipment,
// time, cost, reliability, and the ordered steps. Sources are the mentions' passages, the
// methods / appendix / supplementary / caption passages of the papers that use it, and the
// linked artefacts (READMEs, protocols) those papers point to. The runnability checker (a
// separate call that sees only the procedure and its sources) asks the step's question: could
// a competent lab follow this as written, and what is still missing? Feasibility is judged
// against the researcher's constraints, which decide which chains the lab can actually run.

import { ADAM_QUERY_TIMEOUT_MS } from "../types";
import type { Graph } from "falkordb";
import { z } from "zod";
import { startRun } from "../../agents/base";
import { embedTexts } from "../../graph/embeddings";
import { indexArtefacts } from "../artefacts";
import { clip, structured } from "../llm";
import {
  CLEAR_PROCEDURE_LINKS,
  INSTRUMENT_BY_KEY,
  LINK_PROCEDURE_DEPENDS,
  LINK_PROCEDURE_USES,
  METHOD_PAPER_PASSAGES,
  METHOD_PAPER_URLS,
  METHOD_SOURCES,
  PROCEDURE_BY_METHOD_KEY,
  UPSERT_INSTRUMENT,
  UPSERT_PROCEDURE,
  UPSERT_RESULT,
} from "../queries-methods";
import { nameKey } from "../resolve";
import type { AdamProject } from "../types";

const ProcedureSchema = z.object({
  name: z.string().describe("The procedure's name, specific enough to tell variants apart"),
  summary: z.string().describe("Two or three sentences: what it does and what it is for"),
  inputs: z.array(z.string()).describe("What goes in: materials, data, models, with sizes or formats when given"),
  outputs: z.array(z.string()).describe("What comes out"),
  expectedResult: z.string().describe("The outcome this procedure produces when followed correctly, as a checkable statement"),
  conditions: z.array(z.string()).describe("Conditions under which it works: scale, settings, environment"),
  equipment: z.array(z.object({ name: z.string(), kind: z.enum(["equipment", "software", "dataset", "reagent"]) })).describe("Instruments, software, datasets, reagents it needs"),
  steps: z.array(z.string()).min(1).max(20).describe("The ordered steps, each concrete enough to act on"),
  prerequisites: z.array(z.string()).describe("Other procedures or methods that must have been run first (by name)"),
  timeHours: z.number().nullable().optional().describe("Wall-clock hours for one run, when the sources let you estimate it"),
  costUsd: z.number().nullable().optional().describe("Rough cost per run in USD, when estimable"),
  reliability: z.number().min(0).max(1).describe("How reliably it gives the expected result, from the sources' own reports"),
  reliabilityNote: z.string().describe("Why that reliability: variance, failure modes the sources mention"),
  sources: z.array(z.object({ chunkId: z.string(), quote: z.string().describe("Verbatim passage (20–300 chars) the detail comes from") })).min(1).max(12),
  missing: z.array(z.string()).describe("Details the sources do not give that a lab would need"),
});

const RunnabilitySchema = z.object({
  runnability: z.enum(["runnable", "partial", "unknown"]).describe("runnable: a competent lab could follow it as written; partial: some parameters or steps missing; unknown: the sources describe a technique, not a procedure"),
  missing: z.array(z.string()).describe("What is still missing, concretely"),
  note: z.string().describe("One or two sentences for the researcher"),
});

const FeasibilitySchema = z.object({
  feasibility: z.enum(["feasible", "missing_equipment", "missing_skill", "missing_data", "over_budget"]),
  note: z.string().describe("What the lab has and lacks for this procedure, in one or two sentences"),
  equipmentAvailable: z.array(z.string()).describe("Names of the procedure's equipment items the lab's constraints cover"),
});

const HUNTER_SYSTEM = `You are the Methods Hunter in a research-agent system whose premise is: a new result is a new combination of known steps. A Method is a technique as a paper names it; your job is to fill it in to a Procedure that could be run: inputs, outputs, expected result, conditions, equipment, time, cost, reliability, ordered steps. Use only the passages given (paper methods sections, captions, supplements, READMEs, protocols). Every detail must trace to a source passage you quote verbatim; what the sources do not say goes in "missing", never invented. Prefer the most complete source when papers differ, and note the variants in the summary.`;

const CHECKER_SYSTEM = `You are the runnability checker. You see a procedure and the passages it cites, never the reasoning behind it. Answer the step's question honestly: could a competent lab follow this procedure as written, and what is still missing? A procedure that names a technique but not its parameters is "unknown". One with steps but a few missing settings is "partial". Only a procedure another lab could execute from the text is "runnable".`;

const FEASIBILITY_SYSTEM = `You judge whether a lab can run a procedure given what it has. Match equipment, software, data and skills loosely but honestly: a lab with "2x A100 80GB" can run GPU training; a lab without wet-lab reagents cannot run a cell assay.`;

export interface HuntResult {
  methodId: string;
  procedureId: string;
  runnability: "runnable" | "partial" | "unknown";
  feasibility: string;
  missing: string[];
  sources: number;
  artefacts: number;
  prerequisitesLinked: number;
}

const params = <T>(p: T) => ({ params: p as never, TIMEOUT: ADAM_QUERY_TIMEOUT_MS });

export async function runMethodsHunter(
  graph: Graph,
  workspaceId: string,
  project: AdamProject,
  methodId: string,
  opts: { note?: string; heartbeat?: (p: Record<string, unknown>) => Promise<void>; log?: (m: string) => void } = {},
): Promise<HuntResult> {
  const run = await startRun("adam-methods-hunter", workspaceId, { projectId: project.id, methodId });
  const beat = opts.heartbeat ?? (async () => {});
  const log = opts.log ?? (() => {});

  // 1. Sources: mentions, the papers' methods-side passages, and linked artefacts
  const mentions = (await graph.roQuery<{ paperId: string; paperTitle: string; year: number | null; name: string; quote: string; parameters: string[]; page: number; chunkId: string; chunkText: string; section: string }>(METHOD_SOURCES, params({ methodId }))).data ?? [];
  if (!mentions.length) throw new Error("method has no mentions");
  const name = mentions[0].name;
  const urlRows = (await graph.roQuery<{ paperId: string; text: string; fetched: string[] }>(METHOD_PAPER_URLS, params({ methodId }))).data ?? [];
  const artefacts = await run.step("artefacts.index", () => indexArtefacts(graph, workspaceId, urlRows, log), { source: "graph" });
  await beat({ step: "artefacts", n: artefacts.length });
  const passages = (await graph.roQuery<{ paperId: string; paperTitle: string; id: string; text: string; page: number; section: string; kind: string; doc: string }>(METHOD_PAPER_PASSAGES, params({ methodId }))).data ?? [];

  // Rank passages by how much they talk about this method, keep a bounded context
  const keyTerms = [name, ...mentions.map((m) => m.name)].map((t) => t.toLowerCase());
  const scored = passages
    .map((p) => ({ p, score: keyTerms.reduce((s, t) => s + (p.text.toLowerCase().includes(t) ? 2 : 0), 0) + (p.doc === "artefact" ? 1 : 0) + (p.section === "methods" ? 1 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 28)
    .map((x) => x.p);
  const mentionChunks = new Map(mentions.filter((m) => m.chunkId).map((m) => [m.chunkId, m]));
  const sourceChunks = new Map<string, { id: string; text: string; page: number; section: string; paperTitle: string; doc: string }>();
  for (const m of mentions) if (m.chunkId) sourceChunks.set(m.chunkId, { id: m.chunkId, text: m.chunkText, page: m.page, section: m.section, paperTitle: m.paperTitle, doc: "body" });
  for (const p of scored) sourceChunks.set(p.id, { id: p.id, text: p.text, page: p.page, section: p.section, paperTitle: p.paperTitle, doc: p.doc });

  const rendered = [...sourceChunks.values()]
    .map((c) => `[c:${c.id} | ${c.paperTitle.slice(0, 60)} | p.${c.page} | ${c.section}${c.doc !== "body" ? ` | ${c.doc}` : ""}]\n${clip(c.text, 1800)}`)
    .join("\n\n");
  const mentionLines = mentions.map((m) => `- "${m.name}" in ${m.paperTitle} (p.${m.page})${m.parameters.length ? `: ${m.parameters.join("; ")}` : ""}`).join("\n");

  // 2. The procedure
  const proc = await run.step(
    "llm.hunt",
    () =>
      structured({
        graph,
        projectId: project.id,
        schema: ProcedureSchema,
        system: HUNTER_SYSTEM,
        prompt: `Method: ${name}\nMentions:\n${mentionLines}${opts.note ? `\n\nNote from the researcher on the previous procedure: ${opts.note}` : ""}\n\nSource passages:\n\n${rendered}`,
        tier: "heavy",
        maxTokens: 9000,
        label: `hunt:${methodId}`,
      }),
    { source: "llm" },
  );
  await beat({ step: "procedure" });
  const sources = proc.object.sources.filter((s) => sourceChunks.has(s.chunkId)).map((s) => ({ ...s, quote: clip(s.quote, 300) }));

  // 3. Checks: runnability (procedure + its quoted sources only) and feasibility (constraints)
  const quoted = sources.map((s) => `[c:${s.chunkId}] “${s.quote}”`).join("\n");
  const procedureText = JSON.stringify({ ...proc.object, sources: undefined }, null, 1);
  const [check, feas] = await Promise.all([
    run.step("llm.runnability", () => structured({ graph, projectId: project.id, schema: RunnabilitySchema, system: CHECKER_SYSTEM, prompt: `Procedure:\n${procedureText}\n\nSource passages it cites:\n${quoted}`, label: `runnability:${methodId}` }), {
      source: "llm",
    }),
    run.step(
      "llm.feasibility",
      () =>
        structured({
          graph,
          projectId: project.id,
          schema: FeasibilitySchema,
          system: FEASIBILITY_SYSTEM,
          prompt: `Lab constraints: equipment ${project.constraints.equipment.join(", ") || "unspecified"}; data ${project.constraints.data.join(", ") || "unspecified"}; skills ${project.constraints.skills.join(", ") || "unspecified"}; time ${project.constraints.timeWeeks ?? "?"} weeks; budget ${project.constraints.budgetUsd ?? "?"} USD.\n\nProcedure needs: equipment ${proc.object.equipment.map((e) => `${e.name} (${e.kind})`).join(", ") || "none listed"}; inputs ${proc.object.inputs.join(", ")}; time ${proc.object.timeHours ?? "?"} h; cost ${proc.object.costUsd ?? "?"} USD.\nSteps: ${proc.object.steps.join(" → ")}`,
          label: `feasibility:${methodId}`,
        }),
      { source: "llm" },
    ),
  ]);
  const missing = [...new Set([...proc.object.missing, ...check.object.missing])];

  // 4. Write: Procedure, Result, Instruments, prerequisites
  const at = Date.now();
  const procedureId = `procedure:${project.id.slice(0, 8)}:${methodId.split(":").slice(2).join(":")}`;
  const [procVec, resultVec] = await embedTexts([`${proc.object.name}. ${proc.object.summary}`, proc.object.expectedResult], "document");
  const primary = sources[0] ?? { chunkId: mentions[0].chunkId, quote: mentions[0].quote };
  const primaryChunk = sourceChunks.get(primary.chunkId) ?? mentionChunks.get(primary.chunkId);
  const paperIdOf = mentions.find((m) => m.chunkId === primary.chunkId)?.paperId ?? mentions[0].paperId;
  await graph.query(CLEAR_PROCEDURE_LINKS, params({ id: procedureId }));
  await graph.query(
    UPSERT_PROCEDURE,
    params({
      id: procedureId,
      methodId,
      projectId: project.id,
      name: proc.object.name,
      summary: proc.object.summary,
      inputs: proc.object.inputs,
      outputs: proc.object.outputs,
      expected: proc.object.expectedResult,
      conditions: proc.object.conditions,
      equipment: proc.object.equipment.map((e) => e.name),
      steps: proc.object.steps,
      timeHours: proc.object.timeHours ?? null,
      costUsd: proc.object.costUsd ?? null,
      reliability: proc.object.reliability,
      reliabilityNote: proc.object.reliabilityNote,
      prerequisites: proc.object.prerequisites,
      missing,
      runnability: check.object.runnability,
      runnabilityNote: check.object.note,
      feasibility: feas.object.feasibility,
      feasibilityNote: feas.object.note,
      sources: JSON.stringify(sources),
      quote: primary.quote,
      chunkId: primary.chunkId,
      page: primaryChunk?.page ?? 0,
      paperId: paperIdOf,
      state: check.object.runnability === "unknown" ? "low_confidence" : "agent_verified",
      confidence: check.object.runnability === "runnable" ? 0.9 : check.object.runnability === "partial" ? 0.6 : 0.3,
      runId: run.runId,
      textVersion: 1,
      at,
      embedding: procVec,
      by: "agent:adam-methods-hunter",
    }),
  );
  await graph.query(
    UPSERT_RESULT,
    params({
      id: `result:${procedureId.split(":").slice(1).join(":")}`,
      procedureId,
      projectId: project.id,
      text: proc.object.expectedResult,
      state: "agent_verified",
      confidence: proc.object.reliability,
      runId: run.runId,
      paperId: paperIdOf,
      quote: primary.quote,
      chunkId: primary.chunkId,
      page: primaryChunk?.page ?? 0,
      embedding: resultVec,
      at,
      by: "agent:adam-methods-hunter",
    }),
  );
  for (const e of proc.object.equipment) {
    const key = nameKey(e.name);
    if (!key) continue;
    let id = (await graph.roQuery<{ id: string }>(INSTRUMENT_BY_KEY, params({ projectId: project.id, nameKey: key }))).data?.[0]?.id;
    if (!id) {
      id = `instrument:${project.id.slice(0, 8)}:${key.replace(/\s+/g, "-").slice(0, 50)}`;
      await graph.query(UPSERT_INSTRUMENT, params({ id, projectId: project.id, name: e.name, nameKey: key, kind: e.kind, at }));
    }
    await graph.query(LINK_PROCEDURE_USES, params({ procedureId, instrumentId: id, by: "agent:adam-methods-hunter", runId: run.runId, at, available: feas.object.equipmentAvailable.includes(e.name) }));
  }
  let prerequisitesLinked = 0;
  for (const pre of proc.object.prerequisites) {
    const key = nameKey(pre);
    if (!key) continue;
    const found = (await graph.roQuery<{ id: string }>(PROCEDURE_BY_METHOD_KEY, params({ projectId: project.id, nameKey: key }))).data?.[0];
    if (found && found.id !== procedureId) {
      await graph.query(LINK_PROCEDURE_DEPENDS, params({ fromId: procedureId, toId: found.id, by: "agent:adam-methods-hunter", runId: run.runId, at }));
      prerequisitesLinked++;
    }
  }

  run.highlight.add(methodId);
  const result: HuntResult = { methodId, procedureId, runnability: check.object.runnability, feasibility: feas.object.feasibility, missing, sources: sources.length, artefacts: artefacts.filter((a) => a.chunks > 0).length, prerequisitesLinked };
  log(`${name}: ${result.runnability}, ${result.feasibility}, ${missing.length} missing, ${sources.length} sources, ${result.artefacts} artefacts`);
  await run.finish("ANSWERED", [result], project.createdBy);
  return result;
}
