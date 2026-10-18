"use client";

import { Button } from "@/components/ui/button";
import type { ProjectStatus } from "@/lib/adam/status";
import { PHASES } from "@/lib/adam/types";
import { startAdamProject } from "@/lib/hooks/use-adam";
import { cn } from "@/lib/utils";
import { Check, Loader2, Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { counts, pauseReason } from "./steps";

/**
 * Step 2 · Read. One progress line for the four automatic phases, the numbers that matter, and
 * the only two things that can need a person here: a pause with its reason, and the items the
 * agents could not settle (the queue, folded away under the stepper).
 */
export function ReadStep({ workspaceId, status, onNext }: { workspaceId: string; status: ProjectStatus; onNext: () => void }) {
  const project = status.project;
  const c = counts(status);
  const [busy, setBusy] = useState(false);
  const phaseIdx = PHASES.indexOf(project.phase);
  const stages: { phase: (typeof PHASES)[number]; title: string; detail: string }[] = [
    { phase: "sweep", title: "Finding papers", detail: c.papers ? `${c.papers} found · ${c.fullText} read in full` : "searching OpenAlex in three rings" },
    { phase: "extract", title: "Reading and checking", detail: c.claimsAll ? `${c.claims} of ${c.claimsAll} claims verified · ${c.assumptions} assumptions` : "two readers per paper, every claim checked against its passage" },
    { phase: "methods", title: "Working out the methods", detail: c.methods ? `${c.methods} methods · ${c.procedures} procedures written up` : "how each result was produced, and whether you could repeat it" },
    { phase: "connect", title: "Looking for gaps", detail: c.candidates ? `${c.candidates} candidate holes, conflicts and untested assumptions` : "where the literature disagrees or has never connected two things" },
  ];
  const paused = project.status === "paused" ? pauseReason(status) : null;
  const applied = status.events.find((e) => e.kind === "auto_review_applied")?.payload as { approved?: number; rejected?: number; leftToPerson?: number; unsure?: number } | undefined;
  const readingDone = phaseIdx > PHASES.indexOf("connect");

  const resume = async () => {
    setBusy(true);
    try {
      await startAdamProject(workspaceId, project.id);
      toast.success("Resumed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't resume");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {project.status === "blocked_on_gate" && project.gate === "scope" && (
        <Notice tone="amber">Adam is waiting for you to approve the scope in the Ask step.</Notice>
      )}
      {paused !== null && (
        <Notice tone="amber">
          <span className="flex-1">Paused: {paused || "stopped by you"}</span>
          <Button size="sm" onClick={resume} disabled={busy}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}<span className="ml-1.5">Resume</span></Button>
        </Notice>
      )}
      {project.status === "idle" && !paused && (
        <Notice tone="slate">
          <span className="flex-1">Not running yet.</span>
          <Button size="sm" onClick={resume} disabled={busy}><Play className="size-3.5" /><span className="ml-1.5">Start</span></Button>
        </Notice>
      )}

      <ol className="rounded-lg border bg-white divide-y">
        {stages.map((s) => {
          const i = PHASES.indexOf(s.phase);
          const state = i < phaseIdx ? "done" : i === phaseIdx ? "active" : "todo";
          return (
            <li key={s.phase} className={cn("flex items-start gap-3 p-4", state === "todo" && "opacity-50")}>
              <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs", state === "done" ? "bg-emerald-100 text-emerald-700" : state === "active" ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>
                {state === "done" ? <Check className="size-3.5" /> : state === "active" && project.status === "running" ? <Loader2 className="size-3.5 animate-spin" /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">{s.title}</p>
                <p className="text-sm text-muted-foreground">{s.detail}</p>
              </div>
              {state === "active" && (c.running || c.queued) ? <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{c.running} running · {c.queued} queued</span> : null}
            </li>
          );
        })}
      </ol>

      {applied && (
        <p className="text-sm text-muted-foreground">
          Adam reviewed the uncertain items itself: approved {applied.approved ?? 0}, rejected {applied.rejected ?? 0}.
          {status.queueOpen > 0 ? ` ${status.queueOpen} it could not call are waiting for you under "Things I wasn't sure about".` : " Nothing is waiting for you."}
        </p>
      )}

      {readingDone && (
        <div className="flex items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1 text-emerald-700"><Check className="size-4" /> Reading done: {c.papers} papers, {c.claims} verified claims, {c.methods} methods.</span>
          <Button size="sm" onClick={onNext}>Pick a hypothesis</Button>
        </div>
      )}
    </div>
  );
}

function Notice({ tone, children }: { tone: "amber" | "slate"; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-lg border p-3 text-sm flex items-center gap-3", tone === "amber" ? "border-amber-200 bg-amber-50/70 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-800")}>{children}</div>
  );
}
