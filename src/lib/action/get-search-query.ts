'use server';

import { auth } from "@/auth";
import { chatModel } from "@/lib/ai/models";
import { generateObject, generateText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

export async function getSearchQuery(text: string) {
  const session = await auth();
  if (session === null || !session.user) {
    return { data: "Unauthorized", error: "401" };
  }

  console.log("In search Query :", text)

  const prompt = `Analyze this academic text and generate a focused search query 
    for finding relevant research papers. Extract the key concepts and technical terms 
    that would be most relevant for an academic paper search.

    Text to analyze: "${text}"

    Generate a concise search query that:
    1. Captures the core research concepts
    2. Includes key technical terms
    3. Is optimized for academic search
    4. Focuses on the main research topic

    Return only the search query, no explanations.`;

  const { object : searchQuery } = await generateObject({
    model: chatModel(),
    temperature: 0.3,
    schema: z.object({
      searchQuery:z.string().describe("3 or 4 Words to search in semantic scholar")
    }),
    prompt:`Generate words related to this paragraph : ${text} .

    !!! Captures only the most important words !!!
    !!! Also remeber this words will be used to search for research papers !!!
    `
  });

  console.log("Out of Search Query : ", searchQuery)
  return { data: searchQuery.searchQuery, error: null };
}
