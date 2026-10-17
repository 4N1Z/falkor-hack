// Job: falsify — one round of attacks on one brief, then the Writer's written answers.
// Status after the round: killed (a fatal attack stands), survived (two rounds with nothing
// new open), or attacked (another round is needed).

import { runFalsifier } from "../agents/falsifier";
import { answerAttacks } from "../agents/writer";
import { emit } from "../events";
import { getProject } from "../project";
import { ATTACKS_FOR, SET_BRIEF_STATUS } from "../queries-hypotheses";
import type { JobContext } from "./index";

export const MAX_ATTACK_ROUNDS = 3;

export async function runFalsify(ctx: JobContext) {
  const project = await getProject(ctx.graph, ctx.job.projectId);
  if (!project) throw new Error("project not found");
  const hypothesisId = String(ctx.job.payload.hypothesisId ?? ctx.job.subject ?? "");
  const round = Number(ctx.job.payload.round ?? 1);
  if (!hypothesisId) throw new Error("hypothesisId missing");

  const attacked = await runFalsifier(ctx.graph, ctx.workspaceId, project, hypothesisId, round, { heartbeat: ctx.heartbeat, log: ctx.log });
  await ctx.heartbeat({ step: "answering" });
  const answers = attacked.attacks ? await answerAttacks(ctx.graph, ctx.workspaceId, project, hypothesisId, round) : { answered: 0, open: 0, fatal: 0, revised: false };

  const all = (await ctx.graph.roQuery<{ status: string; round: number }>(ATTACKS_FOR, { params: { id: hypothesisId } as never })).data ?? [];
  const fatal = all.some((a) => a.status === "fatal");
  const openThisRound = all.filter((a) => a.round === round && a.status === "open").length;
  // Convergence (spec stopping rule): a brief survives when a round adds no new open attacks
  const converged = !fatal && (attacked.noNewAttacks || (round >= 2 && openThisRound === 0) || round >= MAX_ATTACK_ROUNDS);
  const status = fatal ? "killed" : converged ? "survived" : "attacked";
  await ctx.graph.query(SET_BRIEF_STATUS, { params: { id: hypothesisId, status, rounds: round, at: Date.now(), killCriteria: null, boundaryFails: null } as never });
  await emit(ctx.graph, project.id, "attack_round", { hypothesisId, round, attacks: attacked.attacks, ...answers, status });
  return { hypothesisId, round, status, attacks: attacked.attacks, ...answers };
}
