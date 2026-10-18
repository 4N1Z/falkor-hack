"use client";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { ProjectStatus } from "@/lib/adam/status";
import { pauseAdamProject, startAdamProject } from "@/lib/hooks/use-adam";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, ChevronRight, Loader2, Pause, Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { QueueTab } from "../queue-tab";
import { AskStep } from "./ask-step";
import { ExperimentStep } from "./experiment-step";
import { PickStep } from "./pick-step";
import { ReadStep } from "./read-step";
import { STEPS, stepIndex, stepOf, type Step } from "./steps";
import { WriteStep } from "./write-step";

/**
 * The simple Adam: five steps, one thing to do at each. The loop underneath is unchanged; this
 * view only shows the decisions and the progress. The advanced view (every tab) is a switch away.
 */
export function SimpleWorkbench({ workspaceId, status }: { workspaceId: string; status: ProjectStatus }) {
  const project = status.project;
  const current = stepOf(status);
  const [viewing, setViewing] = useState<Step>(current);
  const [followed, setFollowed] = useState(current);
  const [busy, setBusy] = useState(false);
  // Follow the project as it moves on, unless the person has clicked back to look at something
  if (current !== followed) {
    setFollowed(current);
    setViewing(current);
  }

  const toggleRun = async () => {
    setBusy(true);
    try {
      if (project.status === "running") await pauseAdamProject(workspaceId, project.id);
      else await startAdamProject(workspaceId, project.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change the state");
    } finally {
      setBusy(false);
    }
  };

  const waiting = project.status === "blocked_on_gate" ? (project.gate === "scope" ? "ask" : project.gate === "plan" ? "experiment" : "pick") : null;
  const next = (s: Step) => setViewing(s);

  return (
    <div className="flex flex-col gap-5">
      <nav className="rounded-lg border bg-white px-2 py-2 flex items-center gap-1 overflow-x-auto">
        {STEPS.map((s, i) => {
          const idx = stepIndex(current);
          const state = i < idx ? "done" : i === idx ? "active" : "todo";
          return (
            <button
              key={s.id}
              onClick={() => setViewing(s.id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors whitespace-nowrap",
                viewing === s.id ? "bg-foreground text-background" : "hover:bg-accent",
                state === "todo" && viewing !== s.id && "text-muted-foreground",
              )}
            >
              <span className={cn("flex size-5 items-center justify-center rounded-full text-[11px] tabular-nums", viewing === s.id ? "bg-background/20" : state === "done" ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground")}>
                {state === "done" ? <Check className="size-3" /> : i + 1}
              </span>
              {s.label}
              {waiting === s.id && <span className="size-1.5 rounded-full bg-amber-500" />}
              {state === "active" && project.status === "running" && <Loader2 className="size-3 animate-spin opacity-70" />}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2 pl-2 text-xs text-muted-foreground whitespace-nowrap">
          <span>pass {project.pass}</span>
          <span>·</span>
          <span>{project.status === "running" ? "running" : project.status === "blocked_on_gate" ? "waiting for you" : project.status === "paused" ? "paused" : project.status}</span>
          {(project.status === "running" || project.status === "paused" || project.status === "idle") && (
            <Button size="sm" variant="ghost" className="h-7" onClick={toggleRun} disabled={busy}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : project.status === "running" ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              <span className="ml-1">{project.status === "running" ? "Pause" : project.status === "idle" ? "Start" : "Resume"}</span>
            </Button>
          )}
        </div>
      </nav>

      <div>
        <p className="text-xs text-muted-foreground mb-2">{STEPS.find((s) => s.id === viewing)?.blurb}</p>
        {viewing === "ask" && <AskStep workspaceId={workspaceId} status={status} onNext={() => next("read")} />}
        {viewing === "read" && <ReadStep workspaceId={workspaceId} status={status} onNext={() => next("pick")} />}
        {viewing === "pick" && <PickStep workspaceId={workspaceId} status={status} onNext={() => next("experiment")} />}
        {viewing === "experiment" && <ExperimentStep workspaceId={workspaceId} status={status} onGoTo={(s) => next(s)} />}
        {viewing === "write" && <WriteStep workspaceId={workspaceId} status={status} onRestart={() => next("ask")} />}
      </div>

      <UnsureQueue workspaceId={workspaceId} status={status} />
    </div>
  );
}

/** The exception queue, folded away: it never blocks a step, so it never leads. */
function UnsureQueue({ workspaceId, status }: { workspaceId: string; status: ProjectStatus }) {
  const [open, setOpen] = useState(false);
  const n = status.queueOpen;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border bg-white">
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center gap-2 px-4 py-3 text-sm text-left">
          {open ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
          <span className="font-medium">Things Adam wasn&apos;t sure about</span>
          <span className={cn("rounded-full px-2 py-0.5 text-xs tabular-nums", n ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground")}>{n}</span>
          <span className="text-xs text-muted-foreground ml-2">{n ? "Claims it could not verify on its own. Optional: the loop does not wait for these." : "Nothing waiting. Everything it extracted was checked against its source or decided already."}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t p-3">{open && <QueueTab workspaceId={workspaceId} status={status} />}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
