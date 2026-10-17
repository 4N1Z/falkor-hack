"use client";

import type { PlanView } from "@/app/api/adam/[projectId]/experiments/route";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { Chain, HypothesisQueryResult } from "@/lib/adam/hypothesis-query";
import type { ProjectStatus } from "@/lib/adam/status";
import { passGate, refreshAdam } from "@/lib/hooks/use-adam";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, GitBranch, Loader2, RotateCw, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";
import { NodeSheet } from "./knowledge-tab";

const key = (workspaceId: string, projectId: string) => `/api/adam/${projectId}/experiments?workspaceId=${workspaceId}`;
const fetcher = async (url: string) => {
  const r = await fetch(url);
  const b = await r.json();
  if (!r.ok) throw new Error(b.error ?? "Couldn't load the plans");
  return b as { plans: PlanView[] };
};

const STEP_TONE: Record<string, string> = {
  verified: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  partial: "bg-amber-50 text-amber-800 ring-amber-600/20",
  unknown: "bg-slate-100 text-slate-600 ring-slate-500/20",
  infeasible: "bg-rose-50 text-rose-700 ring-rose-600/20",
  missing: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

/** Phase 7 · Experiment: hypothesis as a query at the top, then the plans awaiting approval. */
export function ExperimentsTab({ workspaceId, status }: { workspaceId: string; status: ProjectStatus }) {
  const projectId = status.project.id;
  const { data, error } = useSWR(key(workspaceId, projectId), fetcher, { refreshInterval: status.project.status === "running" ? 6000 : 0, keepPreviousData: true });
  const [text, setText] = useState("");
  const [querying, setQuerying] = useState(false);
  const [result, setResult] = useState<HypothesisQueryResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const gatePlan = status.project.status === "blocked_on_gate" && status.project.gate === "plan";

  const ask = async () => {
    setQuerying(true);
    try {
      const r = await fetch(`/api/adam/${projectId}/experiments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, query: text }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Query failed");
      setResult(b as HypothesisQueryResult);
      await refreshAdam(workspaceId, projectId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Query failed");
    } finally {
      setQuerying(false);
    }
  };

  const approve = async (p: PlanView) => {
    setBusy(p.id);
    try {
      await passGate(workspaceId, projectId, "plan", { planId: p.id });
      toast.success("Plan approved", { description: "Handed to the lab; results come back as new nodes." });
      await mutate(key(workspaceId, projectId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't approve");
    } finally {
      setBusy(null);
    }
  };

  const redesign = async (p: PlanView) => {
    setBusy(`re:${p.id}`);
    try {
      const r = await fetch(`/api/adam/${projectId}/experiments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, redesign: p.hypothesisId }) });
      if (!r.ok) throw new Error((await r.json()).error ?? "Couldn't queue");
      toast("Experiment Designer queued");
      await refreshAdam(workspaceId, projectId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't queue");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border bg-white p-4 flex flex-col gap-3">
        <header>
          <h2 className="text-sm font-medium">Hypothesis as a query</h2>
          <p className="text-xs text-muted-foreground">Type a hypothesis. The graph answers with the chain of known steps that could test it, and where the chain breaks.</p>
        </header>
        <div className="flex gap-2">
          <textarea
            className="flex-1 rounded-md border px-3 py-2 text-sm leading-relaxed min-h-[4.5rem] focus:outline-none focus:ring-2 focus:ring-primary/30"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Tuned hybrid retrieval with a shared reranker closes the gap to graph-based retrieval on multi-hop QA at equal context budget."
          />
          <Button onClick={ask} disabled={querying || text.trim().length < 12} className="self-end">
            {querying ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            <span className="ml-1.5">Query</span>
          </Button>
        </div>
        {result && <QueryResult result={result} onOpen={setSelected} />}
      </section>

      <section className="flex flex-col gap-3">
        <header className="flex items-center gap-2">
          <h2 className="text-sm font-medium">Experiment plans</h2>
          <span className="text-xs text-muted-foreground">Chains ordered cheapest-to-kill first; gaps are the risky steps.</span>
        </header>
        {gatePlan && <p className="text-sm text-amber-800 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2">Approve each plan to hand it to the lab. A plan whose design check failed can be redesigned first.</p>}
        {error ? (
          <p className="text-sm text-red-700">{error.message}</p>
        ) : !data ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center"><Loader2 className="size-4 animate-spin" /> Loading…</div>
        ) : data.plans.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-white p-10 text-center text-sm text-muted-foreground">No plans yet. The Designer writes one for each surviving brief whose kill criteria you signed.</div>
        ) : (
          data.plans.map((p) => (
            <article key={p.id} className="rounded-lg border bg-white">
              <header className="px-4 py-3 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs mb-1">
                    <span className={cn("rounded-full px-2 py-0.5", p.designPasses ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800")}>{p.designPasses ? "design check passed" : "design check flagged issues"}</span>
                    <span className="text-muted-foreground">cost to kill {Math.round(p.costToKill)}</span>
                    <span className="text-muted-foreground">v{p.version}</span>
                    {p.approvedAt && <span className="text-emerald-700 flex items-center gap-1"><Check className="size-3" /> approved</span>}
                  </div>
                  <p className="font-medium leading-snug">{p.statement}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => redesign(p)}>
                    {busy === `re:${p.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
                    <span className="ml-1.5">Redesign</span>
                  </Button>
                  {!p.approvedAt && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" disabled={busy !== null}>
                          <Check className="size-3.5" />
                          <span className="ml-1.5">Approve plan</span>
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Hand this plan to the lab?</AlertDialogTitle>
                          <AlertDialogDescription>
                            The plan is pre-registered against the signed kill criterion: {p.killTest || "see the plan"}. Results feed back into the graph as new nodes on the next pass.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Not yet</AlertDialogCancel>
                          <AlertDialogAction onClick={() => approve(p)}>Approve</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </header>
              <div className="px-4 pb-4 flex flex-col gap-3 text-sm">
                <ol className="flex flex-col gap-1.5">
                  {p.steps.map((s, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-muted-foreground tabular-nums w-5 shrink-0">{i + 1}.</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset shrink-0 mt-0.5", STEP_TONE[s.status])}>{s.status}</span>
                      <div className="min-w-0">
                        <p>
                          {s.procedureId ? <button className="font-medium hover:underline decoration-dotted text-left" onClick={() => setSelected(s.procedureId)}>{s.name}</button> : <span className="font-medium">{s.name}</span>}
                          {s.gap && <span className="ml-2 text-xs text-rose-700 inline-flex items-center gap-1"><AlertTriangle className="size-3" /> gap: this is where the risk sits</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{s.purpose}{s.control ? ` · control: ${s.control}` : ""}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                {p.controls.length > 0 && (
                  <div className="text-xs">
                    <p className="text-muted-foreground mb-0.5">Controls for rival explanations</p>
                    <ul className="list-disc pl-4">{p.controls.map((c, i) => <li key={i}><span className="text-muted-foreground">{c.rival}:</span> {c.control}</li>)}</ul>
                  </div>
                )}
                {p.rationale && <p className="text-xs"><span className="text-muted-foreground">Order:</span> {p.rationale}</p>}
                {p.killTest && <p className="text-xs"><span className="text-muted-foreground">Maps to the kill criterion:</span> {p.killTest}</p>}
                {!p.designPasses && (p.designCheck.issues?.length ?? 0) > 0 && (
                  <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                    <p className="font-medium mb-1">Design check</p>
                    <ul className="list-disc pl-4">{p.designCheck.issues!.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  </div>
                )}
              </div>
            </article>
          ))
        )}
      </section>
      <NodeSheet workspaceId={workspaceId} projectId={projectId} id={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function QueryResult({ result: r, onOpen }: { result: HypothesisQueryResult; onOpen: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-4 border-t pt-3">
      <div>
        <p className="text-sm font-medium">{r.statement}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Predicts: {r.predictedResult}{r.mechanismMethods.length ? ` · via ${r.mechanismMethods.join(", ")}` : ""}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Evidence by sub-claim</h3>
          <ul className="flex flex-col gap-2 text-sm">
            {r.subclaims.map((s, i) => (
              <li key={i} className={cn("rounded-md border p-2", s.gap && "border-rose-200 bg-rose-50/40")}>
                <p className="font-medium leading-snug">{s.text}</p>
                {s.gap && <p className="text-xs text-rose-700 mt-0.5">Gap: nothing verified in the graph supports this.</p>}
                {s.for.map((h) => (
                  <button key={h.id} className="block text-left text-xs mt-1 hover:underline decoration-dotted" onClick={() => onOpen(h.id)}>
                    <span className="inline-block size-1.5 rounded-full bg-emerald-500 mr-1.5 align-middle" />{h.text.slice(0, 160)} <span className="text-muted-foreground">— {h.paper.slice(0, 40)} {h.year || ""}{h.page ? `, p.${h.page}` : ""}</span>
                  </button>
                ))}
                {s.against.map((h) => (
                  <button key={h.id} className="block text-left text-xs mt-1 hover:underline decoration-dotted" onClick={() => onOpen(h.id)}>
                    <span className="inline-block size-1.5 rounded-full bg-rose-500 mr-1.5 align-middle" />{h.text.slice(0, 160)} <span className="text-muted-foreground">— {h.paper.slice(0, 40)} {h.year || ""}</span>
                  </button>
                ))}
              </li>
            ))}
          </ul>
        </section>
        <section className="flex flex-col gap-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Boundary</h3>
            {r.boundary.holds.length > 0 && <p className="text-xs"><span className="text-muted-foreground">Holds under:</span> {r.boundary.holds.slice(0, 8).join("; ")}</p>}
            {r.boundary.fails.length > 0 ? <p className="text-xs"><span className="text-muted-foreground">Fails under:</span> {r.boundary.fails.slice(0, 8).join("; ")}</p> : <p className="text-xs text-muted-foreground">No failure conditions recorded for the supporting claims.</p>}
            {r.boundary.assumptions.length > 0 && (
              <p className="text-xs mt-1"><span className="text-muted-foreground">Rests on:</span> {r.boundary.assumptions.slice(0, 6).map((a) => <button key={a.id} className="underline decoration-dotted mr-1.5 hover:text-foreground" onClick={() => onOpen(a.id)}>{a.text.slice(0, 70)}{a.loadBearing ? " (load-bearing)" : ""}</button>)}</p>
            )}
          </div>
          {r.costToKill && (
            <div className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-900">
              <p className="font-medium">Cost to kill: {r.costToKill.cost}</p>
              <p>{r.costToKill.description}</p>
            </div>
          )}
          {r.gaps.length > 0 && (
            <div className="rounded-md bg-rose-50 p-2 text-xs text-rose-900">
              <p className="font-medium mb-1">Gaps</p>
              <ul className="list-disc pl-4">{r.gaps.map((g, i) => <li key={i}>{g.text}</li>)}</ul>
            </div>
          )}
        </section>
      </div>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1"><GitBranch className="size-3.5" /> Candidate chains ({r.chains.length})</h3>
        {r.chains.length === 0 ? (
          <p className="text-xs text-muted-foreground">No chain of procedures in the graph reaches the predicted result yet. The Methods Hunter has been pointed at the gap.</p>
        ) : (
          <ol className="flex flex-col gap-2">{r.chains.slice(0, 6).map((c) => <ChainRow key={c.rank} chain={c} onOpen={onOpen} />)}</ol>
        )}
      </section>
      {r.rivals.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Rival chains ({r.rivals.length}) · reach a similar result without the mechanism</h3>
          <ol className="flex flex-col gap-2">{r.rivals.slice(0, 4).map((c) => <ChainRow key={c.rank} chain={c} onOpen={onOpen} rival />)}</ol>
        </section>
      )}
    </div>
  );
}

function ChainRow({ chain: c, onOpen, rival }: { chain: Chain; onOpen: (id: string) => void; rival?: boolean }) {
  return (
    <li className={cn("rounded-md border p-2 text-sm", rival && "border-dashed")}>
      <p className="text-xs text-muted-foreground mb-1">
        {rival ? "Rival" : "Chain"} {c.rank} · cost {Math.round(c.cost)} · {c.gaps} gap{c.gaps === 1 ? "" : "s"} · {c.feasible ? "feasible for this lab" : "not feasible as is"} → {c.resultText.slice(0, 100)}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {c.steps.map((s, i) => (
          <span key={s.procedureId + i} className="flex items-center gap-1.5">
            <button className={cn("rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset hover:underline decoration-dotted", STEP_TONE[s.status])} onClick={() => onOpen(s.procedureId)} title={`${s.status}${s.missing.length ? ` · missing: ${s.missing.join("; ")}` : ""}`}>
              {s.name.slice(0, 48)}
            </button>
            {i < c.steps.length - 1 && <span className="text-muted-foreground text-xs">→</span>}
          </span>
        ))}
      </div>
    </li>
  );
}
