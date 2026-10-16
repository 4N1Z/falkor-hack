"use server";

import { auth } from "@/auth";
import db from "@/db";
import { users } from "@/db/schema";
import { chatModel } from "@/lib/ai/models";
import { searchWorks } from "@/lib/graph/openalex";
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

  if (!userContext.researchAreas.trim()) {
    return { data: "Add your research areas in onboarding to get personalised paper suggestions.", error: "no-areas" };
  }

  // OpenAlex (keyless, same source the Librarian uses). Don't throw: a failed suggestion
  // widget shouldn't 500 the whole dashboard.
  const works = await searchWorks(userContext.researchAreas, 5).catch((err) => {
    console.error(`OpenAlex search failed for ${userContext.researchAreas}:`, err);
    return null;
  });
  if (!works) {
    return { data: "Couldn't load paper suggestions right now. Please try again later.", error: "network" };
  }
  if (!works.length) {
    return { data: `No recent papers found for “${userContext.researchAreas}”.`, error: "no-results" };
  }
  const papersData = works.map((w) => ({
    title: w.title,
    authors: w.authors.slice(0, 4),
    year: w.year,
    venue: w.venue,
    doi: w.doi,
    citations: w.citationCount,
    abstract: w.abstract?.slice(0, 600) ?? null,
  }));

  console.log("Generating SUmmary :: ")

  const prompt = `As an ${userContext.designation} at ${
    userContext.university
  }, 
    provide a comprehensive, small summary of these papers related to ${
      userContext.researchAreas
    }.
    Papers: ${JSON.stringify(papersData)}
    Link each paper by its doi as 'https://doi.org/[doi]' when a doi is present.
      Synthesize the information into a short and very concise overview that:
       - Focuses on the research paper, links and provide the hyperlinks.
       - Format the entire data to give clear cut 2 or 3 points only.
       - Highlight aspects particularly relevant to ${
         userContext.name
       }'s research areas.`;

  let summary;
  try {
    summary = await generateText({
      model: chatModel(),
      system: `You are an AI specialized in analyzing research papers and providing personalized summaries based on the user's academic background and research interests.`,
      prompt,
      temperature: 0.3,
    });
  } catch (error) {
    console.error("Summary generation failed:", error);
    return {
      data: "Couldn't generate a summary right now. Please try again later.",
      error: "generation",
    };
  }

  // console.log("Summary :: ,", summary.text);
  return { data: summary.text, error: null };
}
