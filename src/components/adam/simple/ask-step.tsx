"use client";

import { Button } from "@/components/ui/button";
import type { ProjectStatus } from "@/lib/adam/status";
import { editQuestion, enqueueAdamJob, passGate, sendQuestionBack, updateAdamProject } from "@/lib/hooks/use-adam";
import { cn } from "@/lib/utils";
import { Check, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Step 1 · Ask. Three plain questions, one button to scope, then the scoped question in editable
 * form and one button to start reading. The seeds, vocabulary and scope-fence details live in the
 * advanced view.
 */
export function AskStep({ workspaceId, status, onNext }: { workspaceId: string; status: ProjectStatus; onNext: () => void }) {
  const project = status.project;
  const page = status.questionPage;
  const projectId = project.id;
  const [topic, setTopic] = useState(project.topic);
  const [understanding, setUnderstanding] = useState(project.understanding);
  const [lab, setLab] = useState(labText(project.constraints));
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const scoping = status.jobs.recent.some((j) => j.kind === "scope" && (j.status === "queued" || j.status === "running"));
  const approved = !!page?.approvedAt;

  // Keep local drafts in sync when another tab or pass changes the project (reset on prop change, during render)
  const [seen, setSeen] = useState({ topic: project.topic, understanding: project.understanding });
  if (seen.topic !== project.topic || seen.understanding !== project.understanding) {
    setSeen({ topic: project.topic, understanding: project.understanding });
    setTopic(project.topic);
    setUnderstanding(project.understanding);
  }

  const save = async (patch: Record<string, unknown>) => {
    try {
      await updateAdamProject(workspaceId, projectId, patch);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    }
  };
  const run = async (label: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(label);
    try {
      await fn();
      if (done) toast.success(done);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-lg border bg-white p-5 flex flex-col gap-4">
        <Field label="What do you want to find out?" hint="A topic, a question, or a hunch. A paragraph is fine.">
          <textarea className={area} value={topic} onChange={(e) => setTopic(e.target.value)} onBlur={() => topic !== project.topic && save({ topic })} placeholder="e.g. Can a SiC-in-glass composite give a brighter, more stable display emitter than the current phosphors?" disabled={approved} />
        </Field>
        <Field label="What do you already believe?" hint="Optional. Adam will try to break it later, which is the point.">
          <textarea className={area} value={understanding} onChange={(e) => setUnderstanding(e.target.value)} onBlur={() => understanding !== project.understanding && save({ understanding })} placeholder="e.g. The emission is limited by surface defects, not by the SiC itself." disabled={approved} />
        </Field>
        <Field label="What can your lab do?" hint="Equipment, data, skills, time, budget, in plain words. Used to say which experiments are feasible for you.">
          <textarea className={cn(area, "min-h-[4rem]")} value={lab} onChange={(e) => setLab(e.target.value)} onBlur={() => lab !== labText(project.constraints) && save({ constraints: parseLab(lab, project.constraints) })} placeholder="e.g. XRD, Raman, integrating-sphere PL; 12 weeks; about $5,000; no TEM" disabled={approved} />
        </Field>
        {!page && (
          <Button onClick={() => run("scope", () => enqueueAdamJob(workspaceId, projectId, "scope", `pass-${project.pass}`, {}, false), "Scoping: Adam is writing your question page")} disabled={busy !== null || scoping || topic.trim().length < 8} className="self-start">
            {busy === "scope" || scoping ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            <span className="ml-1.5">{scoping ? "Scoping…" : "Scope it"}</span>
          </Button>
        )}
      </section>

      {page && (
        <section className="rounded-lg border bg-white p-5 flex flex-col gap-4">
          <div>
            <h3 className="font-medium">Here is what Adam will look for</h3>
            <p className="text-xs text-muted-foreground">Edit anything. Your words outrank Adam&apos;s.</p>
          </div>
          <Field label="The hunch">
            <Editable value={page.hunch} disabled={approved} onSave={(hunch) => editQuestion(workspaceId, projectId, { hunch })} />
          </Field>
          <Field label="The questions to answer">
            <ol className="flex flex-col gap-2 list-decimal pl-5">
              {page.subquestions.map((q, i) => (
                <li key={q.id}>
                  <Editable
                    value={q.text}
                    disabled={approved}
                    onSave={(text) => editQuestion(workspaceId, projectId, { subquestions: page.subquestions.map((x, j) => (j === i ? { ...x, text } : x)) })}
                  />
                  {page.checks?.subquestions.find((c) => c.id === q.id && !c.answerable)?.issue && (
                    <p className="text-xs text-amber-800 mt-0.5">Scope check: {page.checks.subquestions.find((c) => c.id === q.id)?.issue}</p>
                  )}
                </li>
              ))}
            </ol>
          </Field>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-1">In scope</p>
              <ul className="flex flex-wrap gap-1">{page.scopeFence.inside.map((x) => <li key={x} className="rounded-full bg-emerald-50 text-emerald-800 px-2 py-0.5 text-xs">{x}</li>)}</ul>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Out of scope</p>
              <ul className="flex flex-wrap gap-1">{page.scopeFence.outside.map((x) => <li key={x} className="rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-xs">{x}</li>)}</ul>
            </div>
          </div>
          {approved ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1 text-emerald-700"><Check className="size-4" /> Scope approved. Adam is reading.</span>
              <Button size="sm" variant="outline" onClick={onNext}>See progress</Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => run("approve", () => passGate(workspaceId, projectId, "scope"), "Reading started").then(onNext)} disabled={busy !== null}>
                {busy === "approve" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                <span className="ml-1.5">Looks right, start reading</span>
              </Button>
              <div className="flex items-center gap-2 ml-auto">
                <input className="rounded-md border px-2 py-1 text-sm w-64" placeholder="Not quite? Tell Adam what to change" value={note} onChange={(e) => setNote(e.target.value)} />
                <Button size="sm" variant="outline" disabled={busy !== null || scoping || note.trim().length < 3} onClick={() => run("rewrite", () => sendQuestionBack(workspaceId, projectId, note).then(() => setNote("")), "Adam is rewriting the page")}>
                  {busy === "rewrite" || scoping ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  <span className={busy === "rewrite" ? "ml-1.5" : ""}>Rewrite</span>
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

const area = "w-full rounded-md border bg-white px-3 py-2 text-sm leading-relaxed min-h-[5rem] focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-muted/30";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="text-xs text-muted-foreground -mt-1">{hint}</span>}
      {children}
    </label>
  );
}

/** A line of text that edits in place and saves on blur. */
function Editable({ value, disabled, onSave }: { value: string; disabled?: boolean; onSave: (v: string) => Promise<unknown> }) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  return (
    <textarea
      className={cn(area, "min-h-[2.5rem]")}
      rows={Math.max(1, Math.ceil(draft.length / 110))}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft.trim() !== value.trim() && draft.trim() && onSave(draft.trim()).catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't save"))}
    />
  );
}

type C = ProjectStatus["project"]["constraints"];

function labText(c: C): string {
  const parts = [...c.equipment, ...c.data, ...c.skills];
  if (c.timeWeeks) parts.push(`${c.timeWeeks} weeks`);
  if (c.budgetUsd) parts.push(`$${c.budgetUsd}`);
  return parts.join(", ");
}

/** Plain words into the structured constraints: time and money are picked out, everything else is equipment. */
function parseLab(text: string, prev: C): C {
  const items = text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  const out: C = { equipment: [], data: prev.data, skills: prev.skills, timeWeeks: null, budgetUsd: null };
  for (const it of items) {
    const weeks = it.match(/^(\d+(?:\.\d+)?)\s*(weeks?|wks?)$/i);
    const months = it.match(/^(\d+(?:\.\d+)?)\s*months?$/i);
    const money = it.match(/^(?:about\s+|~\s*)?\$\s?([\d,]+(?:\.\d+)?)\s*(k)?$/i) ?? it.match(/^([\d,]+(?:\.\d+)?)\s*(k)?\s*(?:usd|dollars)$/i);
    if (weeks) out.timeWeeks = Number(weeks[1]);
    else if (months) out.timeWeeks = Math.round(Number(months[1]) * 4.33);
    else if (money) out.budgetUsd = Math.round(Number(money[1].replace(/,/g, "")) * (money[2] ? 1000 : 1));
    else out.equipment.push(it);
  }
  return out;
}
