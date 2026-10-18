"use client";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { CircleHelp } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * The how-to-use sheet for Adam: purpose, inputs, the phases with what each needs from you,
 * the three gates, outputs, runtime requirements and cost, and what each stop means. Shown in
 * full before the first project and behind a "How it works" button afterwards (opened once
 * automatically on a first visit).
 */

const PHASES: { n: number; phase: string; tab: string; agents: string; produces: string; endsWhen: string; you: string }[] = [
  { n: 1, phase: "Question", tab: "Question", agents: "Scoper + scope checker", produces: "Question page: hunch, 3–5 sub-questions, vocabulary, scope fence", endsWhen: "You approve the scope", you: "Gate 1 · edit, then Approve scope" },
  { n: 2, phase: "Sweep", tab: "Sweep", agents: "Searcher + triage + coverage checker", produces: "Papers in three rings (seed, citation, adjacent), each labelled core / method only / contradicts / background; core papers read in full", endsWhen: "Rings done and coverage above threshold, or the second citation round has run", you: "Nothing. Supply a PDF for an abstract-only core paper if you have one" },
  { n: 3, phase: "Extract", tab: "Extraction queue", agents: "Two extractors (slots A and B) + verifier", produces: "Claims, evidence, methods, assumptions, limitations, gaps, each with chunk id and verbatim quote; cross-paper contradictions", endsWhen: "Every core paper has a verified card", you: "Review the exceptions only; or run Auto-review and apply its proposal" },
  { n: 4, phase: "Methods", tab: "Methods", agents: "Methods Hunter + runnability checker", produces: "A Procedure per method: inputs, outputs, equipment, time, cost, reliability, feasibility against your constraints", endsWhen: "Every method used by a verified claim has a procedure, or the remainder is deferred", you: "Nothing. Hunt again with a note when one is thin" },
  { n: 5, phase: "Connect", tab: "Hypotheses", agents: "Graph Analyst + sanity checker", produces: "Candidates: holes between communities, conflicts, load-bearing assumptions", endsWhen: "The Analyst has run for the pass", you: "Nothing" },
  { n: 6, phase: "Hypothesise", tab: "Hypotheses", agents: "Hypothesis Writer", produces: "2–4 competing briefs: statement, mechanism, boundary, evidence for and against, prediction, kill criteria", endsWhen: "You select", you: "Gate 2 · tick the briefs worth pursuing, Select" },
  { n: 7, phase: "Attack", tab: "Hypotheses", agents: "Falsifier ↔ Writer", produces: "Attack log: pre-mortem, dependency, rival, null/ablation, baseline, boundary; each answered, open or fatal", endsWhen: "Two rounds with nothing new open (survived), or a fatal attack (killed)", you: "Gate 3 · sign the kill criteria of each survivor" },
  { n: 8, phase: "Experiment", tab: "Experiments", agents: "Hypothesis-as-query + Experiment Designer + design checker", produces: "Procedure chains to the predicted result, ranked by cost to kill; gaps and rival chains; a plan with controls", endsWhen: "You approve a plan", you: "Approve the plan. Query any hypothesis directly in the search box" },
  { n: 9, phase: "Saturate", tab: "Saturation", agents: "Saturation + Scoper (next pass)", produces: "New-nodes-per-paper per sub-question; the pass write-up as a document in the Adam folder", endsWhen: "Clusters saturated, budget spent, or you stop", you: "Write up, start pass N+1, or schedule a re-sweep" },
];

const GATES = [
  { gate: "1 · Scope", where: "Question tab", why: "An agent searches what is easy to find, not what you need.", how: "Edit the question page, then Approve scope. Your edits outrank the agent's." },
  { gate: "2 · Selection", where: "Hypotheses tab", why: "Agents drift toward safe ideas already in the literature.", how: "Tick the briefs worth pursuing, then Select. Unselected briefs stay as drafts." },
  { gate: "3 · Kill criteria", where: "Hypotheses tab, the highlighted section", why: "A hypothesis without a committed failure condition is not a hypothesis.", how: "Trim the criterion to the one result that would make you drop it, tick the commitment, sign." },
];

const INPUTS = [
  { field: "Title and topic", use: "Names the project; the topic seeds the Scoper" },
  { field: "Current understanding", use: "What you already believe; the Falsifier may attack it later" },
  { field: "Constraints", use: "Equipment, data, skills, time, budget: used for feasibility of every procedure" },
  { field: "Seed papers", use: "Library papers marked trusted or distrusted; trusted seeds start the sweep" },
  { field: "PDFs", use: "Any open-access PDF is fetched; upload one for a core paper that is abstract-only" },
];

const OUTPUTS = [
  { what: "Knowledge graph", where: "Knowledge tab, Research graph, Neura AI chat, MCP", note: "Claims, evidence, methods, assumptions, procedures, results; every item carries its paper, page, section and quote" },
  { what: "Methods dossier", where: "Methods tab", note: "Procedures with runnability and feasibility; missing items listed" },
  { what: "Hypothesis briefs + attack log", where: "Hypotheses tab, each with a Map", note: "Living documents: new evidence updates them and flags you when kill criteria are affected" },
  { what: "Experiment plans", where: "Experiments tab", note: "Chains ordered cheapest-to-kill; gaps become open questions" },
  { what: "Pass write-up", where: "Adam folder in the workspace", note: "A document with provenance links, for collaborators" },
];

const STATUS = [
  { state: "Running", meaning: "Agents are working; counts refresh every few seconds." },
  { state: "Blocked on gate", meaning: "One of your three decisions is due. The tab that needs you shows an amber dot." },
  { state: "Paused", meaning: "It stopped on purpose. The Activity tab holds the reason; Resume continues from where it stopped." },
  { state: "To review", meaning: "Open items in the extraction queue. It never blocks a phase." },
  { state: "Jobs", meaning: "Queued and running work. Nothing moving for minutes means no worker, or a worker without an OpenAlex key; failures are in Activity with their reason." },
];


function Table({ head, rows, widths }: { head: string[]; rows: (string | number)[][]; widths?: string[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="w-full text-[13px] leading-relaxed">
        <thead>
          <tr className="bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            {head.map((h, i) => <th key={h} className={cn("px-3 py-2 font-medium", widths?.[i])}>{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {r.map((c, j) => <td key={j} className={cn("px-3 py-2", j === 0 && "font-medium whitespace-nowrap")}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-medium flex items-baseline gap-2"><span className="text-xs text-muted-foreground tabular-nums">{n}</span>{title}</h3>
      {children}
    </section>
  );
}

export function AdamGuideContent({ compact }: { compact?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-7", compact ? "text-sm" : "text-[15px]")}>
      <Section n="1" title="Purpose">
        <p className="text-muted-foreground leading-relaxed">
          Adam reads a field&apos;s literature and builds a graph of known steps : claims with the passage they came from, the methods and procedures behind them, the assumptions they rest on, and where papers disagree. Agents read and check; you make three decisions and review only what they could not settle. The output is a set of hypotheses, each with the experiment chain that would test it and the result that would kill it. You then run the experiment, record what you observed, and the verdict goes back into the graph.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Two views.</span> The default is five steps: Ask, Read, Pick, Experiment, Write, with one thing to do at each. <span className="font-medium text-foreground">Advanced</span> (the switch in the header) shows every tab below: sweep rings, the extraction queue, the methods dossier, the full briefs with their attack logs and maps, saturation and activity. The loop underneath is the same.
        </p>
      </Section>

      <Section n="2" title="Inputs">
        <Table head={["Field", "Used for"]} rows={INPUTS.map((i) => [i.field, i.use])} widths={["w-44", ""]} />
      </Section>

      <Section n="3" title="Phases">
        <Table
          head={["#", "Phase", "Tab", "Agents", "Produces", "Ends when", "You"]}
          rows={PHASES.map((p) => [p.n, p.phase, p.tab, p.agents, p.produces, p.endsWhen, p.you])}
          widths={["w-8", "w-24", "w-28", "w-40", "", "w-44", "w-48"]}
        />
        <p className="text-xs text-muted-foreground">The loop is a loop, not a line: pass N+1 re-scopes from the open attacks and gaps, re-sweeps, and updates the briefs. The status bar&apos;s phase strip shows where the current pass is.</p>
      </Section>

      <Section n="4" title="Gates: the three decisions that are yours alone">
        <Table head={["Gate", "Where", "Why it is yours", "How"]} rows={GATES.map((g) => [g.gate, g.where, g.why, g.how])} widths={["w-32", "w-44", "", ""]} />
      </Section>

      <Section n="5" title="Reviewing: the extraction queue">
        <ul className="text-muted-foreground leading-relaxed list-disc pl-5 flex flex-col gap-1">
          <li><span className="font-medium text-foreground">What lands there:</span> conflicting readings of one passage (both shown with paper, page, section and quote), unsourced items (quote not found in the paper), low-confidence items, load-bearing assumptions. Everything else passed verification on its own.</li>
          <li><span className="font-medium text-foreground">Actions:</span> approve, correct (your wording, prior text kept), reject (retracted, never deleted), send back to the extractor with a note. Keys j/k move, x select, a approve, r reject, c correct; select all on a page and act once.</li>
          <li><span className="font-medium text-foreground">Auto-review:</span> judges every open item against its passage and proposes approve or reject per item; you apply the proposal in one click. Conflicts and unsourced items are always left to you.</li>
          <li><span className="font-medium text-foreground">Your decisions outrank everything:</span> a human-approved node is never overwritten by a later agent run.</li>
        </ul>
      </Section>

      <Section n="6" title="Outputs">
        <Table head={["Output", "Where", "Notes"]} rows={OUTPUTS.map((o) => [o.what, o.where, o.note])} widths={["w-48", "w-56", ""]} />
      </Section>

      <Section n="7" title="Status bar">
        <Table head={["Shows", "Meaning"]} rows={STATUS.map((s) => [s.state, s.meaning])} widths={["w-36", ""]} />
      </Section>


      <Section n="8" title="A first run, in order">
        <ol className="text-muted-foreground leading-relaxed list-decimal pl-5 flex flex-col gap-1">
          <li><span className="font-medium text-foreground">Ask :</span> say what you want to find out, what you believe, and what your lab can do. <span className="font-medium text-foreground">Scope it</span>, read the questions Adam wrote, edit any, then <span className="font-medium text-foreground">Looks right, start reading</span>.</li>
          <li><span className="font-medium text-foreground">Read :</span> nothing to do. Four automatic stages run; Adam reviews its own uncertain items and leaves the rest under &ldquo;Things Adam wasn&apos;t sure about&rdquo;, which never blocks anything.</li>
          <li><span className="font-medium text-foreground">Pick :</span> choose the hypotheses worth your time and let Adam try to break them. For each survivor, confirm in one sentence what would make you drop it.</li>
          <li><span className="font-medium text-foreground">Experiment :</span> approve the plan, run it, tick the steps, write what you observed, then answer: did the kill result appear? That decides the hypothesis and stores your observations as results.</li>
          <li><span className="font-medium text-foreground">Write :</span> one button writes the pass up for collaborators; one starts the next pass from what is still open.</li>
        </ol>
      </Section>
    </div>
  );
}

/** Header button that opens the onboarding sheet in a side panel; opens itself once on a first visit. */
export function AdamGuideButton({ autoOpen }: { autoOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!autoOpen) return;
    let seen = true;
    try {
      seen = !!localStorage.getItem("adam-guide-seen");
      if (!seen) localStorage.setItem("adam-guide-seen", "1");
    } catch {
      // private mode or blocked storage: the button still works
    }
    if (seen) return;
    // Deferred so the sheet opens after hydration rather than inside the effect's own render pass
    const t = setTimeout(() => setOpen(true), 0);
    return () => clearTimeout(t);
  }, [autoOpen]);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="ghost" className="text-muted-foreground">
          <CircleHelp className="size-3.5" />
          <span className="ml-1.5">How it works</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>How to use Adam</SheetTitle>
          <SheetDescription>What it does, what it needs from you, what it produces, and what each stop means.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 pb-8">
          <AdamGuideContent compact />
        </div>
      </SheetContent>
    </Sheet>
  );
}
