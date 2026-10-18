"use client";

import type { BriefView } from "@/app/api/adam/[projectId]/hypotheses/route";
import { Button } from "@/components/ui/button";
import type { ProjectStatus } from "@/lib/adam/status";
import { passGate, refreshAdam } from "@/lib/hooks/use-adam";
import { cn } from "@/lib/utils";
import { Check, Loader2, Skull, Swords } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";

const key = (workspaceId: string, projectId: string) => `/api/adam/${projectId}/hypotheses?workspaceId=${workspaceId}`;
const fetcher = async (url: string) => {
  const r = await fetch(url);
  const b = await r.json();
  if (!r.ok) throw new Error(b.error ?? "Couldn't load the hypotheses");
  return b as { briefs: BriefView[] };
};

/**
 * Step 3 · Pick. Each hypothesis is one card: the claim, why, how much is for and against it,
 * and the one thing to do with it right now. Choosing starts the attacks; when a hypothesis
 * survives them you confirm, in one sentence, what would make you drop it. The full brief,
 * the attack log and the map are in the advanced view.
 */
export function PickStep({ workspaceId, status, onNext }: { workspaceId: string; status: ProjectStatus; onNext: () => void }) {
  const projectId = status.project.id;
  const live = status.project.status === "running";
  const { data, error } = useSWR(key(workspaceId, projectId), fetcher, { refreshInterval: live ? 6000 : 0, keepPreviousData: true });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [kill, setKill] = useState<Record<string, string>>({});
  const refresh = () => Promise.all([mutate(key(workspaceId, projectId)), refreshAdam(workspaceId, projectId)]);

  // Briefs are living documents: show the newest pass that has any, which on a fresh pass is still the previous one
  const latestPass = Math.max(0, ...(data?.briefs ?? []).map((b) => b.pass));
  const briefs = (data?.briefs ?? []).filter((b) => b.pass === latestPass);
  const choosing = status.project.phase === "hypothesise";
  const writing = status.jobs.recent.some((j) => j.kind === "write_hypotheses" && (j.status === "queued" || j.status === "running"));

  const run = async (label: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(label);
    try {
      await fn();
      await refresh();
      if (done) toast.success(done);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  if (error) return <p className="text-sm text-red-700">{error.message}</p>;
  if (!data) return <p className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center"><Loader2 className="size-4 animate-spin" /> Loading…</p>;
  if (!briefs.length) {
    return (
      <div className="rounded-lg border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">
        {writing ? <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Adam is writing hypotheses from what it read…</span> : "No hypotheses yet. They appear once the reading is done."}
      </div>
    );
  }

  const ready = briefs.filter((b) => b.killSignedAt && (b.status === "survived" || b.status === "confirmed")).length;

  return (
    <div className="flex flex-col gap-4">
      {choosing && (
        <p className="text-sm text-muted-foreground">
          Adam found {briefs.length} competing hypotheses. Choose the ones worth your lab&apos;s time; Adam then tries to break each one.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {briefs.map((b) => {
          const forN = b.evidence.filter((e) => e.type === "EVIDENCE_FOR").length;
          const againstN = b.evidence.filter((e) => e.type === "EVIDENCE_AGAINST").length;
          const open = b.attacks.filter((a) => a.status === "open").length;
          const fatal = b.attacks.filter((a) => a.status === "fatal").length;
          const answered = b.attacks.filter((a) => a.status === "answered").length;
          const isPicked = picked.has(b.id);
          const signed = !!b.killSignedAt;
          return (
            <li key={b.id} className={cn("rounded-lg border bg-white p-4 flex flex-col gap-3", (b.status === "killed") && "opacity-60", isPicked && "ring-2 ring-primary/30")}>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge status={b.status} />
                <span className="text-muted-foreground">{forN} for · {againstN} against{b.attacks.length ? ` · ${answered} attacks answered${open ? `, ${open} open` : ""}${fatal ? `, ${fatal} fatal` : ""}` : ""}</span>
              </div>
              <p className="font-medium leading-snug">{b.statement}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{b.mechanism.length > 320 ? `${b.mechanism.slice(0, 320)}…` : b.mechanism}</p>

              {b.status === "draft" && choosing && (
                <Button size="sm" variant={isPicked ? "default" : "outline"} className="self-start" onClick={() => setPicked((s) => { const n = new Set(s); if (n.has(b.id)) n.delete(b.id); else n.add(b.id); return n; })}>
                  {isPicked ? <Check className="size-3.5" /> : null}<span className={isPicked ? "ml-1.5" : ""}>{isPicked ? "Chosen" : "Choose this one"}</span>
                </Button>
              )}
              {(b.status === "selected" || b.status === "attacked") && (
                <p className="text-sm text-amber-800 inline-flex items-center gap-1.5"><Swords className="size-4" /> Adam is trying to break it{b.convergenceRounds ? ` · round ${b.convergenceRounds + 1}` : ""}. You will confirm the kill criteria when it survives.</p>
              )}
              {b.status === "survived" && !signed && (
                <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 flex flex-col gap-2">
                  <p className="text-sm font-medium text-amber-900">It survived {b.convergenceRounds || "the"} rounds of attack. I&apos;ll drop this hypothesis if:</p>
                  <textarea className="w-full rounded-md border bg-white px-3 py-2 text-sm leading-relaxed min-h-[4rem] focus:outline-none focus:ring-2 focus:ring-primary/30" value={kill[b.id] ?? b.killCriteria} onChange={(e) => setKill((k) => ({ ...k, [b.id]: e.target.value }))} />
                  <p className="text-xs text-amber-900/80">One or two sentences: the result that would settle it. This is recorded before any data is collected.</p>
                  <Button size="sm" className="self-start" disabled={busy !== null || (kill[b.id] ?? b.killCriteria).trim().length < 10} onClick={() => run(`kill:${b.id}`, () => passGate(workspaceId, projectId, "kill", { hypothesisId: b.id, killCriteria: (kill[b.id] ?? b.killCriteria).trim() }), "Confirmed. Adam is designing the experiment.")}>
                    {busy === `kill:${b.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}<span className="ml-1.5">Confirm</span>
                  </Button>
                </div>
              )}
              {b.status === "survived" && signed && (
                <p className="text-sm text-emerald-700 inline-flex items-center gap-1.5"><Check className="size-4" /> You confirmed what would prove it wrong. Next: run the experiment.</p>
              )}
              {b.status === "confirmed" && <p className="text-sm text-emerald-800 inline-flex items-center gap-1.5"><Check className="size-4" /> Confirmed by your experiment.</p>}
              {b.status === "killed" && <p className="text-sm text-rose-700 inline-flex items-center gap-1.5"><Skull className="size-4" /> Dropped{b.stateReason ? `: ${b.stateReason === "observed" ? "the kill result appeared in your experiment" : b.stateReason.replace(/_/g, " ")}` : ""}.</p>}
            </li>
          );
        })}
      </ul>

      {choosing && (
        <div className="sticky bottom-3 rounded-lg border bg-white/95 backdrop-blur p-3 flex items-center gap-3 shadow-sm">
          <span className="text-sm text-muted-foreground">{picked.size ? `${picked.size} chosen` : "Choose at least one"}</span>
          <Button className="ml-auto" disabled={!picked.size || busy !== null} onClick={() => run("select", () => passGate(workspaceId, projectId, "select", { hypothesisIds: [...picked] }), "Adam is attacking your choice")}>
            {busy === "select" ? <Loader2 className="size-3.5 animate-spin" /> : <Swords className="size-3.5" />}<span className="ml-1.5">Let Adam try to break {picked.size === 1 ? "it" : "them"}</span>
          </Button>
        </div>
      )}
      {ready > 0 && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">{ready} hypothesis{ready === 1 ? " is" : "es are"} ready to test.</span>
          <Button size="sm" onClick={onNext}>Go to the experiment</Button>
        </div>
      )}
    </div>
  );
}

function Badge({ status }: { status: BriefView["status"] }) {
  const map: Record<BriefView["status"], [string, string]> = {
    draft: ["Candidate", "bg-slate-100 text-slate-700"],
    selected: ["Chosen", "bg-sky-50 text-sky-700"],
    attacked: ["Under attack", "bg-amber-50 text-amber-800"],
    survived: ["Survived the attacks", "bg-emerald-50 text-emerald-700"],
    confirmed: ["Confirmed by experiment", "bg-emerald-100 text-emerald-800"],
    killed: ["Dropped", "bg-rose-50 text-rose-700"],
  };
  const [label, tone] = map[status] ?? [status, "bg-slate-100 text-slate-700"];
  return <span className={cn("rounded-full px-2 py-0.5", tone)}>{label}</span>;
}
