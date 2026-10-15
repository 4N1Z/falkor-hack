import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { match } from "ts-pattern";
import { CoreMessage } from 'ai';
export const runtime = "edge";
export const maxDuration = 30;

export async function POST(req: Request){

  // Check if the OPENAI_API_KEY is set, if not return 400
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "") {
    return new Response(
      "Missing OPENAI_API_KEY - make sure to add it to your .env file.",
      {
        status: 400,
      },
    );
  }

  let { prompt, option, command } = await req.json();

  const messages = match(option)
    .with("continue", () => [
      {
        role: "system",
        content:
          "You are an AI writing assistant that continues existing text based on context from prior text. " +
          "Give more weight/priority to the later characters than the earlier ones. " +
          "Limit your response to no more than 300 characters, but make sure to construct complete sentences." +
          "Use Markdown formatting only when appropriate.",
      },
      {
        role: "user",
        content: prompt,
      },
    ])
    .with("improve", () => [
      {
        role: "system",
        content:
          "You are an AI writing assistant that improves existing text. " +
          "Limit your response to no more than 300 characters, but make sure to construct complete sentences." +
          "Use Markdown formatting only when appropriate.",
      },
      {
        role: "user",
        content: `The existing text is: ${prompt}`,
      },
    ])
    .with("shorter", () => [
      {
        role: "system",
        content:
          "You are an AI writing assistant that shortens existing text. " +
          "Use Markdown formatting only when appropriate.",
      },
      {
        role: "user",
        content: `The existing text is: ${prompt}`,
      },
    ])
    .with("longer", () => [
      {
        role: "system",
        content:
          "You are an AI writing assistant that lengthens existing text. " +
          "Use Markdown formatting only when appropriate.",
      },
      {
        role: "user",
        content: `The existing text is: ${prompt}`,
      },
    ])
    .with("simplify", () => [
      {
        role: "system",
        content:
          "You are an AI writing assistant that simplifies existing text. " +
          "Limit your response to no more than 300 characters, but make sure to construct complete sentences." +
          "Use Markdown formatting only when appropriate.",
      },
      {
        role: "user",
        content: `The existing text is: ${prompt}`,
      },
    ])
    .with("fix", () => [
      {
        role: "system",
        content:
          "You are an AI writing assistant that fixes grammar and spelling errors in existing text. " +
          "Limit your response to no more than 300 characters, but make sure to construct complete sentences." +
          "Use Markdown formatting only when appropriate.",
      },
      {
        role: "user",
        content: `The existing text is: ${prompt}`,
      },
    ])
    .with("tone.professional", () => [
      {
        role: "system",
        content:
          "You are an AI writing assistant that changes the tone of existing text to be more professional. " +
          "Limit your response to no more than 300 characters, but make sure to construct complete sentences." +
          "Use Markdown formatting only when appropriate.",
      },
      {
        role: "user",
        content: `The existing text is: ${prompt}`,
      },
    ])
    .with("tone.casual", () => [
      {
        role: "system",
        content:
          "You are an AI writing assistant that changes the tone of existing text to be more casual. " +
          "Limit your response to no more than 300 characters, but make sure to construct complete sentences." +
          "Use Markdown formatting only when appropriate.",
      },
      {
        role: "user",
        content: `The existing text is: ${prompt}`,
      },
    ])
    .with("tone.straightforward", () => [
      {
        role: "system",
        content:
          "You are an AI writing assistant that changes the tone of existing text to be more straightforward. " +
          "Limit your response to no more than 300 characters, but make sure to construct complete sentences." +
          "Use Markdown formatting only when appropriate.",
      },
      {
        role: "user",
        content: `The existing text is: ${prompt}`,
      },
    ])
    .with("tone.casual", () => [
      {
        role: "system",
        content:
          "You are an AI writing assistant that changes the tone of existing text to be more casual. " +
          "Limit your response to no more than 300 characters, but make sure to construct complete sentences." +
          "Use Markdown formatting only when appropriate.",
      },
      {
        role: "user",
        content: `The existing text is: ${prompt}`,
      },
    ])
    .with("tone.confident", () => [
      {
        role: "system",
        content:
          "You are an AI writing assistant that changes the tone of existing text to be more confident. " +
          "Limit your response to no more than 300 characters, but make sure to construct complete sentences." +
          "Use Markdown formatting only when appropriate.",
      },
      {
        role: "user",
        content: `The existing text is: ${prompt}`,
      },
    ])
    .with("tone.friendly", () => [
      {
        role: "system",
        content:
          "You are an AI writing assistant that changes the tone of existing text to be more friendly. " +
          "Limit your response to no more than 300 characters, but make sure to construct complete sentences." +
          "Use Markdown formatting only when appropriate.",
      },
      {
        role: "user",
        content: `The existing text is: ${prompt}`,
      },
    ])
    .with("write.brainstorm", () => [
      {
        role: "system",
        content:
          "You are an AI writing assistant that generates text based on a prompt. " +
          "Limit your response to no more than 300 characters, but make sure to construct complete sentences." +
          "Use Markdown formatting only when appropriate.",
      },
      {
        role: "user",
        content: `The prompt is: ${prompt}`,
      },
    ])
    .with("write.outline", () => [
      {
        role: "system",
        content:
          "You are an AI writing assistant that creates an outline based on a prompt. " +
          "Limit your response to no more than 300 characters, but make sure to construct complete sentences." +
          "Use Markdown formatting only when appropriate.",
      },
      {
        role: "user",
        content: `The prompt is: ${prompt}`,
      },
    ])
    .with("write.todo", () => [
      {
        role: "system",
        content:
          "You are an AI writing assistant that creates a to-do list based on a prompt. " +
          "Limit your response to no more than 300 characters, but make sure to construct complete sentences." +
          "Use Markdown formatting only when appropriate.",
      },
      {
        role: "user",
        content: `The prompt is: ${prompt}`,
      },
    ])
    .with("write.pros", () => [
      {
        role: "system",
        content:
          "You are an AI writing assistant that lists pros and cons based on a prompt. " +
          "Limit your response to no more than 300 characters, but make sure to construct complete sentences." +
          "Use Markdown formatting only when appropriate.",
      },
      {
        role: "user",
        content: `The prompt is: ${prompt}`,
      },
    ])
    .with("summarize", () => [
      {
        role: "system",
        content:
          "You are an AI writing assistant that summarizes existing text. " +
          "Limit your response to no more than 300 characters, but make sure to construct complete sentences." +
          "Use Markdown formatting only when appropriate.",
      },
      {
        role: "user",
        content: `The existing text is: ${prompt}`,
      },
    ])
    .with("explain", () => [
      {
        role: "system",
        content:
          "You are an AI writing assistant that explains existing text. " +
          "Limit your response to no more than 300 characters, but make sure to construct complete sentences." +
          "Use Markdown formatting only when appropriate.",
      },
      {
        role: "user",
        content: `The existing text is: ${prompt}`,
      },
    ])
    .with("action", () => [
      {
        role: "system",
        content:
          "You are an AI writing assistant that finds action items in existing text. " +
          "Limit your response to no more than 300 characters, but make sure to construct complete sentences." +
          "Use Markdown formatting only when appropriate.",
      },
      {
        role: "user",
        content: `The existing text is: ${prompt}`,
      },
    ])
    .with("zap", () => [
      {
        role: "system",
        content:
          "You are an AI writing assistant that generates text based on a prompt. " +
          "You take an input from the user and a command for manipulating the text" +
          "Use Markdown formatting only when appropriate.",
      },
      {
        role: "user",
        content: `For this text: ${prompt}. You have to respect the command: ${command}`,
      },
    ])
    .run() as CoreMessage[];

    const result = await streamText({
      model: openai('gpt-4o-mini'),
      messages,
      temperature: 0.7,
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0,
    });
  
    return result.toDataStreamResponse();
}
