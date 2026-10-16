// Ghost Writer — one job: offer the next few words of the paragraph you're writing, grounded
// in the team's papers. Shown as grey ghost text; Tab accepts, anything else dismisses.
// Runs often, so it records no AgentRun (that would flood the graph); it's gated by JEV so it
// only speaks when the author is mid-thought.

import { chatModel } from "@/lib/ai/models";
import { generateText } from "ai";
import { searchTeamLibrary } from "../graph/team-search";
import { worthContinuing } from "../jev";

const GATE = 0.55;

export interface GhostResult {
  text: string | null;
  /** Why there's no suggestion, when text is null */
  skipped?: "too_short" | "complete" | "empty";
  sources: { title: string; owners: string[] }[];
  ms: number;
}

export async function runGhostWriter(input: { workspaceId: string; textBeforeCursor: string }): Promise<GhostResult> {
  const started = Date.now();
  const paragraph = input.textBeforeCursor.slice(-1500);
  if (paragraph.trim().length < 40) return { text: null, skipped: "too_short", sources: [], ms: 0 };

  const [gate, sources] = await Promise.all([
    worthContinuing(paragraph),
    searchTeamLibrary(input.workspaceId, paragraph.slice(-400), { limit: 3 }),
  ]);
  if (gate.result.value < GATE) return { text: null, skipped: "complete", sources: [], ms: Date.now() - started };

  const context = sources
    .map((s, i) => `[${i + 1}] ${s.title}: ${(s.passage?.text ?? s.abstract ?? "").replace(/\s+/g, " ").slice(0, 500)}`)
    .join("\n");
  const { text } = await generateText({
    model: chatModel(),
    temperature: 0.3,
    maxTokens: 40,
    system:
      "You continue a researcher's paragraph. Write ONLY the next words (at most 20), matching their voice. " +
      "Stay with facts supported by the sources; never invent numbers, names or citations; no quotes or brackets. " +
      "Finish the current sentence if it is incomplete; otherwise begin the next sentence. Output the continuation text only.",
    prompt: `Sources from the team's library:\n${context || "(none)"}\n\nParagraph so far:\n${paragraph}`,
  });

  let continuation = text.replace(/^["'\s]+|["']+$/g, "").replace(/\s+/g, " ").trim();
  // One sentence at most: stop at the first sentence end, else at the last comma within 22 words
  const sentenceEnd = continuation.search(/[.!?](\s|$)/);
  if (sentenceEnd >= 0) continuation = continuation.slice(0, sentenceEnd + 1);
  const words = continuation.split(" ");
  if (words.length > 22) {
    const clipped = words.slice(0, 22).join(" ");
    const comma = clipped.lastIndexOf(",");
    continuation = comma > 20 ? clipped.slice(0, comma) : clipped;
  }
  if (!continuation) return { text: null, skipped: "empty", sources: [], ms: Date.now() - started };
  // Leading space unless the paragraph already ends with one
  const needsSpace = !/\s$/.test(paragraph) && !/^[,.;:)]/.test(continuation);
  return {
    text: (needsSpace ? " " : "") + continuation,
    sources: sources.slice(0, 2).map((s) => ({ title: s.title, owners: s.owners })),
    ms: Date.now() - started,
  };
}
