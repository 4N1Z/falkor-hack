// Embeddings via Cohere (embed-english-v3.0, 1024-d). Cohere embeds stored text and search
// queries differently: anything written to the graph (papers, passages, notes) is a
// "document", anything we search with is a "query". Mixing them up still works, but ranks worse.
// Changing the model or dimension requires re-embedding: scripts/reembed.ts.

import { cohere } from "@ai-sdk/cohere";
import { embedMany } from "ai";
import { EMBEDDING_DIM } from "./schema";

export const EMBEDDING_MODEL = "embed-english-v3.0";
const MAX_CHARS = 2000; // title + start of abstract is plenty for retrieval
const BATCH = 96; // Cohere's limit per request

export type EmbedKind = "document" | "query";

const models = {
  document: cohere.embedding(EMBEDDING_MODEL, { inputType: "search_document", truncate: "END" }),
  query: cohere.embedding(EMBEDDING_MODEL, { inputType: "search_query", truncate: "END" }),
};

export const paperEmbeddingText = (title: string, abstract?: string | null) =>
  `${title}\n\n${abstract ?? ""}`.slice(0, MAX_CHARS).trim();

export async function embedTexts(texts: string[], kind: EmbedKind = "query"): Promise<number[][]> {
  if (!texts.length) return [];
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const { embeddings } = await embedMany({
      model: models[kind],
      values: texts.slice(i, i + BATCH).map((t) => t.slice(0, MAX_CHARS) || " "),
    });
    out.push(...embeddings);
  }
  if (out[0].length !== EMBEDDING_DIM) throw new Error(`${EMBEDDING_MODEL} returned ${out[0].length}-d vectors, expected ${EMBEDDING_DIM}`);
  return out;
}

export async function embedText(text: string, kind: EmbedKind = "query"): Promise<number[]> {
  return (await embedTexts([text], kind))[0];
}
