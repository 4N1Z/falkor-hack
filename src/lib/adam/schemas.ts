// The extraction card (spec, Phase 2 · Extract): one fixed schema per paper, filled by the
// Extractor and checked item by item by the Verifier. Free-text summaries drift and cannot be
// diffed; this cannot. Every item carries the passage it came from (chunkId + verbatim quote),
// which is what makes "no claim without a source" enforceable.

import { z } from "zod";
import type { Section } from "../graph/document-index";

export const SECTIONS = ["front", "abstract", "introduction", "related", "methods", "results", "discussion", "limitations", "conclusion", "appendix", "supplementary", "unknown"] as const satisfies readonly Section[];

const Item = z.object({
  localId: z.string().describe("Short id unique within this card, e.g. c1, e1, m1, a1"),
  text: z.string().describe("One precise statement in your own words; keep numbers and conditions"),
  chunkId: z.string().describe("The id of the ONE chunk the quote is copied from, exactly as shown in [c:…]"),
  quote: z.string().describe("A verbatim passage (20–400 characters) copied from that chunk that supports the item"),
  confidence: z.number().min(0).max(1).describe("How sure you are the source says this"),
});

export const ClaimItem = Item.extend({
  section: z.enum(SECTIONS).describe("The section of the chunk the quote is from"),
  speculative: z.boolean().describe("true when the statement is a Discussion / Conclusion interpretation rather than a Results finding"),
  conditions: z.array(z.string()).describe("Conditions under which the claim was shown to hold (dataset, scale, temperature, model size…)"),
  evidenceRefs: z.array(z.string()).describe("localIds of evidence items that back this claim"),
  methodRefs: z.array(z.string()).describe("localIds of methods this claim's result was obtained with"),
  assumptionRefs: z.array(z.string()).describe("localIds of assumptions this claim depends on"),
});

export const EvidenceItem = Item.extend({
  kind: z.enum(["figure", "table", "statistic", "text"]),
  locator: z.string().nullable().describe("'Figure 3b', 'Table 2', 'n = 12' …"),
});

export const MethodItem = Item.extend({
  name: z.string().describe("The technique as the paper names it, e.g. 'dense passage retrieval', 'cryo-EM'"),
  parameters: z.array(z.string()).describe("Parameters the paper gives for it (sizes, settings, versions), as short strings"),
});

export const AssumptionItem = Item.extend({
  stated: z.boolean().describe("true if the paper states it, false if it is unstated but required"),
  claimRefs: z.array(z.string()).describe("localIds of claims that depend on this assumption"),
});

export const LimitationItem = Item.extend({
  claimRefs: z.array(z.string()).describe("localIds of claims this limitation bounds"),
});

export const ExtractionCardSchema = z.object({
  claims: z.array(ClaimItem).max(18).describe("What the paper says it showed, one precise statement each"),
  evidence: z.array(EvidenceItem).max(18).describe("The experiments, figures, tables or statistics that support the claims"),
  methods: z.array(MethodItem).max(12).describe("Techniques used, as named by the paper, with the parameters it gives"),
  assumptions: z.array(AssumptionItem).max(10).describe("What must be true for the claims to hold, stated or unstated"),
  limitations: z.array(LimitationItem).max(8).describe("Conditions under which the paper says its claims stop holding"),
  gaps: z.array(Item).max(6).describe("Things the paper says nobody has tested yet"),
  contradictions: z
    .array(z.object({ claimRef: z.string(), withText: z.string().describe("What it contradicts, as the paper puts it"), quote: z.string(), chunkId: z.string() }))
    .max(6)
    .describe("Where the paper disagrees with prior work, or with itself"),
});

export type ExtractionCard = z.infer<typeof ExtractionCardSchema>;
export type ClaimItemT = z.infer<typeof ClaimItem>;
export type EvidenceItemT = z.infer<typeof EvidenceItem>;
export type MethodItemT = z.infer<typeof MethodItem>;
export type AssumptionItemT = z.infer<typeof AssumptionItem>;
