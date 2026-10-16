/**
 * Sanity-check the relevance layer on real seed data, via JEV and via the fallback.
 *   node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/test-jev.ts [--fallback]
 */
import { classify, needsCitation, scoreRelevance, scoreSupport } from "../src/lib/jev";

const RAG = { id: "rag", title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks", abstract: "Large pre-trained language models store factual knowledge in their parameters... We explore a general-purpose fine-tuning recipe for retrieval-augmented generation (RAG) — models which combine pre-trained parametric and non-parametric memory for language generation. ... RAG models generate more specific, diverse and factual language than a state-of-the-art parametric-only seq2seq baseline." };
const GRAPHRAG = { id: "graphrag", title: "From Local to Global: A Graph RAG Approach to Query-Focused Summarization", abstract: "The use of retrieval-augmented generation (RAG) to retrieve relevant information from an external knowledge source enables LLMs to answer questions over private and/or previously unseen document collections. However, RAG fails on global questions directed at an entire text corpus... Graph RAG uses an LLM to build a graph-based text index ... community summaries ... substantial improvements over a naive RAG baseline for both the comprehensiveness and diversity of generated answers." };
const COT = { id: "cot", title: "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models", abstract: "We explore how generating a chain of thought—a series of intermediate reasoning steps—significantly improves the ability of large language models to perform complex reasoning." };

async function main() {
  if (process.argv.includes("--fallback")) delete process.env.TYPESAFE_API_KEY;

  for (const s of [
    "Retrieving passages from an external corpus makes generated answers more factual than parametric-only models.",
    "In this section we describe how our system is organised.",
  ]) {
    const r = await needsCitation(s);
    console.log(`needsCitation [${r.source} ${r.ms}ms] ${r.result.value.toFixed(2)} (conf ${r.result.confidence.toFixed(2)})  «${s.slice(0, 60)}»`);
  }

  const sentence = "Building a graph index over the corpus lets RAG answer global questions about the whole collection.";
  const rel = await scoreRelevance(sentence, [RAG, GRAPHRAG, COT]);
  console.log(`\nscoreRelevance [${rel.source} ${rel.ms}ms] for «${sentence.slice(0, 60)}…»`);
  for (const [id, j] of rel.result) console.log(`  ${id.padEnd(9)} ${j.value.toFixed(2)} (conf ${j.confidence.toFixed(2)})`);

  const claim = "Graph RAG performs worse than naive RAG on global sensemaking questions.";
  const sup = await scoreSupport(claim, [GRAPHRAG, COT]);
  console.log(`\nscoreSupport [${sup.source} ${sup.ms}ms] for «${claim}»`);
  for (const [id, j] of sup.result) console.log(`  ${id.padEnd(9)} ${j.level} ${j.value.toFixed(2)} (conf ${j.confidence.toFixed(2)})`);

  const route = await classify("Which papers in my team's library should I cite for this paragraph?", "Which assistant should handle this request?", {
    cite_scout: "Finding papers to cite for some text",
    citation_checker: "Checking whether claims in a draft are supported by their citations",
    next_steps: "Suggesting what to research or do next",
    historian: "Recording or recalling hypotheses, findings and past decisions",
  });
  console.log(`\nclassify [${route.source} ${route.ms}ms] → ${route.result.label} (conf ${route.result.confidence.toFixed(2)})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
