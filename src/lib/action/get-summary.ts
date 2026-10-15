"use server";

import { auth } from "@/auth";
import db from "@/db";
import { users } from "@/db/schema";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { eq } from "drizzle-orm";
import { extractUserContext } from "../utils";
import { UserContext } from "../types";

export async function getResearchPaperSummary() {
  const session = await auth();
  if (session === null || !session.user) {
    return { data: "Unauthorized", error: "401" };
  }

  // const result = await db.select({
  //   field1: users.id,
  //   field2: users.name,
  // }).from(users).where(eq(users.id, 42));

  // const user = await db.query.users.findFirst({
  //   where: (users, { eq }) => eq(users.id, 1),
  //   columns: {
  //     id: true,
  //     name: true
  //   }
  // });

  // Fetch user's onboarding data
  let userContext: UserContext = {
    name: "",
    university: "",
    designation: "",
    researchAreas: "",
  };

  try {
    const usersData = await db
      .select({
        onBoardingData: users.onBoardingData,
      })
      .from(users)
      .where(eq(users.id, session.user.id!));

    console.log("Onboarding Data ::", usersData[0].onBoardingData);

    if (usersData[0].onBoardingData) {
      userContext = extractUserContext(usersData[0].onBoardingData);
    }

    console.log("User Context:", userContext);
  } catch (error) {
    console.error("Error fetching onboarding details:", error);
  }

  const semanticScholarResponse = await fetch(
    // `${process.env.SEMANTIC_SCHOLAR_URL!}/paper/search?query=${encodeURIComponent(field)}i&limit=5&year=2005-2024&fields=title,abstract,authors,year,externalIds&sort=relevance`,
    `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(
      userContext.researchAreas
    )}i&limit=5&year=2005-2024&fields=title,abstract,authors,year,externalIds&sort=relevance`,
    {
      headers: {
        "Content-Type": "application/json",
      },
      next: { revalidate: 3600 },
    }
  );

  if (!semanticScholarResponse.ok) {
    throw new Error(`Failed to fetch papers for ${userContext.researchAreas}`);
  }

  const { data: papersData } = await semanticScholarResponse.json();

  console.log("Generating SUmmary :: ")

  const prompt = `As an ${userContext.designation} at ${
    userContext.university
  }, 
    provide a comprehensive, small summary of these papers related to ${
      userContext.researchAreas
    }.
    Papers: ${JSON.stringify(papersData)}
    Also do provide hyperlinks for the DOI data as : 'https://doi.org/[DOI]'
      Synthesize the information into a short and very concise overview that:
       - Focuses on the research paper, links and provide the hyperlinks.
       - Format the entire data to give clear cut 2 or 3 points only.
       - Highlight aspects particularly relevant to ${
         userContext.name
       }'s research areas.`;

  const summary = await generateText({
    model: openai("gpt-4o-mini"),
    system: `You are an AI specialized in analyzing research papers and providing personalized summaries based on the user's academic background and research interests.`,
    prompt,
    temperature: 0.3,
  });

  // console.log("Summary :: ,", summary.text);
  return { data: summary.text, error: null };
}
