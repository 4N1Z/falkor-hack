"use client";

import type { ObservationView, PlanView } from "@/app/api/adam/[projectId]/experiments/route";
import type { BriefView } from "@/app/api/adam/[projectId]/hypotheses/route";
import type { ProjectStatus } from "@/lib/adam/status";
import { refreshAdam } from "@/lib/hooks/use-adam";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import useSWR, { mutate } from "swr";
import { PlanRunner } from "./plan-runner";

const plansKey = (w: string, p: string) => `/api/adam/${p}/experiments?workspaceId=${w}`;
const briefsKey = (w: string, p: string) => `/api/adam/${p}/hypotheses?workspaceId=${w}`;
const fetcher = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url);
  const b = await r.json();
  if (!r.ok) throw new Error(b.error ?? "Couldn't load");
  return b as T;
};

/** Step 4 · Experiment. One plan at a time, run like a lab notebook; a switcher when there are several. */
export function ExperimentStep({ workspaceId, status, onGoTo }: { workspaceId: string; status: ProjectStatus; onGoTo: (step: "pick" | "write") => void }) {
  const projectId = status.project.id;
  const live = status.project.status === "running";
  const { data, error } = useSWR(plansKey(workspaceId, projectId), fetcher<{ plans: PlanView[]; observations: ObservationView[] }>, { refreshInterval: live ? 8000 : 0, keepPreviousData: true });
  const { data: hyp } = useSWR(briefsKey(workspaceId, projectId), fetcher<{ briefs: BriefView[] }>, { keepPreviousData: true });
  const [chosen, setChosen] = useState<string | null>(null);
  const refresh = () => Promise.all([mutate(plansKey(workspaceId, projectId)), mutate(briefsKey(workspaceId, projectId)), refreshAdam(workspaceId, projectId)]);
  const designing = status.jobs.recent.some((j) => j.kind === "design_experiment" && (j.status === "queued" || j.status === "running"));

  if (error) return <p className="text-sm text-red-700">{error.message}</p>;
  if (!data) return <p className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center"><Loader2 className="size-4 animate-spin" /> Loading…</p>;
  // Plans outlive the pass they were designed in: a pass-1 plan is still the one to run during pass 2
  const plans = data.plans;
  if (!plans.length) {
    return (
      <div className="rounded-lg border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">
        {designing ? <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Adam is designing the experiment…</span> : "No experiment yet. It is designed once a hypothesis has survived the attacks and you have confirmed its kill criteria."}
      </div>
    );
  }
  const statusOf = (p: PlanView) => hyp?.briefs.find((b) => b.id === p.hypothesisId)?.status ?? p.hypothesisStatus;
  const undecided = plans.filter((p) => !["killed", "confirmed"].includes(statusOf(p)));
  const active = plans.find((p) => p.id === chosen) ?? undecided[0] ?? plans[0];

  return (
    <div className="flex flex-col gap-4">
      {plans.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {plans.map((p, i) => {
            const s = statusOf(p);
            return (
              <button key={p.id} onClick={() => setChosen(p.id)} className={cn("rounded-lg border px-3 py-2 text-left text-sm max-w-xs transition-colors", active.id === p.id ? "border-foreground bg-foreground text-background" : "bg-white hover:bg-accent")}>
                <span className="block text-[11px] opacity-70">Experiment {i + 1} · {s === "killed" ? "dropped" : s === "confirmed" ? "confirmed" : p.approvedAt ? "running" : "to approve"}</span>
                <span className="block truncate">{p.statement}</span>
              </button>
            );
          })}
        </div>
      )}
      <PlanRunner
        workspaceId={workspaceId}
        projectId={projectId}
        plan={active}
        brief={hyp?.briefs.find((b) => b.id === active.hypothesisId) ?? null}
        observations={data.observations.filter((o) => o.planId === active.id)}
        otherOpen={undecided.filter((p) => p.id !== active.id).length}
        onChanged={refresh}
        onGoTo={onGoTo}
      />
    </div>
  );
}
