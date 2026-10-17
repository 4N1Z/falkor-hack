// adam — shared types for the research-agent system (docs/adam-spec-creation.md).
// Everything here is stored in the workspace's FalkorDB graph; Postgres is not involved.

export const PHASES = ["question", "sweep", "extract", "methods", "connect", "hypothesise", "attack", "experiment", "done"] as const;
/** The research loop's phases, in order (spec: "The research loop"). */
export type Phase = (typeof PHASES)[number];

export const PHASE_LABELS: Record<Phase, string> = {
  question: "Question",
  sweep: "Sweep",
  extract: "Extract",
  methods: "Methods",
  connect: "Connect",
  hypothesise: "Hypothesise",
  attack: "Attack",
  experiment: "Experiment",
  done: "Done",
};

export type ProjectStatus = "idle" | "running" | "paused" | "blocked_on_gate" | "done";

/** Verification state on every adam node (spec: "Verification state on every node"). */
export type NodeState = "extracted" | "agent_verified" | "low_confidence" | "conflict" | "human_approved" | "retracted";
export const NODE_STATES: NodeState[] = ["extracted", "agent_verified", "low_confidence", "conflict", "human_approved", "retracted"];

/** The three mandatory gates plus the experiment-plan approval. */
export type Gate = "scope" | "select" | "kill" | "plan";

export type JobKind =
  | "noop"
  | "orchestrate"
  | "scope"
  | "index_paper"
  | "search_ring"
  | "extract_paper"
  | "verify_card"
  | "hunt_method"
  | "analyze_graph"
  | "write_hypotheses"
  | "falsify"
  | "design_experiment"
  | "saturation"
  | "auto_review";

export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export interface Constraints {
  equipment: string[];
  data: string[];
  skills: string[];
  timeWeeks: number | null;
  budgetUsd: number | null;
}

/** Per-pass budget (spec stopping rule "Budget"). Null = no limit. */
export interface Budget {
  maxPapers: number | null;
  maxLlmCalls: number | null;
}

export interface Spent {
  papers: number;
  llmCalls: number;
}

export interface AdamProject {
  id: string;
  workspaceId: string;
  title: string;
  topic: string;
  understanding: string;
  constraints: Constraints;
  /** Seed papers the researcher trusts / distrusts (graph paperIds) */
  seeds: { paperId: string; label: "trusted" | "distrusted" }[];
  phase: Phase;
  status: ProjectStatus;
  pass: number;
  budget: Budget;
  spent: Spent;
  maxConcurrency: number;
  /** Which gate the project is waiting on, when status is blocked_on_gate */
  gate: Gate | null;
  /** Pass write-ups saved as workspace files */
  papers: { pass: number; fileId: string; title: string; at: number }[];
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface AdamJob {
  id: string;
  projectId: string;
  kind: JobKind;
  subject: string | null;
  dedupeKey: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  priority: number;
  runAfter: number;
  attempts: number;
  maxAttempts: number;
  lockedBy: string | null;
  lockedAt: number | null;
  heartbeatAt: number | null;
  error: string | null;
  result: Record<string, unknown> | null;
  createdAt: number;
  finishedAt: number | null;
  /** The handler's last heartbeat progress, for the UI */
  progress: Record<string, unknown>;
}

export interface AdamEvent {
  id: string;
  projectId: string;
  kind: string;
  payload: Record<string, unknown>;
  at: number;
}

export const EMPTY_CONSTRAINTS: Constraints = { equipment: [], data: [], skills: [], timeWeeks: null, budgetUsd: null };
export const DEFAULT_BUDGET: Budget = { maxPapers: 200, maxLlmCalls: 3000 };

export const parseJson = <T>(s: string | null | undefined, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};
