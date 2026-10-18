import type { ProjectStatus } from "@/lib/adam/status";
import type { Phase } from "@/lib/adam/types";

export type Step = "ask" | "read" | "pick" | "experiment" | "write";

export const STEPS: { id: Step; label: string; blurb: string }[] = [
  { id: "ask", label: "Ask", blurb: "What do you want to find out?" },
  { id: "read", label: "Read", blurb: "Adam reads the literature" },
  { id: "pick", label: "Pick", blurb: "Choose a hypothesis" },
  { id: "experiment", label: "Experiment", blurb: "Run it and record what you see" },
  { id: "write", label: "Write", blurb: "Write it up, go again" },
];

const PHASE_STEP: Record<Phase, Step> = {
  question: "ask",
  sweep: "read",
  extract: "read",
  methods: "read",
  connect: "read",
  hypothesise: "pick",
  attack: "pick",
  experiment: "experiment",
  // "done" means the loop has handed the plan to you: the experiment is still yours to run and record.
  // Write is reached by choice, after a verdict or from the stepper.
  done: "experiment",
};

/** The step the project is at, from its phase. */
export const stepOf = (status: ProjectStatus): Step => PHASE_STEP[status.project.phase] ?? "ask";

export const stepIndex = (s: Step) => STEPS.findIndex((x) => x.id === s);

/** The latest reason the loop paused itself, if the newest state-changing event was a pause. */
export function pauseReason(status: ProjectStatus): string | null {
  for (const e of status.events) {
    if (e.kind === "loop_paused") return String((e.payload as { reason?: string }).reason ?? "");
    if (e.kind === "project_started" || e.kind === "phase_advanced") return null;
  }
  return null;
}

/** Counts the simple view shows, pulled from the status read the page already polls. */
export function counts(status: ProjectStatus) {
  const nodes = (label: string, states?: string[]) => status.nodes.filter((n) => n.label === label && (!states || states.includes(n.state))).reduce((s, n) => s + n.n, 0);
  return {
    papers: status.triage.reduce((s, t) => s + t.n, 0),
    fullText: status.triage.reduce((s, t) => s + t.fullText, 0),
    claims: nodes("Claim", ["agent_verified", "human_approved"]),
    claimsAll: nodes("Claim"),
    methods: nodes("Method"),
    procedures: nodes("Procedure"),
    assumptions: nodes("Assumption"),
    candidates: nodes("Candidate"),
    briefs: nodes("Hypothesis"),
    running: status.jobs.byStatus.running ?? 0,
    queued: status.jobs.byStatus.queued ?? 0,
  };
}

export const post = async <T,>(url: string, body: Record<string, unknown>, method = "POST"): Promise<T> => {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((b as { error?: string }).error ?? "Request failed");
  return b as T;
};
