import { auth } from "@/auth";
import { getFileData } from "@/db/actions/get-files";
import { searchSemanticScholar } from "@/lib/action/semantic-scholar";
import { myTools } from "@/utils/ai/tools";
import { openai } from "@ai-sdk/openai";
import {
  NoSuchToolError,
  InvalidToolArgumentsError,
  streamText,
  ToolExecutionError,
} from "ai";

export async function POST(req: Request) {

  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 403 });
  }
  const { messages, modelId, id } = await req.json();
  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: `You are Neura AI, a researcher assistant. ALWAYS follow this exact pattern:

    1. Provide a short explanation for the query if needed since you are a research assisstant
    2. Start with: "I'll search for research papers about [topic]."
    3. IMMEDIATELY make a tool call using getResearchPaper
    4. Never provide explanations without searching for papers first
    5. Always use the research tool for any academic or scientific topics 
    `,
    messages,
    maxSteps: 5,
    tools: myTools,
    temperature: 0.4,
  });
  

  return result.toDataStreamResponse({
    getErrorMessage: (error) => {
      if (NoSuchToolError.isInstance(error)) {
        return "The model tried to call an unknown tool.";
      } else if (InvalidToolArgumentsError.isInstance(error)) {
        return "The model called a tool with invalid arguments.";
      } else if (ToolExecutionError.isInstance(error)) {
        return "An error occurred during tool execution. Please try rephrasing your query.";
      } else {
        return "An unexpected error occurred. Please try again.";
      }
    },
  });
}
