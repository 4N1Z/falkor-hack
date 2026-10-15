import { openai } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";
import { EMBEDDING_DIM } from "./schema";

const model = openai.embedding("text-embedding-3-small", { dimensions: EMBEDDING_DIM });
const MAX_CHARS = 2000; // title + start of abstract is plenty for retrieval
const CHUNK = 96;

export const paperEmbeddingText = (title: string, abstract?: string | null) =>
  `${title}\n\n${abstract ?? ""}`.slice(0, MAX_CHARS).trim();

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += CHUNK) {
    const { embeddings } = await embedMany({ model, values: texts.slice(i, i + CHUNK) });
    out.push(...embeddings);
  }
  return out;
}

export async function embedText(text: string): Promise<number[]> {
  const { embedding } = await embed({ model, value: text.slice(0, MAX_CHARS) });
  return embedding;
}
