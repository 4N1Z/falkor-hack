// Shapes shared by the chat API routes and the client. Client-safe: types only.

import type { Message } from "ai";
import type { Route } from "./route-names";

export interface ChatAuthor {
  id: string;
  name: string | null;
  image: string | null;
}

/** Provenance carried on every assistant message, live (stream annotation) and persisted alike. */
export interface ChatAnnotation {
  route: Route;
  runId: string | null;
  confidence: number | null;
}

/** A persisted message as the client renders it: an AI SDK Message plus who wrote it and where it sits. */
export type ChatMessageDTO = Omit<Message, "annotations"> & {
  /** Strictly increasing within a thread; the poll cursor */
  seq: number;
  author: ChatAuthor | null;
  /** Document the question was asked from, if any */
  fileId: string | null;
  annotations?: ChatAnnotation[];
};

export interface ChatThreadDTO {
  id: string;
  workspaceId: string;
  title: string;
  isDefault: boolean;
  createdAt: string;
  lastMessageAt: string | null;
}

/** Threaded request body for POST /api/neura-ai (built by useChat's prepareRequestBody). */
export interface ChatTurnRequest {
  threadId: string;
  workspaceId: string;
  fileId?: string;
  message: { id: string; role: "user"; content: string; createdAt?: string | Date };
}
