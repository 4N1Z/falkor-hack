import { searchSemanticScholar } from "@/lib/action/semantic-scholar";
import { tool as createTool } from "ai";
import { z } from "zod";

export const researchPaperTool = createTool({
  description: "Search for academic research papers based on the context",
  parameters: z.object({
    keyword: z.string().describe("The keyword of the research paper to search"),
  }),
  execute: async ({ keyword }: { keyword: string }) => {
    try {
      const papers = await searchSemanticScholar(keyword, 3);
      
      if (!papers || papers === "No Papers available") {
        return {
          status: 'NO_RESULTS',
          papers: [],
          message: `No research papers found for "${keyword}". Consider exploring related topics or alternative search terms.`
        };
      }

      return {
        status: 'SUCCESS',
        papers
      };
    } catch (error) {
      return {
        status: 'ERROR',
        papers: [],
        message: `Error searching for papers about "${keyword}". Please try a different search term.`
      };
    }
  },
});

export const myTools = {
  getResearchPaper: researchPaperTool,
};