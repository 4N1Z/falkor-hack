// Next-Step — one job: propose three grounded next moves for the research.
// Evidence comes only from the graph (literature gaps, papers that bridge collaborators'
// libraries, influential papers nobody has read, the team's open hypotheses/questions). An LLM
// drafts ideas *from that evidence only* (ideas citing no evidence are dropped), JEV scores
// novelty and feasibility in one call, and ideas resembling a dropped hypothesis are flagged.

import { randomUUID } from "crypto";
import { chatModel } from "@/lib/ai/models";
import { generateObject } from "ai";
import { z } from "zod";
import { embedTexts } from "../graph/embeddings";
import {
  BRIDGE_PAPERS,
  CREATE_IDEA,
  DOCUMENT_CLAIMS,
  INFLUENTIAL_UNREAD,
  LINK_IDEA_CONCEPTS,
  LITERATURE_GAPS,
} from "../graph/queries";
import { score } from "@typesafe-ai/sdk";
import { startRun, type AgentResult } from "./base";
import { recall, SAME_IDEA_DISTANCE, timeline, type SimilarMemory } from "./historian";

export interface Idea {
  id: string;
  title: string;
  text: string;
  /** Concrete first step */
  action: string;
  kind: "read" | "experiment" | "write" | "ask";
  novelty: number;
  feasibility: number;
  /** Evidence the idea is grounded in (papers and topics from the graph) */
  evidence: { id: string; kind: "paper" | "gap" | "memory"; label: string; detail: string }[];
  /** A dropped hypothesis this idea resembles, if any */
  conflictsWith: SimilarMemory | null;
}

type Evidence = Idea["evidence"][number] & { paperId?: string; concept?: string };

const NOVELTY = [
  "Repeats what the team's papers already establish",
  "A modest extension of the team's current work",
  "A clearly new direction relative to the team's library",
] as const;
const FEASIBILITY = [
  "Needs resources or data a small team is unlikely to have",
  "Doable in a few weeks with effort",
  "Doable in days with the team's current papers and tools",
] as const;

async function jevScoreIdeas(context: string, ideas: { title: string; text: string }[]) {
  // One request: a novelty and a feasibility question per idea
  const { TypeSafeClient } = await import("@typesafe-ai/sdk");
  if (!process.env.TYPESAFE_API_KEY) return null;
  try {
    const client = new TypeSafeClient({ defaultModel: "jev-latest", timeout: 8000 });
    const questions = Object.fromEntries(
      ideas.flatMap((idea, i) => [
        [`n${i}`, score(`How novel is this idea for the team? Idea: ${idea.title}. ${idea.text}`, NOVELTY)],
        [`f${i}`, score(`How feasible is this idea for the team? Idea: ${idea.title}. ${idea.text}`, FEASIBILITY)],
      ]),
    );
    const { answers } = await client.systemOne({ state: context, questions });
    const scoreOf = (k: string) => (answers[k] as { score: number }).score / 2;
    return ideas.map((_, i) => ({ novelty: scoreOf(`n${i}`), feasibility: scoreOf(`f${i}`) }));
  } catch (err) {
    console.error("[next-steps] JEV scoring failed, ranking unscored:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function runNextSteps(input: { workspaceId: string; userId: string; fileId?: string }): Promise<AgentResult<Idea>> {
  const run = await startRun("next-steps", input.workspaceId, { fileId: input.fileId });
  const g = run.graph;

  // 1. Graph evidence
  const [gaps, bridges, influential, claims, memory] = await Promise.all([
    run.step("graph.literatureGaps", async () => (await g.roQuery<{ concept: string; papers: number; near: number }>(LITERATURE_GAPS)).data ?? [], {
      source: "graph",
      cypher: "LITERATURE_GAPS",
    }),
    run.step(
      "graph.bridgePapers",
      async () => (await g.roQuery<{ paperId: string; title: string; year: number; owners: number; links: number; names: string[] }>(BRIDGE_PAPERS)).data ?? [],
      { source: "graph", cypher: "BRIDGE_PAPERS" },
    ),
    run.step(
      "graph.influentialUnread",
      async () =>
        (await g.roQuery<{ paperId: string; title: string; year: number }>(INFLUENTIAL_UNREAD, { params: { sinceYear: 2019 } as never })).data ?? [],
      { source: "graph", cypher: "INFLUENTIAL_UNREAD (algo.pageRank)" },
    ),
    input.fileId
      ? run.step("graph.documentClaims", async () => (await g.roQuery<{ text: string }>(DOCUMENT_CLAIMS, { params: { fileId: input.fileId } as never })).data ?? [], {
          source: "graph",
        })
      : Promise.resolve([] as { text: string }[]),
    run.step("historian.timeline", () => timeline(input.workspaceId, 30), { source: "graph", cypher: "MEMORY_TIMELINE" }),
  ]);

  const evidence: Evidence[] = [
    ...bridges.map((b, i) => ({
      id: `B${i + 1}`,
      kind: "paper" as const,
      paperId: b.paperId,
      label: b.title,
      detail: `${b.year}; connects ${b.names.join(", ")}'s libraries (${b.links} citation links) but no one has added it`,
    })),
    ...influential.map((p, i) => ({
      id: `P${i + 1}`,
      kind: "paper" as const,
      paperId: p.paperId,
      label: p.title,
      detail: `${p.year}; among the most central papers around the team's library (PageRank), not in the library`,
    })),
    ...gaps.map((c, i) => ({
      id: `G${i + 1}`,
      kind: "gap" as const,
      concept: c.concept,
      label: c.concept,
      detail: `${c.papers} nearby papers are about this, none of the team's papers are`,
    })),
    ...memory
      .filter((m) => m.status === "active" && m.kind !== "finding")
      .slice(0, 6)
      .map((m, i) => ({ id: `M${i + 1}`, kind: "memory" as const, label: m.text, detail: `open ${m.kind} recorded by ${m.byName}` })),
  ];
  if (!evidence.length) return run.finish("NOT_IN_GRAPH", [], input.userId);

  const dropped = memory.filter((m) => m.status === "dropped");
  const topic = claims.slice(0, 12).map((c) => `- ${c.text}`).join("\n");
  const context = [
    topic ? `The team's current draft says:\n${topic}` : "",
    dropped.length ? `Hypotheses the team already DROPPED (do not propose these again):\n${dropped.map((d) => `- ${d.text} (because: ${d.reason ?? "n/a"})`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // 2. Draft ideas strictly from the evidence
  const { object } = await run.step(
    "llm.draftIdeas",
    () =>
      generateObject({
        model: chatModel(),
        temperature: 0.4,
        schema: z.object({
          ideas: z
            .array(
              z.object({
                title: z.string().describe("Short imperative title, max 10 words"),
                text: z.string().describe("Two sentences: what and why, referring to the evidence"),
                action: z.string().describe("The concrete first step the team can take this week"),
                kind: z.enum(["read", "experiment", "write", "ask"]),
                evidenceIds: z.array(z.string()).min(1).describe("IDs from the evidence list that justify this idea"),
              }),
            )
            .length(4),
        }),
        system:
          "You help a research team decide what to do next. Propose ideas ONLY from the evidence list and list the evidence IDs you used in evidenceIds. In title, text and action, refer to papers and topics by name — never by ID. Include at least one concrete experiment the team could run on their own system, and prefer ideas that connect different collaborators' work (say whose). Never propose a dropped hypothesis.",
        prompt: `${context}\n\nEvidence from the team's research graph:\n${evidence.map((e) => `${e.id} [${e.kind}] ${e.label}: ${e.detail}`).join("\n")}\n\nPropose 4 distinct next steps.`,
      }),
    { source: "llm" },
  );

  // Grounding guard: keep only real evidence IDs; drop ideas left with none
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const unId = (t: string) =>
    t.replace(/\(?\b([BPGM]\d{1,2})\b\)?/g, (m: string, id: string) => (byId.has(id) ? "“" + byId.get(id)!.label.slice(0, 80) + "”" : m));
  const drafted = object.ideas
    .map((i) => ({
      ...i,
      title: unId(i.title),
      text: unId(i.text),
      action: unId(i.action),
      evidence: i.evidenceIds.map((id) => byId.get(id)).filter((e): e is Evidence => !!e),
    }))
    .filter((i) => i.evidence.length > 0);

  // 3. JEV novelty/feasibility, 4. dead-end check against dropped hypotheses
  const scores = await run.step("jev.scoreIdeas", () => jevScoreIdeas(context || "A research team's literature review", drafted), {
    source: "jev",
  });
  const vectors = await embedTexts(drafted.map((d) => `${d.title}. ${d.text}`));
  const conflicts = await Promise.all(
    vectors.map((v) =>
      recall({ workspaceId: input.workspaceId, vector: v, kind: "hypothesis", status: "dropped", limit: 1, maxDistance: SAME_IDEA_DISTANCE }).then(
        (r) => r[0] ?? null,
      ),
    ),
  );

  const ideas: Idea[] = drafted
    .map((d, i) => ({
      id: randomUUID(),
      title: d.title,
      text: d.text,
      action: d.action,
      kind: d.kind,
      novelty: scores?.[i].novelty ?? 0.5,
      feasibility: scores?.[i].feasibility ?? 0.5,
      evidence: d.evidence.map(({ id, kind, label, detail }) => ({ id, kind, label, detail })),
      conflictsWith: conflicts[i],
      _papers: d.evidence.filter((e) => e.paperId).map((e) => e.paperId!),
      _concepts: d.evidence.filter((e) => e.concept).map((e) => e.concept!),
    }))
    // Dead ends last; otherwise best combined novelty + feasibility first
    .sort((a, b) => Number(!!a.conflictsWith) - Number(!!b.conflictsWith) || b.novelty + b.feasibility - (a.novelty + a.feasibility))
    .slice(0, 3) as (Idea & { _papers: string[]; _concepts: string[] })[];

  // 5. Persist as proposals: (Idea {status:'suggested'})-[:GROUNDED_IN]->(Paper|Concept)
  await run.step(
    "graph.recordIdeas",
    async () => {
      for (const idea of ideas as (Idea & { _papers: string[]; _concepts: string[] })[]) {
        await g.query(CREATE_IDEA, {
          params: {
            id: idea.id,
            title: idea.title,
            text: idea.text,
            action: idea.action,
            kind: idea.kind,
            runId: run.runId,
            at: Date.now(),
            novelty: idea.novelty,
            feasibility: idea.feasibility,
            paperIds: idea._papers,
          } as never,
        });
        if (idea._concepts.length) await g.query(LINK_IDEA_CONCEPTS, { params: { id: idea.id, concepts: idea._concepts } as never });
      }
      return ideas;
    },
    { source: "graph", cypher: "CREATE_IDEA" },
  );

  // Graph page: highlight the ideas and the papers they're grounded in
  for (const idea of ideas as (Idea & { _papers: string[] })[]) {
    run.highlight.add(idea.id);
    idea._papers.forEach((p) => run.highlight.add(p));
  }
  const clean = (ideas as (Idea & { _papers?: string[]; _concepts?: string[] })[]).map(({ _papers, _concepts, ...rest }) => rest);
  return run.finish("ANSWERED", clean, input.userId);
}
