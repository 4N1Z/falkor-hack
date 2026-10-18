// Research projects: one (:AdamProject) per research question, several per workspace graph.
// The project node is the anchor every adam node points at via projectId, and it carries the
// loop's state (phase, status, pass, budget) the orchestrator reads on every tick.

import { ADAM_QUERY_TIMEOUT_MS } from "./types";
import { randomUUID } from "crypto";
import type { Graph } from "falkordb";
import { getWorkspaceGraph } from "../graph/client";
import { emit } from "./events";
import {
  CREATE_PROJECT,
  DELETE_PROJECT,
  DELETE_PROJECT_NODES,
  GET_PROJECT,
  INCREMENT_SPENT,
  LIST_PROJECTS,
  RESET_SPENT,
  SET_PROJECT_STATE,
  UPDATE_PROJECT,
} from "./queries";
import {
  DEFAULT_BUDGET,
  EMPTY_CONSTRAINTS,
  parseJson,
  type AdamProject,
  type Budget,
  type Constraints,
  type Gate,
  type Phase,
  type ProjectStatus,
} from "./types";

type Row = Omit<AdamProject, "constraints" | "seeds" | "budget" | "spent" | "papers"> & {
  constraints: string;
  seeds: string;
  budget: string;
  papers: string;
  spentPapers: number;
  spentLlmCalls: number;
};

const toProject = (r: Row): AdamProject => ({
  ...r,
  constraints: { ...EMPTY_CONSTRAINTS, ...parseJson<Partial<Constraints>>(r.constraints, {}) },
  seeds: parseJson(r.seeds, []),
  papers: parseJson(r.papers, []),
  budget: { ...DEFAULT_BUDGET, ...parseJson<Partial<Budget>>(r.budget, {}) },
  spent: { papers: r.spentPapers ?? 0, llmCalls: r.spentLlmCalls ?? 0 },
});

const params = <T>(p: T) => ({ params: p as never, TIMEOUT: ADAM_QUERY_TIMEOUT_MS });

export async function createProject(input: {
  workspaceId: string;
  userId: string;
  title: string;
  topic?: string;
  understanding?: string;
  constraints?: Partial<Constraints>;
  seeds?: AdamProject["seeds"];
}): Promise<AdamProject> {
  const graph = await getWorkspaceGraph(input.workspaceId);
  const at = Date.now();
  const res = await graph.query<Row>(
    CREATE_PROJECT,
    params({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      userId: input.userId,
      title: input.title.trim().slice(0, 200),
      topic: (input.topic ?? "").trim().slice(0, 4000),
      understanding: (input.understanding ?? "").trim().slice(0, 8000),
      constraints: JSON.stringify({ ...EMPTY_CONSTRAINTS, ...(input.constraints ?? {}) }),
      seeds: JSON.stringify(input.seeds ?? []),
      budget: JSON.stringify(DEFAULT_BUDGET),
      at,
    }),
  );
  const project = toProject(res.data![0]);
  await emit(graph, project.id, "project_created", { title: project.title });
  return project;
}

export async function listProjects(workspaceId: string): Promise<AdamProject[]> {
  const graph = await getWorkspaceGraph(workspaceId);
  return ((await graph.roQuery<Row>(LIST_PROJECTS, params({ workspaceId }))).data ?? []).map(toProject);
}

export async function getProject(graph: Graph, id: string): Promise<AdamProject | null> {
  const row = (await graph.roQuery<Row>(GET_PROJECT, params({ id }))).data?.[0];
  return row ? toProject(row) : null;
}

export async function updateProject(
  graph: Graph,
  id: string,
  patch: Partial<Pick<AdamProject, "title" | "topic" | "understanding" | "constraints" | "seeds" | "budget" | "maxConcurrency">>,
): Promise<AdamProject | null> {
  const row = (
    await graph.query<Row>(
      UPDATE_PROJECT,
      params({
        id,
        title: patch.title?.trim().slice(0, 200) ?? null,
        topic: patch.topic?.trim().slice(0, 4000) ?? null,
        understanding: patch.understanding?.trim().slice(0, 8000) ?? null,
        constraints: patch.constraints ? JSON.stringify({ ...EMPTY_CONSTRAINTS, ...patch.constraints }) : null,
        seeds: patch.seeds ? JSON.stringify(patch.seeds) : null,
        budget: patch.budget ? JSON.stringify(patch.budget) : null,
        maxConcurrency: patch.maxConcurrency ?? null,
        at: Date.now(),
      }),
    )
  ).data?.[0];
  return row ? toProject(row) : null;
}

/** Orchestrator and gate transitions. Null fields keep their value; `clearGate` removes the pending gate. */
export async function setProjectState(
  graph: Graph,
  id: string,
  state: { status?: ProjectStatus; phase?: Phase; gate?: Gate | null; clearGate?: boolean; pass?: number },
): Promise<AdamProject | null> {
  const row = (
    await graph.query<Row>(
      SET_PROJECT_STATE,
      params({
        id,
        status: state.status ?? null,
        phase: state.phase ?? null,
        gate: state.gate ?? null,
        clearGate: !!state.clearGate,
        pass: state.pass ?? null,
        at: Date.now(),
      }),
    )
  ).data?.[0];
  return row ? toProject(row) : null;
}

/** Count work against the per-pass budget (spec stopping rule "Budget"). Atomic in the graph. */
export async function spend(graph: Graph, projectId: string, delta: { papers?: number; llmCalls?: number }) {
  await graph
    .query(INCREMENT_SPENT, params({ id: projectId, papers: delta.papers ?? 0, llmCalls: delta.llmCalls ?? 0 }))
    .catch((err) => console.error("[adam] could not record spend", err));
}

export async function resetSpent(graph: Graph, projectId: string) {
  await graph.query(RESET_SPENT, params({ id: projectId }));
}

/** Remove a project and everything it owns (two statements: FalkorDB dislikes mixed deletes). */
export async function deleteProject(graph: Graph, id: string) {
  await graph.query(DELETE_PROJECT_NODES, params({ id }));
  await graph.query(DELETE_PROJECT, params({ id }));
}
