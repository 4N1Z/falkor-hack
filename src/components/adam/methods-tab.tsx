"use client";

import type { DossierRow } from "@/app/api/adam/[projectId]/methods/route";
import { Button } from "@/components/ui/button";
import type { ProjectStatus } from "@/lib/adam/status";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Loader2, RotateCw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";
import { NodeSheet } from "./knowledge-tab";

const key = (workspaceId: string, projectId: string) => `/api/adam/${projectId}/methods?workspaceId=${workspaceId}`;
const fetcher = async (url: string) => {
  const r = await fetch(url);
  const b = await r.json();
  if (!r.ok) throw new Error(b.error ?? "Couldn't load the methods");
  return b as { methods: DossierRow[] };
};

const RUN: Record<string, { label: string; tone: string }> = {
  runnable: { label: "Runnable", tone: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  partial: { label: "Partial", tone: "bg-amber-50 text-amber-800 ring-amber-600/20" },
  unknown: { label: "Unknown", tone: "bg-slate-100 text-slate-600 ring-slate-500/20" },
};
const FEAS: Record<string, string> = {
  feasible: "text-emerald-700",
  missing_equipment: "text-rose-700",
  missing_skill: "text-rose-700",
  missing_data: "text-rose-700",
  over_budget: "text-amber-700",
};

/** The methods dossier: each technique, its procedure (if hunted), runnability, feasibility, and what is still missing. */
export function MethodsTab({ workspaceId, status }: { workspaceId: string; status: ProjectStatus }) {
  const projectId = status.project.id;
  const { data, error } = useSWR(key(workspaceId, projectId), fetcher, { refreshInterval: status.project.status === "running" ? 6000 : 0, keepPreviousData: true });
  const [filter, setFilter] = useState<"all" | "runnable" | "partial" | "unknown" | "none">("all");
  const [open, setOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const rows = useMemo(() => (data?.methods ?? []).filter((m) => filter === "all" || (filter === "none" ? !m.procedureId : m.runnability === filter)), [data, filter]);
  const counts = useMemo(() => {
    const c = { runnable: 0, partial: 0, unknown: 0, none: 0 };
    for (const m of data?.methods ?? []) {
      if (!m.procedureId) c.none++;
      else if (m.runnability) c[m.runnability]++;
    }
    return c;
  }, [data]);

  const hunt = async (m: DossierRow) => {
    setBusy(m.id);
    try {
      const r = await fetch(`/api/adam/${projectId}/methods`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, methodId: m.id, note }) });
      if (!r.ok) throw new Error((await r.json()).error ?? "Couldn't queue the hunt");
      toast("Methods Hunter queued", { description: m.name });
      setNote("");
      await mutate(key(workspaceId, projectId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't queue the hunt");
    } finally {
      setBusy(null);
    }
  };

  if (error) return <p className="text-sm text-red-700">{error.message}</p>;
  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center"><Loader2 className="size-4 animate-spin" /> Loading the dossier…</div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-1 text-sm">
        {(["all", "runnable", "partial", "unknown", "none"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cn("rounded-full px-2.5 py-0.5 text-xs transition-colors capitalize", filter === f ? "bg-foreground text-background" : "hover:bg-accent")}>
            {f === "none" ? "No procedure" : f} <span className="text-muted-foreground tabular-nums">{f === "all" ? data.methods.length : counts[f]}</span>
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">A method is a technique as a paper names it; a procedure is that method filled in to the point a lab could run it.</span>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-10 text-center text-sm text-muted-foreground">
          {data.methods.length === 0 ? "No methods yet. They appear as the Extractor reads papers; the Hunter fills them in during the Methods phase." : "Nothing matches this filter."}
        </div>
      ) : (
        <div className="rounded-lg border bg-white divide-y">
          {rows.map((m) => {
            const isOpen = open === m.id;
            const run = m.runnability ? RUN[m.runnability] : null;
            return (
              <div key={m.id}>
                <button className="w-full text-left px-3 py-2.5 flex items-start gap-3 hover:bg-accent/40" onClick={() => setOpen(isOpen ? null : m.id)}>
                  {isOpen ? <ChevronDown className="size-4 mt-0.5 text-muted-foreground shrink-0" /> : <ChevronRight className="size-4 mt-0.5 text-muted-foreground shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">
                      {m.name}
                      {m.aliases.length > 0 && <span className="text-muted-foreground font-normal"> · also {m.aliases.slice(0, 3).join(", ")}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                      <span>{m.claims} claim{m.claims === 1 ? "" : "s"} · {m.papers} paper{m.papers === 1 ? "" : "s"}</span>
                      {m.loadBearing && <span className="text-sky-700">load-bearing</span>}
                      {m.chainsNeeding > 0 && <span className="text-violet-700">{m.chainsNeeding} chain{m.chainsNeeding === 1 ? "" : "s"} need this</span>}
                      {m.feasibility && <span className={FEAS[m.feasibility]}>{m.feasibility.replace(/_/g, " ")}</span>}
                      {m.missing.length > 0 && <span className="text-amber-800">{m.missing.length} missing</span>}
                    </p>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset shrink-0", run ? run.tone : "bg-slate-50 text-slate-400 ring-slate-300/40")}>{run ? run.label : "no procedure"}</span>
                </button>
                {isOpen && (
                  <div className="px-10 pb-4 text-sm flex flex-col gap-3">
                    {m.procedureId ? (
                      <>
                        <div>
                          <p className="font-medium">{m.procedureName}</p>
                          {m.expected && <p className="text-muted-foreground text-xs mt-0.5">Produces: {m.expected}</p>}
                        </div>
                        <div className="grid sm:grid-cols-2 gap-3 text-xs">
                          <Field label="Inputs" items={m.inputs} />
                          <Field label="Outputs" items={m.outputs} />
                          <Field label="Equipment" items={m.equipment} />
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Cost</p>
                            <p>{m.timeHours != null ? `${m.timeHours} h` : "time ?"} · {m.costUsd != null ? `$${m.costUsd}` : "cost ?"} · reliability {m.reliability != null ? Math.round(m.reliability * 100) + "%" : "?"}</p>
                          </div>
                        </div>
                        {m.steps.length > 0 && (
                          <ol className="list-decimal pl-5 text-xs flex flex-col gap-0.5">
                            {m.steps.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ol>
                        )}
                        {m.runnabilityNote && <p className="text-xs"><span className="text-muted-foreground">Runnability check:</span> {m.runnabilityNote}</p>}
                        {m.feasibilityNote && <p className="text-xs"><span className="text-muted-foreground">Feasibility:</span> {m.feasibilityNote}</p>}
                        {m.missing.length > 0 && (
                          <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                            <p className="font-medium mb-1">Still missing</p>
                            <ul className="list-disc pl-4">{m.missing.map((x) => <li key={x}>{x}</li>)}</ul>
                          </div>
                        )}
                        <button className="text-xs text-primary underline-offset-2 hover:underline self-start" onClick={() => setSelected(m.procedureId)}>Provenance and sources</button>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">Not hunted yet. The Methods phase fills in methods used by verified claims; you can hunt this one now.</p>
                    )}
                    <div className="flex items-center gap-2">
                      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the Hunter (optional)…" className="rounded-md border px-2 py-1 text-xs w-72" />
                      <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => hunt(m)}>
                        {busy === m.id ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
                        <span className="ml-1.5">{m.procedureId ? "Hunt again" : "Hunt now"}</span>
                      </Button>
                      <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setSelected(m.id)}>Method mentions</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <NodeSheet workspaceId={workspaceId} projectId={projectId} id={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function Field({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p>{items.length ? items.join("; ") : "—"}</p>
    </div>
  );
}
