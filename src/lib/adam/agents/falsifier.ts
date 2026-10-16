// Falsifier — the only adversarial checker (spec, "The Falsifier's full brief"). It sees the
// brief and the graph, never the Writer's reasoning, or it would tend to agree. Six attacks:
//   1. pre-mortem        assume rejection; the reviewer's three strongest objections
//   2. dependency        walk DEPENDS_ON from the evidence; the assumption with the least
//                        evidence; the cheapest test of it alone
//   3. rival             for each prediction, everything else that could produce it, and
//                        the control that tells them apart (rival chains from the graph
//                        are added by the hypothesis-as-query, Phase J)
//   4. null & ablation   what happens with nothing, and with each component removed
//   5. baseline          which prior result it builds on, and whether anyone outside the
//                        original group reproduced it (from the graph: claims in other papers)
//   6. boundary          where it should stop holding; no failure condition = not falsifiable
// Attacks that must rest on the graph (dependency, baseline) cite node ids or are dropped.

import type { Graph } from "falkordb";
import { z } from "zod";
import { startRun } from "../../agents/base";
import { clip, structured } from "../llm";
import type { AdamProject } from "../types";
import { ATTACKS_FOR, BRIEF_DEPENDENCIES, BRIEF_EVIDENCE, BRIEF_SUPPORTS, CLAIM_VECTOR, CREATE_ATTACKS, GET_BRIEF, LINK_ATTACK_CITES, REPRODUCTIONS_OF } from "../queries-hypotheses";

export const ATTACK_KINDS = ["premortem", "dependency", "rival", "null_ablation", "baseline", "boundary"] as const;
export type AttackKind = (typeof ATTACK_KINDS)[number];

const AttackSchema = z.object({
  kind: z.enum(ATTACK_KINDS),
  text: z.string().describe("The attack, concretely: what is wrong or untested and why it matters"),
  cites: z.array(z.string()).describe("Ids of claims / assumptions / methods from the material this attack rests on (required for dependency and baseline attacks)"),
  control: z.string().nullable().describe("For rival attacks: the control that would tell the rival from the hypothesis"),
  killCriterion: z.string().nullable().describe("A sharper kill criterion this attack implies, if any"),
});
const AttacksSchema = z.object({
  attacks: z.array(AttackSchema).min(3).max(14),
  noNewAttacks: z.boolean().describe("true only when, after the previous rounds, you genuinely have nothing new to add"),
});

const SYSTEM = `You are the Falsifier in a research-agent system. Your job is to kill hypotheses that deserve to die and to sharpen the ones that survive. You see a brief and material from the literature graph, never the writer's reasoning. Make every attack specific and actionable: name the assumption, the confound, the missing control, the unreproduced result. Do not pad: an attack that is really "I disagree" is noise. Cover the six kinds: premortem (three strongest reviewer objections), dependency (the weakest assumption and the cheapest test of it alone), rival (other explanations for each predicted result, each with the control that separates it), null_ablation (what happens with nothing, and with each component removed), baseline (which prior result it builds on and whether anyone else reproduced it; if not, replication is the first experiment), boundary (where it should stop holding; if the brief names no failure condition, say it is not falsifiable yet).`;

const params = <T>(p: T) => ({ params: p as never });

export interface FalsifyResult {
  hypothesisId: string;
  round: number;
  attacks: number;
  dropped: number;
  noNewAttacks: boolean;
}

export async function runFalsifier(
  graph: Graph,
  workspaceId: string,
  project: AdamProject,
  hypothesisId: string,
  round: number,
  opts: { heartbeat?: (p: Record<string, unknown>) => Promise<void>; log?: (m: string) => void } = {},
): Promise<FalsifyResult> {
  const run = await startRun("adam-falsifier", workspaceId, { projectId: project.id, hypothesisId, round });
  const beat = opts.heartbeat ?? (async () => {});
  const log = opts.log ?? (() => {});
  const pid = project.id;

  const brief = (await graph.roQuery<{ statement: string; mechanism: string; boundaryHolds: string[]; boundaryFails: string[]; killCriteria: string; predictionIfTrue: string; predictionIfFalse: string; procedureHint: string }>(GET_BRIEF, params({ id: hypothesisId }))).data?.[0];
  if (!brief) throw new Error("brief not found");
  const [evidence, supports, deps, previous] = await Promise.all([
    graph.roQuery<{ type: string; id: string; text: string; paper: string; year: number; section: string; conditions: string[]; speculative: boolean }>(BRIEF_EVIDENCE, params({ id: hypothesisId })).then((r) => r.data ?? []),
    graph.roQuery<{ type: string; label: string; id: string; text: string; dependents: number; loadBearing: boolean }>(BRIEF_SUPPORTS, params({ id: hypothesisId })).then((r) => r.data ?? []),
    graph.roQuery<{ id: string; text: string; claims: number; evidence: number; stated: boolean }>(BRIEF_DEPENDENCIES, params({ id: hypothesisId })).then((r) => r.data ?? []),
    graph.roQuery<{ id: string; kind: string; text: string; answer: string; status: string; round: number }>(ATTACKS_FOR, params({ id: hypothesisId })).then((r) => r.data ?? []),
  ]);

  // Baseline replication material: for the strongest supporting claims, who else found the same?
  const forClaims = evidence.filter((e) => e.type === "EVIDENCE_FOR").slice(0, 4);
  const reproductions: string[] = [];
  for (const c of forClaims) {
    const vec = (await graph.roQuery<{ embedding: number[] | null; paperId: string }>(CLAIM_VECTOR, params({ id: c.id }))).data?.[0];
    if (!vec?.embedding) continue;
    const near = (await graph.roQuery<{ id: string; text: string; paper: string; year: number; score: number }>(REPRODUCTIONS_OF, params({ projectId: pid, paperId: vec.paperId, k: 4, v: vec.embedding, maxDistance: 0.2 })).catch(() => ({ data: [] }))).data ?? [];
    reproductions.push(`- [${c.id}] "${clip(c.text, 140)}" (${c.paper.slice(0, 40)}): ${near.length ? near.map((n) => `reproduced-ish by [${n.id}] ${n.paper.slice(0, 40)} ${n.year || ""}`).join("; ") : "no other paper in the graph reports the same result"}`);
  }

  const allowed = new Set([...evidence.map((e) => e.id), ...supports.map((s) => s.id), ...deps.map((d) => d.id)]);
  const material = [
    `Brief\nStatement: ${brief.statement}\nMechanism: ${brief.mechanism}\nHolds under: ${brief.boundaryHolds.join("; ")}\nFails under: ${brief.boundaryFails.join("; ") || "(none stated)"}\nPrediction: if true, ${brief.predictionIfTrue}; if false, ${brief.predictionIfFalse}\nDistinguishing method: ${brief.procedureHint}\nKill criteria: ${brief.killCriteria}`,
    `Evidence for\n${evidence.filter((e) => e.type === "EVIDENCE_FOR").map((e) => `- [${e.id}] ${clip(e.text, 220)} — ${e.paper.slice(0, 50)} ${e.year || ""} · ${e.section}${e.speculative ? " · speculative" : ""}${e.conditions.length ? ` · conditions: ${e.conditions.slice(0, 3).join("; ")}` : ""}`).join("\n") || "(none)"}`,
    `Evidence against\n${evidence.filter((e) => e.type === "EVIDENCE_AGAINST").map((e) => `- [${e.id}] ${clip(e.text, 220)} — ${e.paper.slice(0, 50)} ${e.year || ""}`).join("\n") || "(none cited by the writer)"}`,
    `Assumptions the evidence depends on (fewest supporting evidence first)\n${deps.map((d) => `- [${d.id}] ${clip(d.text, 200)} · ${d.claims} claims depend · ${d.evidence} evidence items${d.stated ? "" : " · unstated"}`).join("\n") || "(none recorded)"}`,
    `Methods and assumptions the brief rests on\n${supports.map((s) => `- [${s.id}] (${s.label}) ${clip(s.text, 160)}${s.loadBearing ? " · load-bearing" : ""}`).join("\n") || "(none)"}`,
    `Baseline replication\n${reproductions.join("\n") || "(no supporting claims to check)"}`,
    previous.length ? `Previous rounds\n${previous.map((a) => `- round ${a.round} (${a.kind}, ${a.status}) ${clip(a.text, 200)}${a.answer ? `\n  answer: ${clip(a.answer, 240)}` : ""}`).join("\n")}\n\nThis is round ${round}: raise only NEW attacks, or attacks the answers did not meet. If nothing new stands, set noNewAttacks to true and give at most three attacks restating what remains open.` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const out = await run.step(
    "llm.falsify",
    () => structured({ graph, projectId: pid, schema: AttacksSchema, system: SYSTEM, prompt: material, tier: "heavy", maxTokens: 8000, label: `falsify:${hypothesisId}:${round}` }),
    { source: "llm" },
  );
  await beat({ step: "attacked", n: out.object.attacks.length });

  const at = Date.now();
  let dropped = 0;
  const rows = out.object.attacks
    .map((a, i) => {
      const cites = a.cites.filter((c) => allowed.has(c));
      if ((a.kind === "dependency" || a.kind === "baseline") && cites.length === 0) {
        dropped++;
        return null;
      }
      return { id: `attack:${hypothesisId.split(":").slice(1).join(":")}:r${round}:${i + 1}`, kind: a.kind, text: a.text, cites, control: a.control ?? "", killCriterion: a.killCriterion ?? "" };
    })
    .filter((r): r is NonNullable<typeof r> => !!r);
  if (!out.object.noNewAttacks || rows.length) {
    if (rows.length) {
      await graph.query(CREATE_ATTACKS, params({ hypothesisId, projectId: pid, rows, round, runId: run.runId, at }));
      const citeRows = rows.flatMap((r) => r.cites.map((nodeId) => ({ attackId: r.id, nodeId })));
      if (citeRows.length) await graph.query(LINK_ATTACK_CITES, params({ rows: citeRows }));
    }
  }
  const result: FalsifyResult = { hypothesisId, round, attacks: rows.length, dropped, noNewAttacks: out.object.noNewAttacks };
  log(`round ${round}: ${rows.length} attacks (${dropped} dropped for lacking citations)${out.object.noNewAttacks ? ", nothing new" : ""}`);
  await run.finish("ANSWERED", [result], project.createdBy);
  return result;
}
