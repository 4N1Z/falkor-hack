"use client";

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
import { Input } from "@/components/ui/input";
import type { QuestionPage } from "@/lib/adam/question-page";
import type { ProjectStatus } from "@/lib/adam/status";
import { editQuestion, enqueueAdamJob, passGate, sendQuestionBack, updateAdamProject } from "@/lib/hooks/use-adam";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, Loader2, Pencil, RotateCw, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const textarea =
  "w-full rounded-md border bg-white px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[6rem]";

/**
 * Phase 0 · Question. The researcher's brief (topic, understanding, constraints) on the left,
 * the Scoper's page on the right, with the scope checker's flags inline. Gate 1 lives here:
 * nothing is read until the page is approved.
 */
export function QuestionTab({ workspaceId, status }: { workspaceId: string; status: ProjectStatus }) {
  const { project, questionPage: page } = status;
  const [topic, setTopic] = useState(project.topic);
  const [understanding, setUnderstanding] = useState(project.understanding);
  const [equipment, setEquipment] = useState(project.constraints.equipment.join(", "));
  const [data, setData] = useState(project.constraints.data.join(", "));
  const [skills, setSkills] = useState(project.constraints.skills.join(", "));
  const [timeWeeks, setTimeWeeks] = useState(project.constraints.timeWeeks?.toString() ?? "");
  const [budgetUsd, setBudgetUsd] = useState(project.constraints.budgetUsd?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [working, setWorking] = useState<"scope" | "approve" | "back" | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    setTopic(project.topic);
    setUnderstanding(project.understanding);
  }, [project.id, project.topic, project.understanding]);

  const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  const dirty =
    topic !== project.topic ||
    understanding !== project.understanding ||
    equipment !== project.constraints.equipment.join(", ") ||
    data !== project.constraints.data.join(", ") ||
    skills !== project.constraints.skills.join(", ") ||
    timeWeeks !== (project.constraints.timeWeeks?.toString() ?? "") ||
    budgetUsd !== (project.constraints.budgetUsd?.toString() ?? "");

  const save = async () => {
    setSaving(true);
    try {
      await updateAdamProject(workspaceId, project.id, {
        topic,
        understanding,
        constraints: {
          equipment: list(equipment),
          data: list(data),
          skills: list(skills),
          timeWeeks: timeWeeks ? Number(timeWeeks) : null,
          budgetUsd: budgetUsd ? Number(budgetUsd) : null,
        },
      });
      toast.success("Brief saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const runScoper = async () => {
    setWorking("scope");
    try {
      if (dirty) await save();
      await enqueueAdamJob(workspaceId, project.id, "scope", `pass-${project.pass}`, {}, !!page);
      toast("Scoper queued", { description: "It writes the question page from your brief; the checker reviews it." });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't queue the Scoper");
    } finally {
      setWorking(null);
    }
  };

  const approve = async () => {
    setWorking("approve");
    try {
      await passGate(workspaceId, project.id, "scope");
      toast.success("Scope approved", { description: "The Searcher starts sweeping the literature." });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't approve");
    } finally {
      setWorking(null);
    }
  };

  const back = async () => {
    setWorking("back");
    try {
      await sendQuestionBack(workspaceId, project.id, note);
      setNote("");
      toast("Sent back", { description: "The Scoper rewrites the page with your note." });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send back");
    } finally {
      setWorking(null);
    }
  };

  const scoperPending = status.jobs.recent.some((j) => j.kind === "scope" && (j.status === "queued" || j.status === "running"));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section className="rounded-lg border bg-white p-4 flex flex-col gap-3">
        <header className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Your brief</h2>
          <span className="text-xs text-muted-foreground">What the Scoper reads</span>
        </header>
        <label className="text-xs font-medium text-muted-foreground">Topic</label>
        <textarea className={textarea} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="The topic, in a sentence or a paragraph" />
        <label className="text-xs font-medium text-muted-foreground">Current understanding</label>
        <textarea
          className={cn(textarea, "min-h-[9rem]")}
          value={understanding}
          onChange={(e) => setUnderstanding(e.target.value)}
          placeholder="What you believe, what you have read, what you suspect is wrong in the field"
        />
        <label className="text-xs font-medium text-muted-foreground">Constraints (decide which chains are feasible)</label>
        <div className="grid grid-cols-1 gap-2">
          <Input value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="Equipment, comma-separated" />
          <Input value={data} onChange={(e) => setData(e.target.value)} placeholder="Data you have access to" />
          <Input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Skills in the lab" />
          <div className="grid grid-cols-2 gap-2">
            <Input value={timeWeeks} onChange={(e) => setTimeWeeks(e.target.value)} placeholder="Time (weeks)" inputMode="numeric" />
            <Input value={budgetUsd} onChange={(e) => setBudgetUsd(e.target.value)} placeholder="Budget (USD)" inputMode="numeric" />
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={save} disabled={!dirty || saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            <span className="ml-1.5">Save brief</span>
          </Button>
          <Button size="sm" onClick={runScoper} disabled={working !== null || scoperPending || topic.trim().length < 8}>
            {working === "scope" || scoperPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            <span className="ml-1.5">{page ? "Rewrite question page" : "Write question page"}</span>
          </Button>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4 flex flex-col gap-3 min-w-0">
        <header className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Question page · pass {project.pass}</h2>
          {page?.approvedAt ? (
            <span className="text-xs rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Approved</span>
          ) : page ? (
            <span className={cn("text-xs rounded-full px-2 py-0.5 ring-1 ring-inset", page.checks?.ready === false ? "bg-amber-50 text-amber-700 ring-amber-600/20" : "bg-sky-50 text-sky-700 ring-sky-600/20")}>
              {page.checks?.ready === false ? "Checker flagged issues" : "Ready for your decision"}
            </span>
          ) : null}
        </header>

        {!page ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {scoperPending ? "The Scoper is writing the page…" : "No page yet. Save your brief and write the question page, or press Run."}
          </p>
        ) : (
          <PageView workspaceId={workspaceId} projectId={project.id} page={page} editable={!page.approvedAt} />
        )}

        {page && !page.approvedAt && (
          <footer className="flex flex-wrap items-center gap-2 pt-2 border-t">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" disabled={working !== null}>
                  <Check className="size-3.5" />
                  <span className="ml-1.5">Approve scope</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Approve this question page?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This is gate 1. Agents cannot pass it: the question is where your intuition and the field&apos;s taste live. Once approved, the
                    Searcher sweeps the literature inside this fence and the Extractor reads what it finds. You can redraw the fence at any time.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Not yet</AlertDialogCancel>
                  <AlertDialogAction onClick={approve}>Approve and start the sweep</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <div className="flex-1 flex items-center gap-2 min-w-[16rem]">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Send back with a note for the Scoper…" />
              <Button size="sm" variant="outline" onClick={back} disabled={working !== null || note.trim().length < 3}>
                {working === "back" ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
                <span className="ml-1.5">Send back</span>
              </Button>
            </div>
          </footer>
        )}
      </section>
    </div>
  );
}

/** The page itself. Each block is editable in place; a saved edit is human_approved and outranks the agent's text. */
function PageView({ workspaceId, projectId, page, editable }: { workspaceId: string; projectId: string; page: QuestionPage; editable: boolean }) {
  const [editing, setEditing] = useState<null | "hunch" | "why" | "subquestions" | "fence" | "vocab">(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const begin = (what: typeof editing, text: string) => {
    setEditing(what);
    setDraft(text);
  };
  const commit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const lines = draft.split("\n").map((l) => l.trim()).filter(Boolean);
      const patch: Partial<QuestionPage> =
        editing === "hunch"
          ? { hunch: draft.trim() }
          : editing === "why"
            ? { why: draft.trim() }
            : editing === "subquestions"
              ? { subquestions: lines.map((text, i) => ({ id: page.subquestions[i]?.id ?? `q${i + 1}`, text: text.replace(/^q?\d+[.)]\s*/i, ""), answerableBy: page.subquestions[i]?.answerableBy ?? "" })) }
              : editing === "fence"
                ? {
                    scopeFence: {
                      inside: lines.filter((l) => !l.startsWith("-")).map((l) => l.replace(/^\+\s*/, "")),
                      outside: lines.filter((l) => l.startsWith("-")).map((l) => l.replace(/^-\s*/, "")),
                    },
                  }
                : { vocabulary: { ...page.vocabulary, terms: draft.split(",").map((t) => t.trim()).filter(Boolean) } };
      await editQuestion(workspaceId, projectId, patch);
      setEditing(null);
      toast.success("Saved as your version");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const Block = ({ id, title, text, children }: { id: NonNullable<typeof editing>; title: string; text: string; children: React.ReactNode }) => (
    <div className="group">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {editable && editing !== id && (
          <button className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground" onClick={() => begin(id, text)} aria-label={`Edit ${title}`}>
            <Pencil className="size-3" />
          </button>
        )}
      </div>
      {editing === id ? (
        <div className="mt-1 flex flex-col gap-2">
          <textarea className={textarea} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
          <div className="flex gap-2">
            <Button size="sm" onClick={commit} disabled={saving}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              <span className="ml-1.5">Save</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-1 text-sm leading-relaxed">{children}</div>
      )}
    </div>
  );

  const checkFor = (id: string) => page.checks?.subquestions.find((c) => c.id === id);

  return (
    <div className="flex flex-col gap-4">
      <Block id="hunch" title="Hunch" text={page.hunch}>
        <p className="font-medium">{page.hunch}</p>
      </Block>
      <Block id="why" title="Why it matters" text={page.why}>
        <p className="text-muted-foreground">{page.why}</p>
      </Block>
      <Block id="subquestions" title="Sub-questions" text={page.subquestions.map((q) => q.text).join("\n")}>
        <ol className="flex flex-col gap-2">
          {page.subquestions.map((q, i) => {
            const c = checkFor(q.id);
            return (
              <li key={q.id} className="flex gap-2">
                <span className="text-muted-foreground tabular-nums shrink-0">{i + 1}.</span>
                <div>
                  <p>{q.text}</p>
                  {q.answerableBy && <p className="text-xs text-muted-foreground mt-0.5">Settled by: {q.answerableBy}</p>}
                  {c && !c.answerable && (
                    <p className="mt-1 text-xs text-amber-700 flex items-start gap-1">
                      <AlertTriangle className="size-3 mt-0.5 shrink-0" />
                      <span>Checker: {c.issue ?? "no experiment could settle this"}</span>
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </Block>
      <Block id="vocab" title="Search vocabulary" text={page.vocabulary.terms.join(", ")}>
        <div className="flex flex-wrap gap-1.5">
          {page.vocabulary.terms.map((t) => (
            <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs">{t}</span>
          ))}
        </div>
        {page.vocabulary.adjacentTerms.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-muted-foreground mb-1">In neighbouring fields:</p>
            <div className="flex flex-wrap gap-1.5">
              {page.vocabulary.adjacentTerms.map((t) => (
                <span key={`${t.term}-${t.field}`} className="rounded-full bg-sky-50 text-sky-800 px-2 py-0.5 text-xs" title={t.field}>
                  {t.term} <span className="text-sky-600/70">· {t.field}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </Block>
      <Block id="fence" title="Scope fence" text={[...page.scopeFence.inside.map((x) => `+ ${x}`), ...page.scopeFence.outside.map((x) => `- ${x}`)].join("\n")}>
        <div className="grid sm:grid-cols-2 gap-3">
          <ul className="flex flex-col gap-1">
            {page.scopeFence.inside.map((x) => (
              <li key={x} className="flex gap-1.5"><Check className="size-3.5 mt-0.5 text-emerald-600 shrink-0" /><span>{x}</span></li>
            ))}
          </ul>
          <ul className="flex flex-col gap-1 text-muted-foreground">
            {page.scopeFence.outside.map((x) => (
              <li key={x} className="flex gap-1.5"><X className="size-3.5 mt-0.5 shrink-0" /><span>{x}</span></li>
            ))}
          </ul>
        </div>
        {page.checks?.fenceIssues.length ? (
          <ul className="mt-2 flex flex-col gap-1">
            {page.checks.fenceIssues.map((f) => (
              <li key={f} className="text-xs text-amber-700 flex items-start gap-1"><AlertTriangle className="size-3 mt-0.5 shrink-0" /><span>Checker: {f}</span></li>
            ))}
          </ul>
        ) : null}
      </Block>
    </div>
  );
}
