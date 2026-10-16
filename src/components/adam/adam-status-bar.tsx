"use client";

import type { ProjectStatus } from "@/lib/adam/status";
import { PHASES, PHASE_LABELS, type Phase } from "@/lib/adam/types";
import { pauseAdamProject, startAdamProject } from "@/lib/hooks/use-adam";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Loader2, Pause, Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const STATUS_LABEL: Record<string, string> = {
  idle: "Not started",
  running: "Running",
  paused: "Paused",
  blocked_on_gate: "Waiting for you",
  done: "Done",
};

const GATE_LABEL: Record<string, string> = {
  scope: "Approve the question page",
  select: "Select hypotheses to pursue",
  kill: "Sign the kill criteria",
  plan: "Approve the experiment plan",
};

/** Phase stepper, loop status, counts, and the Run / Pause control. */
export function AdamStatusBar({ workspaceId, status }: { workspaceId: string; status: ProjectStatus }) {
  const [busy, setBusy] = useState(false);
  const { project } = status;
  const running = status.jobs.byStatus.running ?? 0;
  const queued = status.jobs.byStatus.queued ?? 0;
  const failed = status.jobs.byStatus.failed ?? 0;
  const nodes = status.nodes.reduce((s, n) => s + n.n, 0);
  const verified = status.nodes.filter((n) => n.state === "agent_verified" || n.state === "human_approved").reduce((s, n) => s + n.n, 0);
  const papers = status.triage.reduce((s, t) => s + t.n, 0);

  const toggle = async () => {
    setBusy(true);
    try {
      if (project.status === "running") {
        await pauseAdamProject(workspaceId, project.id);
        toast("Paused", { description: "Queued work waits; running jobs finish." });
      } else {
        await startAdamProject(workspaceId, project.id);
        toast.success("Running", { description: "The orchestrator decides who runs next from the graph." });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change the project state");
    } finally {
      setBusy(false);
    }
  };

  const idx = PHASES.indexOf(project.phase);
  return (
    <div className="rounded-lg border bg-white p-3 flex flex-col gap-3">
      <ol className="flex items-center gap-1 overflow-x-auto">
        {PHASES.map((p: Phase, i) => (
          <li key={p} className="flex items-center gap-1 shrink-0">
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide",
                i < idx && "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20",
                i === idx && "bg-primary text-primary-foreground",
                i > idx && "bg-muted text-muted-foreground",
              )}
            >
              {PHASE_LABELS[p]}
            </span>
            {i < PHASES.length - 1 && <span className="text-muted-foreground/40 text-xs">›</span>}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-block size-2 rounded-full",
              project.status === "running" && "bg-emerald-500 animate-pulse",
              project.status === "blocked_on_gate" && "bg-amber-500",
              project.status === "paused" && "bg-slate-400",
              project.status === "idle" && "bg-slate-300",
              project.status === "done" && "bg-sky-500",
            )}
          />
          <span className="font-medium">{STATUS_LABEL[project.status] ?? project.status}</span>
          {project.status === "blocked_on_gate" && project.gate && (
            <span className="text-amber-700">· {GATE_LABEL[project.gate] ?? project.gate}</span>
          )}
          <span className="text-muted-foreground">· pass {project.pass}</span>
        </div>

        <Stat label="papers" value={papers} />
        <Stat label="nodes" value={nodes} hint={`${verified} verified`} />
        <Stat label="to review" value={status.queueOpen} tone={status.queueOpen ? "amber" : undefined} />
        <Stat label="jobs" value={`${running} running · ${queued} queued`} hint={failed ? `${failed} failed` : undefined} tone={failed ? "red" : undefined} />
        <Stat label="LLM calls" value={project.spent.llmCalls} hint={project.budget.maxLlmCalls ? `of ${project.budget.maxLlmCalls}` : undefined} />

        <div className="ml-auto">
          <Button size="sm" variant={project.status === "running" ? "outline" : "default"} onClick={toggle} disabled={busy || project.status === "done"}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : project.status === "running" ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            <span className="ml-1.5">{project.status === "running" ? "Pause" : project.status === "idle" ? "Run" : "Resume"}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: number | string; hint?: string; tone?: "amber" | "red" }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={cn("font-semibold tabular-nums", tone === "amber" && "text-amber-700", tone === "red" && "text-red-700")}>{value}</span>
      <span className="text-muted-foreground">{label}</span>
      {hint && <span className="text-xs text-muted-foreground/80">{hint}</span>}
    </div>
  );
}
