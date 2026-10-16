"use client";

import type { ProjectStatus } from "@/lib/adam/status";
import type { AdamEvent, AdamJob } from "@/lib/adam/types";
import { cn } from "@/lib/utils";
import { CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";

const ago = (ms: number | null | undefined) => {
  if (!ms) return "";
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const EVENT_TEXT: Record<string, (p: Record<string, unknown>) => string> = {
  project_created: () => "Project created",
  project_started: (p) => `Loop started in phase ${p.phase}, pass ${p.pass}`,
  project_paused: () => "Paused",
  project_done: () => "Project finished",
  phase_advanced: (p) => `Phase ${p.from} → ${p.to}`,
  phase_unavailable: (p) => `Phase ${p.phase} is not available in this build; paused`,
  gate_pending: (p) => `Waiting for you: ${p.gate} gate`,
  gate_passed: (p) => `Gate ${p.gate} passed`,
  budget_spent: (p) => `Budget rule: ${p.note}`,
  question_page_written: (p) => `Scoper wrote the question page (${p.subquestions} sub-questions${p.ready === false ? ", checker flagged issues" : ""})`,
  question_page_edited: () => "You edited the question page",
  question_page_sent_back: (p) => `Sent the page back to the Scoper${p.note ? `: “${p.note}”` : ""}`,
  job_requested: (p) => `Requested ${p.kind}${p.subject ? ` for ${p.subject}` : ""}${p.created ? "" : " (already queued)"}`,
  job_failed: (p) => `${p.kind} failed: ${p.error}`,
  job_retry: (p) => `${p.kind} will retry: ${p.error}`,
  note: (p) => String(p.note),
};

const describe = (e: AdamEvent) => (EVENT_TEXT[e.kind] ?? ((p) => `${e.kind} ${JSON.stringify(p)}`))(e.payload);

const JobIcon = ({ status }: { status: AdamJob["status"] }) =>
  status === "running" ? (
    <Loader2 className="size-3.5 animate-spin text-sky-600" />
  ) : status === "done" ? (
    <CheckCircle2 className="size-3.5 text-emerald-600" />
  ) : status === "failed" ? (
    <XCircle className="size-3.5 text-red-600" />
  ) : (
    <CircleDashed className="size-3.5 text-muted-foreground" />
  );

/** What the orchestrator and agents did, and the job queue behind it. */
export function ActivityTab({ status }: { status: ProjectStatus }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-lg border bg-white">
        <header className="px-4 py-2.5 border-b text-sm font-medium">Events</header>
        <ol className="divide-y max-h-[60vh] overflow-y-auto">
          {status.events.length === 0 && <li className="px-4 py-6 text-sm text-muted-foreground">Nothing yet. Press Run to start the loop.</li>}
          {status.events.map((e) => (
            <li key={e.id} className="px-4 py-2 text-sm flex gap-3">
              <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-14 pt-0.5">{ago(e.at)}</span>
              <span className={cn(e.kind === "job_failed" && "text-red-700", e.kind === "gate_pending" && "text-amber-700")}>{describe(e)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-lg border bg-white">
        <header className="px-4 py-2.5 border-b text-sm font-medium">Jobs</header>
        <ol className="divide-y max-h-[60vh] overflow-y-auto">
          {status.jobs.recent.length === 0 && <li className="px-4 py-6 text-sm text-muted-foreground">No jobs yet.</li>}
          {status.jobs.recent.map((j) => (
            <li key={j.id} className="px-4 py-2 text-sm flex items-center gap-3">
              <JobIcon status={j.status} />
              <span className="font-mono text-xs">{j.kind}</span>
              {j.subject && <span className="text-muted-foreground truncate max-w-[14rem]">{j.subject}</span>}
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {j.attempts > 1 ? `try ${j.attempts} · ` : ""}
                {ago(j.finishedAt ?? j.lockedAt ?? j.createdAt)}
              </span>
              {j.error && <span className="text-xs text-red-700 truncate max-w-[16rem]" title={j.error}>{j.error}</span>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
