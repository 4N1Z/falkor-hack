"use client";

import type { ObservationView, PlanView } from "@/app/api/adam/[projectId]/experiments/route";
import type { BriefView } from "@/app/api/adam/[projectId]/hypotheses/route";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { passGate } from "@/lib/hooks/use-adam";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Circle, FileText, Loader2, RotateCw, Skull, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { post } from "./steps";

/**
 * One experiment, run like a lab notebook. Before approval it is a plan to read; after approval
 * it is a timeline of steps, each with a notebook entry, a progress bar, the kill result kept in
 * view, and one question at the end. After the verdict it says what happens next. Shared by the
 * simple Experiment step and the advanced Experiments tab.
 */
export function PlanRunner({
  workspaceId,
  projectId,
  plan,
  brief,
  observations,
  otherOpen,
  onChanged,
  onOpenProcedure,
  onGoTo,
}: {
  workspaceId: string;
  projectId: string;
  plan: PlanView;
  brief: BriefView | null;
  observations: ObservationView[];
  /** Other hypotheses still waiting for a verdict (for the "what next" panel) */
  otherOpen: number;
  onChanged: () => Promise<unknown>;
  onOpenProcedure?: (id: string) => void;
  onGoTo?: (step: "pick" | "write") => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const hypothesisStatus = brief?.status ?? plan.hypothesisStatus;
  const decided = hypothesisStatus === "killed" || hypothesisStatus === "confirmed";
  const approved = !!plan.approvedAt;
  const done = observations.filter((o) => o.done).length;
  const recorded = observations.filter((o) => o.text.trim()).length;
  const issues = plan.designCheck.issues ?? [];
  const killText = brief?.killCriteria || plan.killTest || "";
  const current = plan.steps.findIndex((_, i) => !observations.find((o) => o.order === i + 1)?.done);
  const open = expanded ?? (current === -1 ? null : current);

  const run = async (label: string, fn: () => Promise<unknown>, msg?: string) => {
    setBusy(label);
    try {
      await fn();
      await onChanged();
      if (msg) toast.success(msg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };
  const verdict = (killed: boolean) => run("verdict", () => post(`/api/adam/${projectId}/experiments`, { workspaceId, verdict: { hypothesisId: plan.hypothesisId, killed, note } }, "PATCH"), killed ? "Recorded: the hypothesis is dropped" : "Recorded: the hypothesis stands, so far");

  return (
    <article className={cn("rounded-xl border bg-white overflow-hidden", decided && (hypothesisStatus === "killed" ? "border-rose-200" : "border-emerald-200"))}>
      {/* Header: what is being tested, where it stands, what would kill it */}
      <header className="p-5 flex flex-col gap-3 border-b bg-muted/20">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <StatusChip hypothesisStatus={hypothesisStatus} approved={approved} done={done} total={plan.steps.length} />
          {approved && !decided && <span className="text-muted-foreground">{recorded} of {plan.steps.length} steps have notes</span>}
          <span className="text-muted-foreground ml-auto">plan v{plan.version}</span>
        </div>
        <p className="text-[15px] font-medium leading-snug">{plan.statement}</p>
        {approved && !decided && (
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden" aria-label={`${done} of ${plan.steps.length} steps done`}>
            <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${plan.steps.length ? (100 * done) / plan.steps.length : 0}%` }} />
          </div>
        )}
        <div className={cn("rounded-lg border px-3 py-2 text-sm flex gap-2", decided ? "border-slate-200 bg-white" : "border-amber-200 bg-amber-50/70")}>
          <Skull className={cn("size-4 mt-0.5 shrink-0", decided ? "text-slate-400" : "text-amber-700")} />
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">The result that would kill it{brief?.killSignedAt ? " · signed before the experiment" : ""}</p>
            <p className="leading-relaxed">{killText || "No kill criteria recorded for this hypothesis."}</p>
          </div>
        </div>
      </header>

      {!approved ? (
        <ReviewPlan plan={plan} issues={issues} busy={busy} onOpenProcedure={onOpenProcedure} onApprove={() => run("approve", () => passGate(workspaceId, projectId, "plan", { planId: plan.id }), "Plan approved. Run it and record what you see.")} onRedesign={() => run("redesign", () => post(`/api/adam/${projectId}/experiments`, { workspaceId, redesign: plan.hypothesisId }), "Adam is redesigning the plan")} />
      ) : (
        <div className="p-5 flex flex-col gap-5">
          {issues.length > 0 && !decided && <AdamNotes issues={issues} />}

          {/* The timeline */}
          <ol className="relative flex flex-col">
            {plan.steps.map((s, i) => {
              const o = observations.find((x) => x.order === i + 1) ?? null;
              const isDone = !!o?.done;
              const isOpen = open === i;
              return (
                <li key={i} className="relative flex gap-4 pb-5 last:pb-0">
                  {i < plan.steps.length - 1 && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-border" aria-hidden />}
                  <button
                    onClick={() => setExpanded(isOpen ? -1 : i)}
                    className={cn("relative z-10 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums transition-colors", isDone ? "bg-emerald-500 border-emerald-500 text-white" : isOpen ? "bg-foreground border-foreground text-background" : "bg-white text-muted-foreground")}
                    aria-label={`Step ${i + 1}`}
                  >
                    {isDone ? <Check className="size-3.5" /> : i + 1}
                  </button>
                  <div className="min-w-0 flex-1">
                    <button className="w-full text-left flex items-start gap-2" onClick={() => setExpanded(isOpen ? -1 : i)}>
                      <span className="min-w-0 flex-1">
                        <span className={cn("text-sm font-medium leading-snug", isDone && "text-muted-foreground")}>
                          {s.procedureId && onOpenProcedure ? <span className="underline decoration-dotted" onClick={(e) => { e.stopPropagation(); onOpenProcedure(s.procedureId!); }}>{s.name}</span> : s.name}
                        </span>
                        {!isOpen && o?.text && <span className="block text-xs text-muted-foreground truncate mt-0.5">{o.text}</span>}
                      </span>
                      {s.status === "missing" && !isDone && <span className="shrink-0 rounded-full bg-amber-50 text-amber-800 px-2 py-0.5 text-[11px] mt-0.5">first of its kind</span>}
                      {isOpen ? <ChevronDown className="size-4 text-muted-foreground shrink-0 mt-0.5" /> : <ChevronRight className="size-4 text-muted-foreground shrink-0 mt-0.5" />}
                    </button>
                    {isOpen && (
                      <div className="mt-2 rounded-lg border bg-muted/20 p-3 flex flex-col gap-3">
                        {(s.purpose || s.control) && (
                          <dl className="text-xs grid gap-1">
                            {s.purpose && <div className="flex gap-2"><dt className="w-14 shrink-0 text-muted-foreground">Why</dt><dd>{s.purpose}</dd></div>}
                            {s.control && <div className="flex gap-2"><dt className="w-14 shrink-0 text-muted-foreground">Control</dt><dd>{s.control}</dd></div>}
                            {s.status === "missing" && <div className="flex gap-2"><dt className="w-14 shrink-0 text-muted-foreground">Note</dt><dd>No paper in the sweep describes this procedure. What you write here becomes the first record of it.</dd></div>}
                          </dl>
                        )}
                        <NotebookEntry workspaceId={workspaceId} projectId={projectId} planId={plan.id} order={i + 1} observation={o} locked={decided} onSaved={onChanged} onDone={() => setExpanded(i + 1 < plan.steps.length ? i + 1 : -1)} />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          {/* The verdict */}
          {decided ? (
            <WhatNext hypothesisStatus={hypothesisStatus} otherOpen={otherOpen} onGoTo={onGoTo} />
          ) : (
            <div className="rounded-lg border p-4 flex flex-col gap-3">
              <div>
                <p className="font-medium">The verdict</p>
                <p className="text-sm text-muted-foreground">When you have run the plan, answer one question. {recorded === 0 ? "You have not written any observations yet; the verdict is stronger with them, but it is yours to give." : ""}</p>
              </div>
              <p className="text-sm">Did <span className="font-medium">this result</span> appear: &ldquo;{killText || "the kill result"}&rdquo;?</p>
              <textarea className="w-full rounded-md border bg-white px-3 py-2 text-sm leading-relaxed min-h-[3rem] focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="The one line that decides it: the number, the comparison, the surprise (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <Confirm title="Drop this hypothesis?" description="The kill result appeared. The hypothesis is marked dropped, and your observation is stored as a result with you as its source. A clean kill is a finding, not a failure." action="Yes, drop it" onConfirm={() => verdict(true)}>
                  <Button variant="outline" className="border-rose-300 text-rose-700 hover:bg-rose-50" disabled={busy !== null}><Skull className="size-4" /><span className="ml-1.5">Yes, it appeared: drop it</span></Button>
                </Confirm>
                <Confirm title="Keep this hypothesis?" description="The kill result did not appear. The hypothesis is marked confirmed so far, and your observation is stored as a result. The next pass can still challenge it with new papers." action="Yes, it stands" onConfirm={() => verdict(false)}>
                  <Button disabled={busy !== null}>{busy === "verdict" ? <Loader2 className="size-4 animate-spin" /> : <ThumbsUp className="size-4" />}<span className="ml-1.5">No, it did not: it stands</span></Button>
                </Confirm>
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function StatusChip({ hypothesisStatus, approved, done, total }: { hypothesisStatus: string; approved: boolean; done: number; total: number }) {
  const [label, tone] =
    hypothesisStatus === "killed" ? ["Dropped after the experiment", "bg-rose-100 text-rose-800"]
    : hypothesisStatus === "confirmed" ? ["Confirmed by the experiment", "bg-emerald-100 text-emerald-800"]
    : !approved ? ["Plan ready for your approval", "bg-amber-50 text-amber-800"]
    : done === 0 ? ["Ready to run", "bg-sky-50 text-sky-700"]
    : done < total ? [`In progress · ${done} of ${total} steps`, "bg-sky-50 text-sky-700"]
    : ["All steps done · verdict pending", "bg-amber-50 text-amber-800"];
  return <span className={cn("rounded-full px-2 py-0.5 font-medium", tone)}>{label}</span>;
}

function ReviewPlan({ plan, issues, busy, onApprove, onRedesign, onOpenProcedure }: { plan: PlanView; issues: string[]; busy: string | null; onApprove: () => void; onRedesign: () => void; onOpenProcedure?: (id: string) => void }) {
  return (
    <div className="p-5 flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Adam proposes this sequence, cheapest way to kill the hypothesis first. Read it, then either take it into the lab or ask for a different one.</p>
      <ol className="flex flex-col gap-2">
        {plan.steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums text-muted-foreground">{i + 1}</span>
            <div className="min-w-0">
              <p className="font-medium leading-snug">
                {s.procedureId && onOpenProcedure ? <button className="underline decoration-dotted text-left" onClick={() => onOpenProcedure(s.procedureId!)}>{s.name}</button> : s.name}
                {s.status === "missing" && <span className="ml-2 rounded-full bg-amber-50 text-amber-800 px-2 py-0.5 text-[11px]">no published procedure</span>}
                {s.status === "verified" && <span className="ml-2 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[11px]">published, verified</span>}
                {s.status === "partial" && <span className="ml-2 rounded-full bg-amber-50 text-amber-800 px-2 py-0.5 text-[11px]">published, incomplete</span>}
              </p>
              {s.purpose && <p className="text-xs text-muted-foreground">{s.purpose}{s.control ? ` · control: ${s.control}` : ""}</p>}
            </div>
          </li>
        ))}
      </ol>
      {plan.controls.length > 0 && (
        <div className="text-xs">
          <p className="text-muted-foreground mb-0.5">Controls for the rival explanations</p>
          <ul className="list-disc pl-4">{plan.controls.map((c, i) => <li key={i}><span className="text-muted-foreground">{c.rival}:</span> {c.control}</li>)}</ul>
        </div>
      )}
      {issues.length > 0 && <AdamNotes issues={issues} />}
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy !== null} onClick={onApprove}>{busy === "approve" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}<span className="ml-1.5">This is the experiment I&apos;ll run</span></Button>
        <Button variant="outline" disabled={busy !== null} onClick={onRedesign}>{busy === "redesign" ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />}<span className="ml-1.5">Ask for a different plan</span></Button>
      </div>
    </div>
  );
}

function AdamNotes({ issues }: { issues: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-amber-200 bg-amber-50/50">
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-amber-900">
          <AlertTriangle className="size-4 shrink-0" />
          <span>Adam&apos;s design checker raised {issues.length} point{issues.length === 1 ? "" : "s"} about this plan</span>
          {open ? <ChevronDown className="size-4 ml-auto" /> : <ChevronRight className="size-4 ml-auto" />}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="px-3 pb-3 pl-9 text-sm text-amber-900/90 list-disc flex flex-col gap-1">{issues.map((x, i) => <li key={i}>{x}</li>)}</ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** The notebook entry for one step: what you observed, saved as you go, and a Done button. */
function NotebookEntry({ workspaceId, projectId, planId, order, observation, locked, onSaved, onDone }: { workspaceId: string; projectId: string; planId: string; order: number; observation: ObservationView | null; locked: boolean; onSaved: () => Promise<unknown>; onDone: () => void }) {
  const [text, setText] = useState(observation?.text ?? "");
  const [saving, setSaving] = useState(false);
  const [seen, setSeen] = useState(observation?.text ?? "");
  if (seen !== (observation?.text ?? "")) {
    setSeen(observation?.text ?? "");
    setText(observation?.text ?? "");
  }
  const isDone = !!observation?.done;

  const save = async (next: { text?: string; done?: boolean }) => {
    const payload = { planId, order, text: next.text ?? text, done: next.done ?? isDone };
    if (payload.text === (observation?.text ?? "") && payload.done === isDone) return;
    setSaving(true);
    try {
      await post(`/api/adam/${projectId}/experiments`, { workspaceId, observation: payload }, "PATCH");
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-medium flex items-center gap-1.5"><FileText className="size-3.5 text-muted-foreground" /> What you observed</label>
      <textarea
        className="w-full rounded-md border bg-white px-3 py-2 text-sm leading-relaxed min-h-[4.5rem] focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-muted/30"
        placeholder="Numbers, conditions, what went wrong, what surprised you. Saved when you click away."
        value={text}
        disabled={locked}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => save({ text })}
      />
      <div className="flex flex-wrap items-center gap-2">
        {!locked && (isDone ? (
          <Button size="sm" variant="outline" disabled={saving} onClick={() => save({ done: false })}><Circle className="size-3.5" /><span className="ml-1.5">Reopen</span></Button>
        ) : (
          <Button size="sm" disabled={saving} onClick={async () => { await save({ text, done: true }); onDone(); }}>{saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}<span className="ml-1.5">Done, next step</span></Button>
        ))}
        <span className="text-[11px] text-muted-foreground">{saving ? "Saving…" : observation?.observedAt ? `Saved ${new Date(observation.observedAt).toLocaleString()}` : "Not saved yet"}</span>
      </div>
    </div>
  );
}

/** After the verdict: what Adam does with it and what you can do now. */
function WhatNext({ hypothesisStatus, otherOpen, onGoTo }: { hypothesisStatus: string; otherOpen: number; onGoTo?: (step: "pick" | "write") => void }) {
  const killed = hypothesisStatus === "killed";
  return (
    <div className={cn("rounded-lg border p-4 flex flex-col gap-3", killed ? "border-rose-200 bg-rose-50/40" : "border-emerald-200 bg-emerald-50/40")}>
      <p className="font-medium inline-flex items-center gap-2">{killed ? <><Skull className="size-4 text-rose-600" /> Dropped: the kill result appeared.</> : <><ThumbsUp className="size-4 text-emerald-600" /> It stands, so far.</>}</p>
      <ul className="text-sm text-muted-foreground list-disc pl-5 flex flex-col gap-1">
        <li>Your observations and this verdict are now in the graph as results with you as the source. The write-up includes them, and every later hypothesis can cite them.</li>
        {killed ? (
          <>
            <li>The next pass reads this as a hard fact: Adam re-scopes the questions around why it failed and will not propose the same mechanism again without new evidence.</li>
            {otherOpen > 0 ? <li>{otherOpen} other hypothesis{otherOpen === 1 ? " is" : "es are"} still waiting for a verdict.</li> : <li>No other hypothesis is waiting. Write up the pass, then start the next one to look for a different explanation.</li>}
          </>
        ) : (
          <>
            <li>It is confirmed for the conditions you tested, not proven. The next pass attacks it again with your result in hand: a sharper prediction, the boundary where it should fail, a harder control.</li>
            {otherOpen > 0 ? <li>{otherOpen} other hypothesis{otherOpen === 1 ? " is" : "es are"} still waiting for a verdict.</li> : <li>Write up the pass for collaborators, then start the next one to extend it.</li>}
          </>
        )}
      </ul>
      {onGoTo && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onGoTo("write")}><FileText className="size-3.5" /><span className="ml-1.5">Write it up</span></Button>
          {otherOpen > 0 && <Button size="sm" variant="outline" onClick={() => onGoTo("pick")}>See the other hypotheses</Button>}
        </div>
      )}
    </div>
  );
}

function Confirm({ title, description, action, onConfirm, children }: { title: string; description: string; action: string; onConfirm: () => void; children: React.ReactNode }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Not yet</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
