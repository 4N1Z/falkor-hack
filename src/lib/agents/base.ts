// Shared scaffolding for the specialist agents.
// Every agent: has one job, runs a fixed set of parameterised graph queries (never free-form
// Cypher), records an AgentRun trace in the workspace graph, and returns the same result
// shape with the provenance (paths + Cypher) behind each item. Anything an agent writes is a
// proposal (status 'suggested') until a person accepts it.

import { randomUUID } from "crypto";
import type { Graph } from "falkordb";
import { getWorkspaceGraph } from "../graph/client";
import type { JevSource } from "../jev";
import { ACCEPT_PROPOSAL, RECORD_AGENT_RUN, REJECT_PROPOSAL } from "../graph/queries";

export type AgentName =
  | "librarian"
  | "cite-scout"
  | "citation-checker"
  | "next-steps"
  | "ghost-writer"
  | "historian"
  | "synthesis"
  | "scout-watcher"
  | "router";

export type Outcome =
  /** Answered from graph paths */
  | "ANSWERED"
  /** Answered from recorded findings / hypotheses */
  | "FROM_MEMORY"
  /** The graph has nothing on this — reported honestly rather than guessed */
  | "NOT_IN_GRAPH"
  /** A JEV/LLM gate decided there was nothing to do (e.g. sentence needs no citation) */
  | "SKIPPED";

/** One step of explanation: a chain of graph nodes, e.g. paper → cites → paper. */
export interface ProvenancePath {
  nodes: { id: string; label: string; kind: "Paper" | "User" | "Claim" | "Concept" | "Author" | "Hypothesis" }[];
  /** Relationship types between consecutive nodes */
  rels: string[];
}

export interface TraceStep {
  tool: string;
  args?: Record<string, unknown>;
  cypher?: string;
  rows?: number;
  ms: number;
  source?: JevSource | "graph" | "llm";
}

export interface AgentResult<T> {
  runId: string;
  agent: AgentName;
  outcome: Outcome;
  items: T[];
  trace: TraceStep[];
  ms: number;
}

/** Collects the trace while an agent runs, then persists it as an AgentRun node. */
export class AgentRunRecorder {
  readonly runId = randomUUID();
  readonly trace: TraceStep[] = [];
  private readonly started = Date.now();

  constructor(
    readonly agent: AgentName,
    readonly workspaceId: string,
    readonly graph: Graph,
    readonly input: Record<string, unknown>,
  ) {}

  /** Time a step and record it. `rows` is read from the result when it is an array. */
  async step<R>(tool: string, fn: () => Promise<R>, meta: Omit<TraceStep, "tool" | "ms" | "rows"> = {}): Promise<R> {
    const t0 = Date.now();
    const result = await fn();
    this.trace.push({
      tool,
      ...meta,
      rows: Array.isArray(result) ? result.length : undefined,
      ms: Date.now() - t0,
    });
    return result;
  }

  /** Persist the run (best effort; a trace write must never fail the agent). */
  /** Node ids this run touched (papers, provenance paths), for highlighting on the graph page. */
  readonly highlight = new Set<string>();

  async finish<T>(outcome: Outcome, items: T[], userId?: string): Promise<AgentResult<T>> {
    const ms = Date.now() - this.started;
    try {
      await this.graph.query(RECORD_AGENT_RUN, {
        params: {
          id: this.runId,
          agent: this.agent,
          at: Date.now(),
          ms,
          outcome,
          userId: userId ?? null,
          input: JSON.stringify(this.input).slice(0, 2000),
          trace: JSON.stringify(this.trace).slice(0, 8000),
          items: items.length,
          highlight: [...this.highlight].slice(0, 60),
        } as never,
      });
    } catch (err) {
      console.error(`[agents] failed to record ${this.agent} run`, err);
    }
    return { runId: this.runId, agent: this.agent, outcome, items, trace: this.trace, ms };
  }
}

export async function startRun(agent: AgentName, workspaceId: string, input: Record<string, unknown>) {
  const graph = await getWorkspaceGraph(workspaceId);
  return new AgentRunRecorder(agent, workspaceId, graph, input);
}

/** Agent-written relationships carry these properties until a person decides. */
export const proposalProps = (agent: AgentName, runId: string) => ({
  status: "suggested" as const,
  by: `agent:${agent}`,
  runId,
  at: Date.now(),
});

/**
 * Accept or reject a proposal: any relationship an agent created, identified by the run
 * that proposed it plus its endpoints. Accepting records who decided and when.
 */
export async function decideProposal(input: {
  workspaceId: string;
  runId: string;
  fromId: string;
  toId: string;
  decision: "accepted" | "rejected";
  userId: string;
}) {
  const graph = await getWorkspaceGraph(input.workspaceId);
  const query = input.decision === "accepted" ? ACCEPT_PROPOSAL : REJECT_PROPOSAL;
  const res = await graph.query<{ n: number }>(query, {
    params: { runId: input.runId, fromId: input.fromId, toId: input.toId, userId: input.userId, at: Date.now() } as never,
  });
  return (res.data?.[0]?.n ?? 0) > 0;
}
