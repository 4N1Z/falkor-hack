"use client";

import type { BriefView, CandidateView } from "@/app/api/adam/[projectId]/hypotheses/route";
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
import type { ProjectStatus } from "@/lib/adam/status";
import { passGate, refreshAdam } from "@/lib/hooks/use-adam";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, ChevronRight, Loader2, Pencil, RotateCw, ShieldAlert, Skull, Sparkles, Swords, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";
import { HypothesisMapView } from "./hypothesis-map";
import { NodeSheet } from "./knowledge-tab";

const key = (workspaceId: string, projectId: string) => `/api/adam/${projectId}/hypotheses?workspaceId=${workspaceId}`;
const fetcher = async (url: string) => {
  const r = await fetch(url);
  const b = await r.json();
  if (!r.ok) throw new Error(b.error ?? "Couldn't load the hypotheses");
  return b as { briefs: BriefView[]; candidates: CandidateView[] };
};

const STATUS: Record<BriefView["status"], { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "bg-slate-100 text-slate-700" },
  selected: { label: "Selected", tone: "bg-sky-50 text-sky-700" },
  attacked: { label: "Under attack", tone: "bg-amber-50 text-amber-800" },
  killed: { label: "Killed", tone: "bg-rose-50 text-rose-700" },
  survived: { label: "Survived", tone: "bg-emerald-50 text-emerald-700" },
  confirmed: { label: "Confirmed by experiment", tone: "bg-emerald-100 text-emerald-800" },
};

const ATTACK_LABEL: Record<string, string> = {
  premortem: "Pre-mortem",
  dependency: "Dependency",
  rival: "Rival explanation",
  null_ablation: "Null & ablation",
  baseline: "Baseline replication",
  boundary: "Boundary",
};
const ATTACK_TONE: Record<string, string> = { fatal: "text-rose-700", open: "text-amber-800", answered: "text-emerald-700" };
const CANDIDATE_LABEL: Record<CandidateView["kind"], string> = { hole: "Hole", conflict: "Conflict", load_bearing: "Load-bearing assumption" };

/** Phase 5–6 · Hypothesise and Attack: the Analyst's candidates, the competing briefs, the attack log, gates 2 and 3. */
export function HypothesesTab({ workspaceId, status }: { workspaceId: string; status: ProjectStatus }) {
  const projectId = status.project.id;
  const live = status.project.status === "running";
  const { data, error } = useSWR(key(workspaceId, projectId), fetcher, { refreshInterval: live ? 6000 : 0, keepPreviousData: true });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const refresh = () => Promise.all([mutate(key(workspaceId, projectId)), refreshAdam(workspaceId, projectId)]);

  const briefs = useMemo(() => (data?.briefs ?? []).filter((b) => b.pass === status.project.pass), [data, status.project.pass]);
  const gateSelect = status.project.status === "blocked_on_gate" && status.project.gate === "select";
  const gateKill = status.project.status === "blocked_on_gate" && status.project.gate === "kill";

  const select = async () => {
    setBusy("select");
    try {
      await passGate(workspaceId, projectId, "select", { hypothesisIds: [...picked] });
      toast.success(`${picked.size} hypothesis${picked.size === 1 ? "" : "es"} selected`, { description: "The Falsifier attacks each one; you sign the kill criteria of the survivors." });
      setPicked(new Set());
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't select");
    } finally {
      setBusy(null);
    }
  };

  const rewrite = async () => {
    setBusy("rewrite");
    try {
      const r = await fetch(`/api/adam/${projectId}/hypotheses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, rewrite: true }) });
      if (!r.ok) throw new Error((await r.json()).error ?? "Couldn't queue the writer");
      toast("Hypothesis Writer queued");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't queue the writer");
    } finally {
      setBusy(null);
    }
  };

  if (error) return <p className="text-sm text-red-700">{error.message}</p>;
  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center"><Loader2 className="size-4 animate-spin" /> Loading…</div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {data.candidates.length > 0 && (
        <section className="rounded-lg border bg-white">
          <header className="px-4 py-2.5 border-b flex items-center gap-2">
            <h2 className="text-sm font-medium">What the Analyst found</h2>
            <span className="text-xs text-muted-foreground">holes between clusters, opposite claims, untested assumptions many claims rest on</span>
          </header>
          <ul className="divide-y max-h-72 overflow-y-auto">
            {data.candidates.map((c) => (
              <li key={c.id} className={cn("px-4 py-2 text-sm flex gap-3", !c.sane && "opacity-60")}>
                <span className="rounded-full bg-amber-50 text-amber-800 px-2 py-0.5 text-[11px] shrink-0 h-fit">{CANDIDATE_LABEL[c.kind]}</span>
                <div className="min-w-0">
                  <p className="leading-snug">{c.summary}</p>
                  {c.kind === "hole" && typeof c.detail.question === "string" && <p className="text-xs text-muted-foreground mt-0.5">Question: {c.detail.question}</p>}
                  {c.kind === "conflict" && Array.isArray(c.detail.explanations) && <p className="text-xs text-muted-foreground mt-0.5">Could be explained by: {(c.detail.explanations as string[]).join(" · ")}</p>}
                  {c.kind === "load_bearing" && typeof c.detail.cheapestTest === "string" && <p className="text-xs text-muted-foreground mt-0.5">Cheapest test: {c.detail.cheapestTest}</p>}
                  {!c.sane && <p className="text-xs text-rose-700 mt-0.5">Sanity check failed: {c.saneReason}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <header className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-medium">Hypothesis briefs · pass {status.project.pass}</h2>
          <span className="text-xs text-muted-foreground">Always several in competition: a single hypothesis makes every result look like confirmation.</span>
          <div className="ml-auto flex items-center gap-2">
            {gateSelect && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" disabled={picked.size === 0 || busy !== null}>
                    <Check className="size-3.5" />
                    <span className="ml-1.5">Select {picked.size || ""} to pursue</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Pursue {picked.size} hypothesis{picked.size === 1 ? "" : "es"}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This is gate 2. Agents drift toward safe, plausible-sounding ideas that are already in the literature; which of these are worth a year of your lab&apos;s time is your call. The Falsifier attacks the ones you select; you sign their kill criteria before any data is collected.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Not yet</AlertDialogCancel>
                    <AlertDialogAction onClick={select}>Select and start the attacks</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button size="sm" variant="outline" onClick={rewrite} disabled={busy !== null || !data.candidates.length && briefs.length === 0}>
              {busy === "rewrite" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              <span className="ml-1.5">{briefs.length ? "Rewrite briefs" : "Write briefs"}</span>
            </Button>
          </div>
        </header>
        {gateKill && <p className="text-sm text-amber-800 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2">Gate 3: sign the kill criteria of each surviving brief. Only the person who will run the experiment can commit to accepting its negative outcome.</p>}
        {briefs.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-white p-10 text-center text-sm text-muted-foreground">No briefs yet for this pass. They are written once the Analyst has reported, or on demand.</div>
        ) : (
          briefs.map((b) => (
            <BriefCard
              key={b.id}
              brief={b}
              workspaceId={workspaceId}
              projectId={projectId}
              selectable={gateSelect && b.status === "draft"}
              picked={picked.has(b.id)}
              onPick={(v) => setPicked((s) => {
                const n = new Set(s);
                v ? n.add(b.id) : n.delete(b.id);
                return n;
              })}
              needsSignature={gateKill && b.status === "survived" && !b.killSignedAt}
              onChanged={refresh}
              onOpenNode={setSelectedNode}
            />
          ))
        )}
      </section>
      <NodeSheet workspaceId={workspaceId} projectId={projectId} id={selectedNode} onClose={() => setSelectedNode(null)} />
    </div>
  );
}

function BriefCard({ brief: b, workspaceId, projectId, selectable, picked, onPick, needsSignature, onChanged, onOpenNode }: {
  brief: BriefView;
  workspaceId: string;
  projectId: string;
  selectable: boolean;
  picked: boolean;
  onPick: (v: boolean) => void;
  needsSignature: boolean;
  onChanged: () => Promise<unknown>;
  onOpenNode: (id: string) => void;
}) {
  // When the kill-criteria signature is what the loop waits on, open that section, highlight it, and bring it into view
  const [open, setOpen] = useState<string | null>(needsSignature ? "kill" : "evidence");
  const killRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!needsSignature) return;
    setOpen("kill");
    const t = setTimeout(() => killRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
    return () => clearTimeout(t);
  }, [needsSignature]);
  const [editing, setEditing] = useState<"statement" | "kill" | null>(null);
  const [draft, setDraft] = useState("");
  const [signText, setSignText] = useState<string | null>(null);
  const [committed, setCommitted] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const s = STATUS[b.status];
  const forE = b.evidence.filter((e) => e.type === "EVIDENCE_FOR");
  const against = b.evidence.filter((e) => e.type === "EVIDENCE_AGAINST");
  const rivals = b.attacks.filter((a) => a.kind === "rival");
  const openFatal = b.attacks.filter((a) => a.status === "fatal").length;
  const openCount = b.attacks.filter((a) => a.status === "open").length;

  const patch = async (body: Record<string, unknown>, label: string) => {
    setBusy(label);
    try {
      const r = await fetch(`/api/adam/${projectId}/hypotheses`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, ...body }) });
      if (!r.ok) throw new Error((await r.json()).error ?? "Couldn't save");
      setEditing(null);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(null);
    }
  };
  const sign = async () => {
    setBusy("sign");
    try {
      const text = (signText ?? b.killCriteria).trim();
      await passGate(workspaceId, projectId, "kill", { hypothesisId: b.id, killCriteria: text });
      toast.success("Kill criteria signed", { description: "Recorded before any data is collected." });
      setSignText(null);
      setCommitted(false);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't sign");
    } finally {
      setBusy(null);
    }
  };
  const attackAgain = async () => {
    setBusy("attack");
    try {
      const r = await fetch(`/api/adam/${projectId}/hypotheses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, attack: b.id }) });
      if (!r.ok) throw new Error((await r.json()).error ?? "Couldn't queue");
      toast("Falsifier queued for another round");
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't queue");
    } finally {
      setBusy(null);
    }
  };

  // Stable props for the hoisted Section (a component defined inside this render would remount its textarea on every keystroke)
  const sec = (id: string) => ({ open: open === id, onToggle: () => setOpen(open === id ? null : id) });

  const killSigned = !!b.killSignedAt;
  const signDraft = signText ?? b.killCriteria;

  return (
    <article className={cn("rounded-lg border bg-white", b.status === "killed" && "opacity-70", picked && "ring-2 ring-primary/30")}>
      <header className="px-4 py-3 flex items-start gap-3">
        {selectable && <input type="checkbox" className="mt-1.5 size-4" checked={picked} onChange={(e) => onPick(e.target.checked)} aria-label="Select this hypothesis" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1 text-xs">
            <span className={cn("rounded-full px-2 py-0.5", s.tone)}>{s.label}</span>
            {!b.ready && <span className="rounded-full bg-amber-50 text-amber-800 px-2 py-0.5">not ready: {b.stateReason === "no_failure_condition" ? "no failure condition" : "no evidence"}</span>}
            {b.convergenceRounds > 0 && <span className="text-muted-foreground">{b.convergenceRounds} attack round{b.convergenceRounds === 1 ? "" : "s"}</span>}
            {openFatal > 0 && <span className="text-rose-700 flex items-center gap-1"><Skull className="size-3" /> {openFatal} fatal</span>}
            {openCount > 0 && <span className="text-amber-800">{openCount} open</span>}
            {killSigned && <span className="text-emerald-700 flex items-center gap-1"><Check className="size-3" /> kill criteria signed</span>}
            <span className="ml-auto text-muted-foreground">v{b.version}</span>
          </div>
          {editing === "statement" ? (
            <div className="flex flex-col gap-2">
              <textarea className="w-full rounded-md border px-3 py-2 text-sm leading-relaxed min-h-[4rem]" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
              <div className="flex gap-2">
                <Button size="sm" disabled={busy !== null} onClick={() => patch({ id: b.id, statement: draft }, "statement")}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}><X className="size-3.5" /></Button>
              </div>
            </div>
          ) : (
            <p className="font-medium leading-snug group flex items-start gap-2">
              <span>{b.statement}</span>
              {b.status !== "killed" && (
                <button className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground mt-1" onClick={() => { setEditing("statement"); setDraft(b.statement); }} aria-label="Edit statement"><Pencil className="size-3" /></button>
              )}
            </p>
          )}
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{b.mechanism}</p>
        </div>
      </header>

      <Section {...sec("boundary")} title="Boundary" count={`${b.boundaryHolds.length} holds · ${b.boundaryFails.length} fails`}>
        <div className="grid sm:grid-cols-2 gap-3">
          <ul className="flex flex-col gap-1">{b.boundaryHolds.map((x) => <li key={x} className="flex gap-1.5"><Check className="size-3.5 mt-0.5 text-emerald-600 shrink-0" /><span>{x}</span></li>)}</ul>
          <ul className="flex flex-col gap-1 text-muted-foreground">{b.boundaryFails.length ? b.boundaryFails.map((x) => <li key={x} className="flex gap-1.5"><X className="size-3.5 mt-0.5 shrink-0" /><span>{x}</span></li>) : <li className="text-amber-800">No failure condition named: not falsifiable yet.</li>}</ul>
        </div>
      </Section>
      <Section {...sec("evidence")} title="Evidence" count={`${forE.length} for · ${against.length} against`}>
        <EvidenceList items={forE} tone="for" onOpen={onOpenNode} />
        {against.length ? <EvidenceList items={against} tone="against" onOpen={onOpenNode} /> : <p className="text-xs text-amber-800 mt-2">No evidence against was cited. An empty row here is a warning sign.</p>}
        {b.supports.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            Rests on: {b.supports.filter((x) => x.type === "RESTS_ON").map((x) => <button key={x.id} className="underline decoration-dotted mr-1.5 hover:text-foreground" onClick={() => onOpenNode(x.id)}>{x.text.slice(0, 80)}{x.loadBearing ? " (load-bearing)" : ""}</button>)}
            {b.supports.some((x) => x.type === "WOULD_USE") && <> · Would use: {b.supports.filter((x) => x.type === "WOULD_USE").map((x) => x.text).join(", ")}</>}
          </p>
        )}
      </Section>
      <Section {...sec("prediction")} title="Prediction">
        <p><span className="text-muted-foreground">If true:</span> {b.predictionIfTrue}</p>
        <p><span className="text-muted-foreground">If false:</span> {b.predictionIfFalse}</p>
        {b.procedureHint && <p className="text-xs text-muted-foreground mt-1">Distinguished by: {b.procedureHint}</p>}
      </Section>
      <Section {...sec("kill")} title="Kill criteria" highlight={needsSignature && !killSigned} badge={needsSignature && !killSigned ? "needs your signature" : undefined} anchorRef={killRef}>
        {editing === "kill" ? (
          <div className="flex flex-col gap-2">
            <textarea className="w-full rounded-md border px-3 py-2 text-sm leading-relaxed min-h-[4rem]" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
            <div className="flex gap-2">
              <Button size="sm" disabled={busy !== null} onClick={() => patch({ id: b.id, killCriteria: draft }, "kill")}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}><X className="size-3.5" /></Button>
            </div>
          </div>
        ) : (
          <p className="group flex items-start gap-2">
            <span className={cn(killSigned && "font-medium")}>{b.killCriteria || "(none yet)"}</span>
            {!killSigned && b.status !== "killed" && (
              <button className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground mt-1" onClick={() => { setEditing("kill"); setDraft(b.killCriteria); }} aria-label="Edit kill criteria"><Pencil className="size-3" /></button>
            )}
          </p>
        )}
        {needsSignature && !killSigned && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/60 p-3 flex flex-col gap-2">
            <p className="text-xs text-amber-900">
              This is gate 3, the pre-registration. Trim the criterion to the one result that would make you drop the hypothesis (one or two sentences is right; the rest belongs in the boundary or the plan&apos;s controls), then sign it.
            </p>
            <textarea
              className="w-full rounded-md border bg-white px-3 py-2 text-sm leading-relaxed min-h-[5rem] focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={signDraft}
              onChange={(e) => setSignText(e.target.value)}
            />
            <label className="flex items-start gap-2 text-xs text-amber-900 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={committed} onChange={(e) => setCommitted(e.target.checked)} />
              <span>I commit, before any data is collected, to dropping this hypothesis if this result appears.</span>
            </label>
            <Button size="sm" disabled={!committed || signDraft.trim().length < 10 || busy !== null} onClick={sign} className="self-start">
              {busy === "sign" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              <span className="ml-1.5">Sign kill criteria</span>
            </Button>
          </div>
        )}
      </Section>
      <Section {...sec("chains")} title="Candidate chains and minimum viable experiment">
        {b.minimumExperiment ? <p>{b.minimumExperiment}</p> : <p className="text-xs text-muted-foreground">Filled by the hypothesis-as-query in the Experiments tab once this brief survives the attacks.</p>}
      </Section>
      <Section {...sec("rivals")} title="Rival explanations" count={rivals.length}>
        {rivals.length ? (
          <ul className="flex flex-col gap-2">{rivals.map((a) => <li key={a.id}><p>{a.text}</p>{a.control && <p className="text-xs text-muted-foreground">Control: {a.control}</p>}</li>)}</ul>
        ) : (
          <p className="text-xs text-muted-foreground">None yet. The Falsifier lists them when the brief is attacked.</p>
        )}
      </Section>
      <Section {...sec("map")} title="Map" count="papers · topics · methods · attacks · review">
        {open === "map" ? <HypothesisMapView workspaceId={workspaceId} projectId={projectId} hypothesisId={b.id} onOpen={onOpenNode} /> : null}
      </Section>
      <Section {...sec("attacks")} title="Attack log" count={b.attacks.length}>
        {b.attacks.length === 0 ? (
          <p className="text-xs text-muted-foreground">Not attacked yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {b.attacks.map((a) => (
              <li key={a.id} className="text-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-muted px-2 py-0.5">{ATTACK_LABEL[a.kind] ?? a.kind}</span>
                  <span className="text-muted-foreground">round {a.round}</span>
                  <span className={cn("font-medium", ATTACK_TONE[a.status])}>{a.status}</span>
                  {a.decidedBy && <span className="text-muted-foreground">(your decision)</span>}
                  <span className="ml-auto flex gap-1">
                    {(["answered", "open", "fatal"] as const).filter((x) => x !== a.status).map((x) => (
                      <button key={x} className="text-muted-foreground hover:text-foreground underline decoration-dotted" disabled={busy !== null} onClick={() => patch({ attackId: a.id, status: x }, "attack")}>mark {x}</button>
                    ))}
                  </span>
                </div>
                <p className="mt-1 flex items-start gap-1.5"><Swords className="size-3.5 mt-0.5 shrink-0 text-rose-600" /><span>{a.text}</span></p>
                {a.control && <p className="text-xs text-muted-foreground ml-5">Control: {a.control}</p>}
                {a.killCriterion && <p className="text-xs text-muted-foreground ml-5">Sharper kill criterion: {a.killCriterion}</p>}
                {a.answer ? <p className="mt-1 ml-5 text-slate-700 flex items-start gap-1.5"><ShieldAlert className="size-3.5 mt-0.5 shrink-0 text-sky-600" /><span>{a.answer}</span></p> : <p className="mt-1 ml-5 text-xs text-muted-foreground">No answer yet.</p>}
                {a.cites.length > 0 && <p className="text-[11px] text-muted-foreground ml-5">cites {a.cites.map((c) => <button key={c} className="underline decoration-dotted mr-1" onClick={() => onOpenNode(c)}>{c.split(":").slice(-1)[0]}</button>)}</p>}
              </li>
            ))}
          </ul>
        )}
        {["selected", "attacked", "survived"].includes(b.status) && (
          <Button size="sm" variant="outline" className="mt-3" disabled={busy !== null} onClick={attackAgain}>
            {busy === "attack" ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
            <span className="ml-1.5">Another attack round</span>
          </Button>
        )}
      </Section>
    </article>
  );
}

function EvidenceList({ items, tone, onOpen }: { items: BriefView["evidence"]; tone: "for" | "against"; onOpen: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((e) => (
        <li key={e.id} className="flex gap-2 text-sm">
          <span className={cn("mt-1.5 inline-block size-2 rounded-full shrink-0", tone === "for" ? "bg-emerald-500" : "bg-rose-500")} />
          <button className="text-left hover:underline decoration-dotted" onClick={() => onOpen(e.id)}>
            {e.text}
            <span className="text-xs text-muted-foreground"> — {e.paper.slice(0, 60)}{e.year ? ` (${e.year})` : ""}{e.page ? `, p.${e.page}` : ""}{e.section ? `, ${e.section}` : ""}{e.speculative ? ", speculative" : ""}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** One collapsible section of a brief. Module-level so React keeps its editor mounted while typing. */
function Section({
  title,
  count,
  open,
  onToggle,
  highlight,
  badge,
  anchorRef,
  children,
}: {
  title: string;
  count?: number | string;
  open: boolean;
  onToggle: () => void;
  /** The loop is waiting on this section: amber ring and a pulse until it is dealt with */
  highlight?: boolean;
  badge?: string;
  anchorRef?: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  return (
    <div ref={anchorRef} className={cn("border-t", highlight && "bg-amber-50/50 ring-2 ring-inset ring-amber-400/70")}>
      <button className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm hover:bg-accent/40" onClick={onToggle}>
        {open ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
        <span className={cn("font-medium", highlight && "text-amber-900")}>{title}</span>
        {count !== undefined && <span className="text-xs text-muted-foreground tabular-nums">{count}</span>}
        {badge && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
            <span className="inline-block size-1.5 rounded-full bg-amber-500 animate-pulse" />
            {badge}
          </span>
        )}
      </button>
      {open && <div className="px-9 pb-3 text-sm">{children}</div>}
    </div>
  );
}
