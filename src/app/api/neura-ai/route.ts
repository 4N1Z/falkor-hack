import { auth } from "@/auth";
import { checkWorkspaceAccess } from "@/db/actions/authorization-check";
import { ROUTE_NAMES, routeMessage } from "@/lib/agents/router";
import { myTools } from "@/utils/ai/tools";
import { openai } from "@ai-sdk/openai";
import {
  NoSuchToolError,
  InvalidToolArgumentsError,
  streamText,
  ToolExecutionError,
  type CoreMessage,
} from "ai";

export const runtime = "nodejs";
export const maxDuration = 120;

const GENERAL_SYSTEM = `You are Neura AI, a researcher assistant. ALWAYS follow this exact pattern:

    1. Provide a short explanation for the query if needed since you are a research assisstant
    2. Start with: "I'll search for research papers about [topic]."
    3. IMMEDIATELY make a tool call using getResearchPaper
    4. Never provide explanations without searching for papers first
    5. Always use the research tool for any academic or scientific topics
    `;

const errorMessage = (error: unknown) => {
  if (NoSuchToolError.isInstance(error)) return "The model tried to call an unknown tool.";
  if (InvalidToolArgumentsError.isInstance(error)) return "The model called a tool with invalid arguments.";
  if (ToolExecutionError.isInstance(error)) return "An error occurred during tool execution. Please try rephrasing your query.";
  return "An unexpected error occurred. Please try again.";
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 403 });
  }
  const { messages, workspaceId, fileId } = (await req.json()) as {
    messages: CoreMessage[];
    workspaceId?: string;
    fileId?: string;
  };

  // Router: hand research requests to the specialist agent that owns them (JEV choice)
  const last = [...messages].reverse().find((m) => m.role === "user");
  const lastText = typeof last?.content === "string" ? last.content : "";
  if (workspaceId && lastText && (await checkWorkspaceAccess(workspaceId, session.user.id))) {
    try {
      const routed = await routeMessage({ workspaceId, userId: session.user.id, fileId, message: lastText });
      if (routed.route !== "general") {
        const name = ROUTE_NAMES[routed.route];
        const result = streamText({
          model: openai("gpt-4o-mini"),
          temperature: 0.2,
          system:
            `You are Neura AI. The ${name} agent just ran over the team's research graph (FalkorDB) and returned the evidence below. ` +
            `Answer the user's last message using ONLY this evidence. Start with "**${name}**:" then a concise answer in Markdown. ` +
            `Name papers with their citation labels and say whose library they come from. If the evidence is empty, say so plainly. Never invent papers.\n\n` +
            `Evidence:\n${routed.brief || "(none)"}`,
          messages,
        });
        return result.toDataStreamResponse({ getErrorMessage: errorMessage });
      }
    } catch (err) {
      console.error("[neura-ai] routing failed, answering generally", err);
    }
  }

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: GENERAL_SYSTEM,
    messages,
    maxSteps: 5,
    tools: myTools,
    temperature: 0.4,
  });
  return result.toDataStreamResponse({ getErrorMessage: errorMessage });
}
