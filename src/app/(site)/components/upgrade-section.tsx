import BlurFade from "@/components/ui/blur-fade";
import { cn } from "@/lib/utils";
import RailSection from "./rail-section";
import { glassCard, innerCard } from "./styles";

const beforeAfter = [
  {
    area: "Library",
    before: "Papers as files and Zotero folders",
    after: "OpenAlex search and import, full text indexed by section with page numbers, figures and tables as their own passages",
  },
  {
    area: "AI",
    before: "One bubble-menu assistant",
    after: "Single-purpose agents on a shared graph, plus Adam, a full research-agent loop",
  },
  {
    area: "Citations",
    before: "Added and checked by hand",
    after: "Suggested from any collaborator's library and checked against the cited paper's own passages",
  },
  {
    area: "Memory",
    before: "Ideas lost between meetings",
    after: "A time-aware notebook that remembers why a hypothesis was dropped",
  },
  {
    area: "Trust",
    before: "Answers without a source",
    after: "Every suggestion carries the graph path or passage behind it, stored as a trace",
  },
  {
    area: "Integrations",
    before: "Inside the app only",
    after: "An MCP server gives Claude Code, Claude Desktop or Cursor the same graph tools",
  },
];

const editorAgents = [
  { name: "Cite Scout", job: "A citation for the sentence you're writing, from anyone's library, with the citation path to your own papers." },
  { name: "Citation Checker", job: "Supported, partly, contradicted or uncited, judged only on the passages of the paper you cited." },
  { name: "Next-Step", job: "Influential papers nobody on the team has read, concepts the library misses, bridge papers." },
  { name: "Historian", job: "A time-aware notebook, so an idea dropped in March isn't suggested again in May." },
  { name: "Synthesis", job: "A literature review drafted from citation communities, ordered by PageRank." },
  { name: "Scout Watcher", job: "New papers citing two or more of yours, ranked by how close they sit to your work." },
  { name: "Ghost Writer", job: "A grey inline continuation, grounded in what Cite Scout found. Tab to accept." },
  { name: "Router", job: "Sends each Neura AI chat message to the agent that should answer it." },
];

const rules = [
  {
    title: "No model writes Cypher",
    body: "Every query is one of ~300 fixed, parameterised templates. Model output lands in parameters, never in query text, so it cannot reach another workspace or delete what it shouldn't.",
  },
  {
    title: "Provenance",
    body: "Every result carries the path or passage behind it. Every run is stored with its step trace and can be opened as a provenance tree.",
  },
  {
    title: "Proposals, not facts",
    body: "Agent-written nodes start as suggestions. Nothing is inserted until a person accepts it, so the researcher stays the author.",
  },
];

const graphFeatures = [
  "one graph per workspace",
  "vector indexes on 10 labels",
  "full-text indexes",
  "algo.pageRank",
  "algo.labelPropagation",
  "algo.WCC",
  "algo.SPpaths (weighted)",
  "variable-length paths",
  "the job queue as Cypher",
  "@falkordb/canvas",
];

const editorFixes = [
  { title: "Slash commands rebuilt", body: "/Search Papers opens a team-library search with your sentence; /Hypothesis saves it to the notebook." },
  { title: "Autosave mirrors the graph", body: "Every save syncs your draft's sentences and citations into the graph the agents read." },
  { title: "Live presence fixed", body: "Collaborator cursors and real-time editing work as they should." },
];

function Heading({ kicker, children }: { kicker: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 max-w-2xl">
      <p className="text-[11px] uppercase tracking-wide text-primary/70 font-medium">{kicker}</p>
      <h3 className="text-xl md:text-2xl tracking-6 leading-[1.2] lowercase text-foreground">{children}</h3>
    </div>
  );
}

export default function UpgradeSection() {
  return (
    <RailSection
      id="upgrade"
      className="flex flex-col gap-14 md:gap-20 pt-20 md:pt-24 pb-12 md:pb-16"
      backdrop={<div className="absolute top-40 right-[8%] h-[520px] w-[520px] rounded-full bg-secondary opacity-40 blur-[120px]" />}
    >
        {/* intro */}
        <BlurFade delay={0.1} inView>
          <div className="flex flex-col gap-6 max-w-3xl">
            <h2 className="text-2xl md:text-[2.5rem] tracking-6 leading-[1.1] lowercase text-foreground">
              the same workspace,{" "}
              <span className="text-primary font-serif font-semibold italic">rebuilt</span> around a
              knowledge graph
            </h2>
            <p className="text-base text-muted-foreground leading-snug">
              Every paper a team member imports or uploads now goes into the workspace&apos;s
              FalkorDB graph first. The editor&apos;s agents and Adam read the same graph, so a
              claim Adam verified is exactly what the Citation Checker judges your draft against.
            </p>
          </div>
        </BlurFade>

        {/* before / after */}
        <BlurFade delay={0.15} inView>
          <div className={cn(glassCard, "relative overflow-hidden p-2 md:p-4")}>
            <div className="hidden md:grid grid-cols-[10rem_1fr_1.6fr] gap-4 px-4 py-3 text-[13px] text-primary/70 font-medium uppercase">
              <span>Area</span>
              <span>Before</span>
              <span>Now</span>
            </div>
            <div className={cn(innerCard, "relative")}>
              {beforeAfter.map((row, i) => (
                <div
                  key={row.area}
                  className={cn(
                    "grid grid-cols-1 md:grid-cols-[10rem_1fr_1.6fr] gap-1 md:gap-4 px-4 py-3",
                    i > 0 && "border-t border-sky-100"
                  )}
                >
                  <span className="font-medium text-primary">{row.area}</span>
                  <span className="text-[13px] text-muted-foreground line-through decoration-primary/30">
                    {row.before}
                  </span>
                  <span className="text-[13px] text-foreground leading-snug">{row.after}</span>
                </div>
              ))}
            </div>
          </div>
        </BlurFade>

        {/* editor agents */}
        <div className="flex flex-col gap-6">
          <BlurFade delay={0.1} inView>
            <Heading kicker="Agents in the editor">
              help that{" "}
              <span className="text-primary font-serif italic">shows its working</span>
            </Heading>
          </BlurFade>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {editorAgents.map((agent, i) => (
              <BlurFade key={agent.name} delay={0.04 * i} inView>
                <div className={cn(innerCard, "h-full p-4 flex flex-col gap-2")}>
                  <p className="text-base font-medium text-primary">{agent.name}</p>
                  <p className="text-[13px] text-muted-foreground leading-snug">{agent.job}</p>
                </div>
              </BlurFade>
            ))}
          </div>
        </div>

        {/* rules + graph */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-8">
          <div className="flex flex-col gap-5">
            <BlurFade delay={0.1} inView>
              <Heading kicker="Three rules every agent follows">
                built so you can{" "}
                <span className="text-primary font-serif italic">check it</span>
              </Heading>
            </BlurFade>
            <div className="flex flex-col gap-3">
              {rules.map((rule, i) => (
                <BlurFade key={rule.title} delay={0.05 * i} inView>
                  <div className={cn(innerCard, "p-4 flex gap-4 items-start")}>
                    <span className="w-8 h-8 shrink-0 rounded-full bg-primary text-white text-[13px] font-semibold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <div className="flex flex-col gap-1">
                      <p className="font-medium text-foreground">{rule.title}</p>
                      <p className="text-[13px] text-muted-foreground leading-snug">{rule.body}</p>
                    </div>
                  </div>
                </BlurFade>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <BlurFade delay={0.1} inView>
              <Heading kicker="Running on FalkorDB">
                the graph is memory,{" "}
                <span className="text-primary font-serif italic">queue and proof</span>
              </Heading>
            </BlurFade>
            <BlurFade delay={0.15} inView>
              <div className={cn(glassCard, "p-4 md:p-6 flex flex-col gap-4")}>
                <p className="text-sm text-muted-foreground leading-snug">
                  Not a store beside the agents: Adam&apos;s job queue, its loop state, every
                  extracted claim and the papers it came from live in the same graph.
                </p>
                <div className="flex flex-wrap gap-2">
                  {graphFeatures.map((f) => (
                    <span
                      key={f}
                      className="rounded-md border border-sky-100 bg-[#FAFBFF] px-2 py-1 text-xs font-mono text-primary"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            </BlurFade>
          </div>
        </div>

        {/* editor fixes */}
        <div className="flex flex-col gap-6">
          <BlurFade delay={0.1} inView>
            <Heading kicker="And under the hood">
              the editor,{" "}
              <span className="text-primary font-serif italic">fixed and extended</span>
            </Heading>
          </BlurFade>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {editorFixes.map((fix, i) => (
              <BlurFade key={fix.title} delay={0.05 * i} inView>
                <div className={cn(innerCard, "h-full p-4 flex flex-col gap-2")}>
                  <p className="text-base font-medium text-primary">{fix.title}</p>
                  <p className="text-[13px] text-muted-foreground leading-snug">{fix.body}</p>
                </div>
              </BlurFade>
            ))}
          </div>
        </div>
    </RailSection>
  );
}
