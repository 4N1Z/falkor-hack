/**
 * Adam benchmark (docs/adam-spec-creation.md, "Validating the system before trusting it").
 * The system is itself a hypothesis ("agents can build a research-grade graph of known steps")
 * and is treated the way it treats hypotheses: with a test that could fail.
 *
 * Give it a project and a recent, well-regarded review paper (OpenAlex id) that the system was
 * NOT given. It reports:
 *   coverage     fraction of the review's references the Searcher found (and how many it found
 *                that the review does not cite)
 *   extraction   a random sample of verified claims with their quotes, written to a Markdown
 *                file for a domain expert to grade against the source
 *   methods      fraction of methods with a runnable / partial / unknown procedure
 *   graph        the Analyst's holes and conflicts, listed for comparison with the review's
 *                stated open problems
 *   hypotheses   the briefs, listed for the blind comparison with the review's open questions
 *
 *   node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/adam-benchmark.ts <workspaceId> <projectId> <reviewOpenAlexId> [--sample=30]
 */
import { writeFileSync } from "fs";
import { getFalkor, getWorkspaceGraph } from "../src/lib/graph/client";
import { getWorksByIds, shortId } from "../src/lib/graph/openalex";
import { CANDIDATES } from "../src/lib/adam/queries-analyst";
import { BRIEFS } from "../src/lib/adam/queries-hypotheses";
import { METHODS_DOSSIER } from "../src/lib/adam/queries-methods";
import { TRIAGED_IDS } from "../src/lib/adam/queries";

async function main() {
  const [workspaceId, projectId, reviewId] = process.argv.slice(2);
  const sample = Number(process.argv.find((a) => a.startsWith("--sample="))?.slice(9) ?? 30);
  if (!workspaceId || !projectId || !/^W\d+$/.test(reviewId ?? "")) throw new Error("usage: adam-benchmark.ts <workspaceId> <projectId> <reviewOpenAlexId> [--sample=30]");
  const graph = await getWorkspaceGraph(workspaceId);
  const p = <T>(x: T) => ({ params: x as never });

  // 1. Coverage against the review's reference list
  const [review] = await getWorksByIds([reviewId]);
  if (!review) throw new Error(`OpenAlex has no work ${reviewId}`);
  const refs = (review.referenced_works ?? []).map(shortId);
  const triaged = (await graph.roQuery<{ paperId: string; label: string }>(TRIAGED_IDS, p({ projectId }))).data ?? [];
  const found = new Set(triaged.map((t) => t.paperId));
  const hit = refs.filter((r) => found.has(r));
  const extra = triaged.filter((t) => !refs.includes(t.paperId) && t.label !== "background").length;
  console.log(`\nReview: ${review.title} (${review.publication_year})`);
  console.table([{ metric: "review references", value: refs.length }, { metric: "found by the Searcher", value: hit.length }, { metric: "coverage", value: refs.length ? (hit.length / refs.length).toFixed(2) : "n/a" }, { metric: "non-background papers the review does not cite", value: extra }]);

  // 2. Extraction accuracy sample for an expert
  const claims = (await graph.roQuery<{ id: string; text: string; quote: string; page: number; section: string; title: string; state: string }>(
    `MATCH (c:Claim {projectId: $projectId})-[:EXTRACTED_FROM]->(p:Paper)
     WHERE c.state IN ['agent_verified', 'human_approved']
     RETURN c.id AS id, c.text AS text, coalesce(c.quote, '') AS quote, coalesce(c.page, 0) AS page, coalesce(c.section, '') AS section, p.title AS title, c.state AS state`,
    p({ projectId }),
  )).data ?? [];
  const shuffled = [...claims].sort(() => Math.random() - 0.5).slice(0, sample);
  const md = [`# Extraction accuracy sample (${shuffled.length} of ${claims.length} verified claims)`, "", "Grade each row: does the source say this, where the card says it does? Mark ✓ / ✗ / ~ in the first column.", "", "| Grade | Claim | Quote | Where |", "|---|---|---|---|", ...shuffled.map((c) => `|  | ${c.text.replace(/\|/g, "\\|")} | “${c.quote.replace(/\|/g, "\\|")}” | ${c.title.slice(0, 60)}, p.${c.page}, ${c.section} |`)].join("\n");
  const out = `adam-benchmark-${projectId.slice(0, 8)}.md`;
  writeFileSync(out, md);
  console.log(`\nExtraction sample written to ${out} (${shuffled.length} claims)`);

  // 3. Method completeness
  const methods = (await graph.roQuery<{ runnability: string | null; procedureId: string | null }>(METHODS_DOSSIER, p({ projectId }))).data ?? [];
  const byRun: Record<string, number> = {};
  for (const m of methods) byRun[m.procedureId ? (m.runnability ?? "unknown") : "none"] = (byRun[m.procedureId ? (m.runnability ?? "unknown") : "none"] ?? 0) + 1;
  console.log("\nMethods:");
  console.table(Object.entries(byRun).map(([status, n]) => ({ status, n, share: methods.length ? (n / methods.length).toFixed(2) : "n/a" })));

  // 4. Graph quality: holes and conflicts for comparison with the review's open problems
  const candidates = (await graph.roQuery<{ kind: string; summary: string; sane: boolean; score: number }>(CANDIDATES, p({ projectId }))).data ?? [];
  console.log("\nAnalyst candidates (compare with the review's open problems):");
  for (const c of candidates) console.log(`- [${c.kind}${c.sane ? "" : ", failed sanity"}] ${c.summary}`);

  // 5. Hypothesis quality: the briefs for the blind comparison
  const briefs = (await graph.roQuery<{ statement: string; status: string; pass: number }>(BRIEFS, p({ projectId }))).data ?? [];
  console.log("\nBriefs (blind comparison with the review's open questions):");
  for (const b of briefs) console.log(`- [pass ${b.pass}, ${b.status}] ${b.statement}`);

  await (await getFalkor()).close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
