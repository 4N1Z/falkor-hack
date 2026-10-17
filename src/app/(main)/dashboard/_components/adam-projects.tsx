"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PHASES, PHASE_LABELS, type AdamProject } from "@/lib/adam/types";
import { useAdamProjects } from "@/lib/hooks/use-adam";
import { cn } from "@/lib/utils";
import { ArrowUpRight, FlaskConical } from "lucide-react";
import Link from "next/link";

const STATUS: Record<AdamProject["status"], { label: string; tone: string }> = {
  idle: { label: "Not started", tone: "bg-slate-300" },
  running: { label: "Running", tone: "bg-emerald-500 animate-pulse" },
  paused: { label: "Paused", tone: "bg-slate-400" },
  blocked_on_gate: { label: "Waiting for you", tone: "bg-amber-500" },
  done: { label: "Done", tone: "bg-sky-500" },
};
const GATE: Record<string, string> = { scope: "approve the question page", select: "select hypotheses", kill: "sign kill criteria", plan: "approve the experiment plan" };

/** Dashboard section for Adam: every research project, where its loop is, and what it is waiting on. */
export default function AdamProjects({ workspaceId }: { workspaceId: string }) {
  const { projects } = useAdamProjects(workspaceId);
  const href = `/dashboard/${workspaceId}/adam`;

  return (
    <Card className="border-accent shadow-none">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <span className="rounded-sm bg-black p-1.5 text-amber-300"><FlaskConical size={14} strokeWidth={2.25} /></span>
            Adam
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A graph of known steps from the literature, every one traced to a page in a source, and the chain of steps that would test a hypothesis. You decide the question, which hypotheses are worth the lab&apos;s time, and what result would kill each one.
          </p>
        </div>
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-transform duration-150 ease-out active:scale-[0.97]">
          {projects && projects.length ? "Open Adam" : "Start a project"} <ArrowUpRight size={14} />
        </Link>
      </CardHeader>
      <CardContent className="pt-0">
        {!projects ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No research project yet. Give Adam a topic, what you already believe, and what your lab can do; it reads the literature in a loop and comes back with competing, falsifiable hypotheses and the experiments that would test them.</p>
        ) : (
          <ul className="divide-y">
            {projects.slice(0, 4).map((p) => {
              const idx = PHASES.indexOf(p.phase);
              const s = STATUS[p.status];
              return (
                <li key={p.id}>
                  <Link href={href} className="group flex flex-col gap-1.5 py-2.5 transition-colors hover:bg-muted/40 -mx-2 px-2 rounded-md">
                    <div className="flex items-center gap-2">
                      <span className={cn("inline-block size-2 rounded-full", s.tone)} />
                      <p className="text-sm font-medium leading-snug truncate">{p.title}</p>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">pass {p.pass}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {s.label}
                      {p.status === "blocked_on_gate" && p.gate ? <span className="text-amber-700">: {GATE[p.gate] ?? p.gate}</span> : null}
                      {" · "}
                      {PHASE_LABELS[p.phase]}
                      {p.spent.llmCalls ? ` · ${p.spent.llmCalls} LLM calls` : ""}
                      {p.papers.length ? ` · ${p.papers.length} write-up${p.papers.length === 1 ? "" : "s"}` : ""}
                    </p>
                    <ol className="flex items-center gap-0.5">
                      {PHASES.filter((ph) => ph !== "done").map((ph, i) => (
                        <li key={ph} title={PHASE_LABELS[ph]} className={cn("h-1 flex-1 rounded-full", i < idx ? "bg-emerald-400" : i === idx ? (p.status === "blocked_on_gate" ? "bg-amber-400" : "bg-primary") : "bg-muted")} />
                      ))}
                    </ol>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
