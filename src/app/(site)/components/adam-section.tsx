import BlurFade from "@/components/ui/blur-fade";
import { cn } from "@/lib/utils";
import { neuraQueryLogo } from "@/lib/logos";
import MaxWidthContainer from "./max-width-container";
import { glassCard, innerCard, logoTile } from "./styles";

const loop = [
  {
    name: "Question",
    body: "Your topic, current understanding and lab constraints become a question page: a hunch, 3–5 sub-questions, the vocabulary neighbouring fields use, and a scope fence.",
  },
  {
    name: "Sweep",
    body: "Three rings over OpenAlex: seed papers, citations backward and forward, then the same problem under other names. Every paper triaged core, contradicts, method or background.",
  },
  {
    name: "Extract & verify",
    body: "Claims, evidence, methods, assumptions and gaps, each with a verbatim quote, page and section. Core papers are read twice, and a Verifier checks every quote is really there.",
  },
  {
    name: "Methods",
    body: "Each method is chased to a procedure a lab could follow: inputs, outputs, steps, equipment, time, cost, then marked runnable, partial or unknown.",
  },
  {
    name: "Connect",
    body: "The Graph Analyst finds holes between related clusters, conflicts between opposite claims, and load-bearing assumptions nobody has tested.",
  },
  {
    name: "Hypothesise",
    body: "Two to four competing briefs, each with mechanism, boundary, evidence for and against with pages, a prediction and kill criteria.",
  },
  {
    name: "Attack",
    body: "A Falsifier that never sees the writer's reasoning runs a pre-mortem, rival explanations, null and ablation, baseline replication and boundary probes.",
  },
  {
    name: "Experiment",
    body: "The surviving brief becomes a chain of known procedures, cheapest-to-kill first, with the gaps marked honestly and a control for every rival.",
  },
  {
    name: "Next pass",
    body: "Run it, record what you observed, and the verdict goes back into the graph. Saturated clusters are skipped, the question gets sharper.",
  },
];

const agents = [
  { name: "Scoper", job: "Turns a topic into a question page with sub-questions and a scope fence.", check: "Scope checker, then you approve" },
  { name: "Searcher", job: "Sweeps seed, citation and adjacent rings and triages every paper.", check: "Coverage check on the core papers' key references" },
  { name: "Extractor", job: "One extraction card per paper, every item with a quote, page and section.", check: "Verifier: quote must be in the source" },
  { name: "Methods Hunter", job: "Fills each method in to a runnable procedure from methods, supplements and protocols.", check: "Runnability and feasibility against your constraints" },
  { name: "Graph Analyst", job: "Finds holes, conflicts and untested load-bearing assumptions in the graph.", check: "Sanity check: more than vocabulary overlap" },
  { name: "Hypothesis Writer", job: "Drafts competing briefs and answers every attack in writing.", check: "Falsifier, then your selection and signature" },
  { name: "Experiment Designer", job: "Orders the chain cheapest-to-kill and adds a control per rival.", check: "Design check: tests the kill criterion, not something adjacent" },
  { name: "Orchestrator", job: "Decides what runs next and when to stop: saturation, budget, convergence.", check: "You can pause, resume, redraw scope" },
];

const gates = [
  { gate: "Scope", where: "Question", commit: "This is the right question and the fence is in the right place." },
  { gate: "Selection", where: "Hypotheses", commit: "These briefs are worth the lab's time." },
  { gate: "Kill criteria", where: "Hypotheses", commit: "Exactly this result makes us drop the hypothesis, signed before any data." },
  { gate: "Plan", where: "Experiments", commit: "This chain tests the kill criterion and goes to the lab." },
];

const queueKinds = [
  { kind: "Conflict", meaning: "Two extractors read the same passage differently", tone: "bg-red-100 text-red-600" },
  { kind: "Unsourced", meaning: "The quote is not in the paper's text", tone: "bg-amber-100 text-amber-700" },
  { kind: "Load-bearing", meaning: "Many nodes depend on it; an error propagates", tone: "bg-sky-100 text-primary" },
  { kind: "Low confidence", meaning: "Ambiguous, abstract-only or weak passage", tone: "bg-slate-100 text-slate-600" },
];

const queryAnswer = [
  { label: "Evidence", value: "for and against each sub-claim, with pages" },
  { label: "Boundary", value: "the conditions and assumptions it rests on" },
  { label: "Chains", value: "candidate procedures, each step's status" },
  { label: "Gaps", value: "missing steps, sent back to the Methods Hunter" },
  { label: "Rivals", value: "chains that reach the result without the mechanism" },
  { label: "Cost to kill", value: "the cheapest way to prove it wrong" },
];

const writeup = [
  ["Introduction", "the question page"],
  ["Related work", "triaged papers by cluster, verified claims, conflicts and holes"],
  ["Methods", "the methods dossier, procedure by procedure"],
  ["Hypotheses", "every brief with its signed kill criterion"],
  ["Experiment plans", "the Designer's chains and controls"],
  ["Discussion", "the falsification log and open questions"],
];

const passNumbers = [
  { value: "71", label: "papers triaged" },
  { value: "33", label: "read in full" },
  { value: "2,215", label: "passages indexed" },
  { value: "~380", label: "structured LLM calls" },
  { value: "~250", label: "OpenAlex requests" },
  { value: "~6,000", label: "FalkorDB queries" },
];

function SectionHeading({ children, kicker }: { children: React.ReactNode; kicker: string }) {
  return (
    <div className="flex flex-col gap-2 max-w-2xl">
      <p className="text-sm uppercase tracking-normal text-primary/70 font-medium">{kicker}</p>
      <h3 className="text-26 md:text-32 tracking-6 leading-[1.2] lowercase text-foreground">{children}</h3>
    </div>
  );
}

export default function AdamSection() {
  return (
    <section id="adam" className="relative w-full overflow-hidden scroll-mt-8">
      <div className="absolute h-[400px] w-[400px] top-20 -left-40 bg-secondary rounded-full filter blur-3xl opacity-50 pointer-events-none" />
      <div className="absolute h-[300px] w-[300px] top-[45%] -right-32 bg-secondary rounded-full filter blur-3xl opacity-50 pointer-events-none" />

      <MaxWidthContainer className="relative flex flex-col gap-24 md:gap-32 py-16 md:py-24">
        {/* intro */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-end">
          <BlurFade delay={0.1} inView>
            <div className="flex flex-col gap-6">
              <div className={cn(logoTile, "w-14 h-14 p-2")}>{neuraQueryLogo}</div>
              <h2 className="text-32 md:text-56 tracking-6 leading-[1.1] lowercase text-foreground">
                meet{" "}
                <span className="text-primary font-serif font-semibold italic">adam</span>, the
                research agent that designs your next experiment
              </h2>
            </div>
          </BlurFade>
          <BlurFade delay={0.2} inView>
            <div className="flex flex-col gap-4 text-lg text-muted-foreground leading-snug">
              <p>
                Adam does not summarise papers for you. It builds a graph of known steps, every
                one traced to a page in a source, then answers one question:{" "}
                <span className="text-foreground">
                  what chain of steps would test my hypothesis, and where does the chain break?
                </span>
              </p>
              <p>
                It does the work between a research question and a lab bench, and leaves you
                the three decisions it cannot make: the question, which hypothesis is worth
                your time, and the result that would make you drop it.
              </p>
            </div>
          </BlurFade>
        </div>

        {/* premise */}
        <BlurFade delay={0.1} inView>
          <div className={cn(glassCard, "relative overflow-hidden p-8 md:p-14 text-center")}>
            <div className="absolute h-[250px] w-[250px] -bottom-24 left-1/2 -translate-x-1/2 bg-primary opacity-30 rounded-full filter blur-[64px] pointer-events-none" />
            <p className="relative text-26 md:text-[2.5rem] tracking-6 leading-[1.25] text-foreground max-w-4xl mx-auto">
              “New results are a combination of{" "}
              <span className="text-primary font-serif italic">known steps</span>. The novelty is
              in the assembly, not in inventing.”
            </p>
            <p className="relative mt-6 text-base md:text-lg text-muted-foreground">
              No claim without the page it came from. No hypothesis without the result that would
              kill it.
            </p>
          </div>
        </BlurFade>

        {/* loop */}
        <div className="flex flex-col gap-10">
          <BlurFade delay={0.1} inView>
            <SectionHeading kicker="The loop">
              question to experiment,{" "}
              <span className="text-primary font-serif italic">then read again</span>
            </SectionHeading>
          </BlurFade>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {loop.map((step, i) => (
              <BlurFade key={step.name} delay={0.05 * i} inView>
                <div className={cn(innerCard, "h-full p-5 flex flex-col gap-3")}>
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 shrink-0 rounded-full bg-primary text-white text-sm font-semibold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <p className="text-xl font-medium text-primary">{step.name}</p>
                  </div>
                  <p className="text-base text-muted-foreground leading-snug">{step.body}</p>
                </div>
              </BlurFade>
            ))}
          </div>
        </div>

        {/* agents */}
        <div className="flex flex-col gap-10">
          <BlurFade delay={0.1} inView>
            <SectionHeading kicker="Eight agents, each checked by another">
              one job each,{" "}
              <span className="text-primary font-serif italic">nothing unchecked</span>
            </SectionHeading>
          </BlurFade>
          <BlurFade delay={0.15} inView>
            <div className={cn(glassCard, "relative overflow-hidden p-4 md:p-6")}>
              <div className="absolute h-[300px] w-[300px] -bottom-10 -right-10 bg-secondary rounded-full filter blur-3xl pointer-events-none" />
              <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {agents.map((agent) => (
                  <div key={agent.name} className={cn(innerCard, "p-4 flex flex-col gap-2")}>
                    <p className="text-lg font-medium text-primary">{agent.name}</p>
                    <p className="text-sm text-foreground/80 leading-snug flex-1">{agent.job}</p>
                    <p className="text-xs text-muted-foreground leading-snug border-t border-sky-100 pt-2">
                      <span className="text-primary font-medium">Checked by:</span> {agent.check}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </BlurFade>
        </div>

        {/* gates + queue */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="flex flex-col gap-8">
            <BlurFade delay={0.1} inView>
              <SectionHeading kicker="Where you stay in charge">
                the decisions{" "}
                <span className="text-primary font-serif italic">only you</span> can make
              </SectionHeading>
            </BlurFade>
            <div className="flex flex-col gap-3">
              {gates.map((g, i) => (
                <BlurFade key={g.gate} delay={0.05 * i} inView>
                  <div className={cn(innerCard, "p-4 flex gap-4 items-start")}>
                    <span className="shrink-0 rounded-md bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-1 mt-0.5">
                      gate {i + 1}
                    </span>
                    <div className="flex flex-col gap-1">
                      <p className="font-medium text-foreground">
                        {g.gate} <span className="text-muted-foreground font-normal">· {g.where} tab</span>
                      </p>
                      <p className="text-sm text-muted-foreground leading-snug">{g.commit}</p>
                    </div>
                  </div>
                </BlurFade>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              A person&apos;s decision outranks every agent write and is never undone by a later run.
            </p>
          </div>

          <div className="flex flex-col gap-8">
            <BlurFade delay={0.1} inView>
              <SectionHeading kicker="The exception queue">
                review{" "}
                <span className="text-primary font-serif italic">only what was flagged</span>
              </SectionHeading>
            </BlurFade>
            <BlurFade delay={0.15} inView>
              <div className={cn(glassCard, "p-4 md:p-6 flex flex-col gap-4")}>
                <p className="text-base text-muted-foreground leading-snug">
                  The Verifier never sees the extractor&apos;s reasoning. You see an item only when it
                  flagged one, beside its quoted passage, with approve, correct, reject or send back.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {queueKinds.map((q) => (
                    <div key={q.kind} className={cn(innerCard, "p-3 flex flex-col gap-1.5")}>
                      <span className={cn("w-fit text-xs font-semibold rounded px-1.5 py-0.5", q.tone)}>{q.kind}</span>
                      <p className="text-sm text-muted-foreground leading-snug">{q.meaning}</p>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground leading-snug">
                  Built for volume: keyboard review (<kbd className="font-mono text-primary">j k x a r c</kbd>),
                  bulk approve, and an optional auto-review that proposes calls but decides nothing.
                </p>
              </div>
            </BlurFade>
          </div>
        </div>

        {/* hypothesis as a query */}
        <div className="flex flex-col gap-10">
          <BlurFade delay={0.1} inView>
            <SectionHeading kicker="Hypothesis as a query">
              ask{" "}
              <span className="text-primary font-serif italic">&ldquo;is it true that…&rdquo;</span>{" "}
              and get a path, not a paragraph
            </SectionHeading>
          </BlurFade>
          <BlurFade delay={0.15} inView>
            <div className={cn(glassCard, "relative overflow-hidden p-4 md:p-6 flex flex-col gap-5")}>
              <div className="absolute h-[250px] w-[250px] -top-10 -left-10 bg-secondary rounded-full filter blur-3xl pointer-events-none" />
              <div className={cn(innerCard, "relative px-4 py-3 flex items-center gap-3")}>
                <div className={cn(logoTile, "w-8 h-8 p-1.5 shrink-0")}>{neuraQueryLogo}</div>
                <p className="text-base md:text-lg text-foreground">
                  Is it true that surface passivation, not grain size, sets the emission shift under heat?
                </p>
              </div>
              <div className="relative grid grid-cols-2 md:grid-cols-3 gap-3">
                {queryAnswer.map((a) => (
                  <div key={a.label} className={cn(innerCard, "p-3 flex flex-col gap-1")}>
                    <p className="font-medium text-primary">{a.label}</p>
                    <p className="text-sm text-muted-foreground leading-snug">{a.value}</p>
                  </div>
                ))}
              </div>
              <p className="relative text-sm text-muted-foreground">
                Answered from the graph by path search over{" "}
                <code className="font-mono text-primary">Procedure-[:DEPENDS_ON*0..5]-&gt;Procedure</code>{" "}
                ending at a <code className="font-mono text-primary">Result</code>. Available on the
                Experiments tab, in the Neura AI chat, and as the{" "}
                <code className="font-mono text-primary">hypothesis_query</code> MCP tool.
              </p>
            </div>
          </BlurFade>
        </div>

        {/* write-up + numbers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="flex flex-col gap-8">
            <BlurFade delay={0.1} inView>
              <SectionHeading kicker="After a pass">
                a write-up that{" "}
                <span className="text-primary font-serif italic">cites itself</span>
              </SectionHeading>
            </BlurFade>
            <BlurFade delay={0.15} inView>
              <div className={cn(innerCard, "p-2")}>
                {writeup.map(([section, source], i) => (
                  <div
                    key={section}
                    className={cn(
                      "flex gap-4 px-3 py-2.5 text-sm",
                      i > 0 && "border-t border-sky-100"
                    )}
                  >
                    <span className="w-36 shrink-0 font-medium text-foreground">{section}</span>
                    <span className="text-muted-foreground">{source}</span>
                  </div>
                ))}
              </div>
            </BlurFade>
            <p className="text-sm text-muted-foreground leading-snug">
              Assembled into your workspace as an ordinary document, so collaborators can edit it
              and run Check citations on it. Every claim cites its paper, page and section.
            </p>
          </div>

          <div className="flex flex-col gap-8">
            <BlurFade delay={0.1} inView>
              <SectionHeading kicker="One measured pass">
                what a{" "}
                <span className="text-primary font-serif italic">real run</span> looks like
              </SectionHeading>
            </BlurFade>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {passNumbers.map((n, i) => (
                <BlurFade key={n.label} delay={0.05 * i} inView>
                  <div className={cn(innerCard, "p-4 flex flex-col gap-1 h-full")}>
                    <p className="text-26 md:text-32 tracking-6 text-primary font-medium leading-none">
                      {n.value}
                    </p>
                    <p className="text-sm text-muted-foreground">{n.label}</p>
                  </div>
                </BlurFade>
              ))}
            </div>
            <p className="text-sm text-muted-foreground leading-snug">
              Extraction and verification took about 40 minutes for 70 cards, method hunting about
              15 minutes for 80 methods. A per-pass budget stops the loop before it runs away, and a
              second pass is much smaller: saturated clusters are skipped and read papers are not
              read again.
            </p>
          </div>
        </div>
      </MaxWidthContainer>
    </section>
  );
}
