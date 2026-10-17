"use client";

import type { Message } from "ai";
import { useChat } from "ai/react";
import { useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ROUTE_NAMES } from "@/lib/chat/route-names";
import type { ChatAuthor, ChatMessageDTO } from "@/lib/chat/types";
import { useThreadMessages } from "@/lib/chat/use-thread-messages";
import { markSeen, useSeenSeq } from "@/lib/chat/visibility";
import { neuraQueryLogo } from "@/lib/logos";
import { cn, isSupportedBrowser } from "@/lib/utils";
import ResearchMessage, { type ResearchPaper } from "./blocks/research-message-block";
import { MessageActions } from "./blocks/message-actions";
import { VoiceRecorder } from "./voice-recorder";

const press = "transition-transform duration-150 ease-out active:scale-[0.97]";
const enter = "animate-in fade-in-0 slide-in-from-bottom-1 duration-150 ease-out fill-mode-both motion-reduce:animate-none";

export interface NeuraAIChatProps {
  workspaceId: string;
  threadId: string;
  /** Document the chat is open beside, when inside the editor */
  fileId?: string;
  /** For attribution of my own messages before the server echoes them */
  me: ChatAuthor;
  /** Server-fetched history (dashboard); becomes SWR's fallback */
  initialMessages?: ChatMessageDTO[];
  /** Gates polling and the unread marker */
  visible: boolean;
  variant: "card" | "rail";
  /** Present only inside a document: insert a citation for a paper card */
  onCite?: (paper: ResearchPaper) => void;
  /** Unread count for the rail badge */
  onUnread?: (n: number) => void;
}

type Shown = (ChatMessageDTO | Message) & { seq?: number; author?: ChatAuthor | null };

const seqOf = (m: Shown) => (typeof m.seq === "number" ? m.seq : Number.MAX_SAFE_INTEGER);
const timeOf = (m: Shown) => (m.createdAt ? new Date(m.createdAt).getTime() : 0);
const initials = (name: string | null) =>
  (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";
const clock = (d?: Date | string) => (d ? new Date(d).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "");

/**
 * The shared team chat. Persisted history comes from Postgres through SWR; useChat holds only the
 * turn being streamed, and hands over to the server copy when it finishes. The same component
 * renders on the dashboard (card) and in the research rail beside a document (rail).
 */
export default function NeuraAIChat({ workspaceId, threadId, fileId, me, initialMessages, visible, variant, onCite, onUnread }: NeuraAIChatProps) {
  const { data: server = [], mutate, error: loadError, isLoading } = useThreadMessages({ workspaceId, threadId, visible, fallbackData: initialMessages });

  const { messages: local, input, handleInputChange, handleSubmit, status, setMessages } = useChat({
    id: threadId,
    api: "/api/neura-ai",
    initialMessages: [],
    maxSteps: 4,
    // The server rebuilds history from Postgres; only the new turn travels
    experimental_prepareRequestBody: ({ id, messages }) => {
      const last = messages[messages.length - 1];
      return { threadId: id, workspaceId, fileId, message: { id: last.id, role: "user", content: last.content } };
    },
    onFinish: async () => {
      // The persisted copy (with seq and author) replaces the local turn
      await mutate();
      setMessages([]);
    },
    onError: (e) => toast.error(e.message || "Neura couldn't answer right now"),
  });
  const busy = status === "submitted" || status === "streaming";

  // Server rows first, local turns override by id (the streaming text wins), ordered by seq then time
  const shown = useMemo<Shown[]>(() => {
    const byId = new Map<string, Shown>();
    server.forEach((m) => byId.set(m.id, m));
    local.forEach((m) => byId.set(m.id, byId.get(m.id) ?? m));
    return [...byId.values()].sort((a, b) => seqOf(a) - seqOf(b) || timeOf(a) - timeOf(b));
  }, [server, local]);

  // Unread: rows from other people since this browser last looked at the thread
  const seen = useSeenSeq(threadId);
  const maxSeq = server.length ? server[server.length - 1].seq : 0;
  const unread = useMemo(() => server.filter((m) => m.seq > seen && m.author?.id !== me.id).length, [server, seen, me.id]);
  useEffect(() => {
    if (visible && maxSeq > seen) markSeen(threadId, maxSeq); // storage write, not state
  }, [visible, maxSeq, seen, threadId]);
  useEffect(() => onUnread?.(unread), [unread, onUnread]);

  // Keep the newest message in view
  const endRef = useRef<HTMLDivElement>(null);
  const lastKey = `${shown.length}:${status}:${(shown[shown.length - 1]?.content ?? "").length}`;
  useEffect(() => {
    if (visible) endRef.current?.scrollIntoView({ block: "end" });
  }, [lastKey, visible]);

  const [voice] = useState(() => isSupportedBrowser());
  const pad = variant === "card" ? "px-4" : "px-3";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("min-h-0 flex-1 space-y-3 overflow-y-auto py-3", pad)} aria-live="polite">
        {loadError ? (
          <p className="text-xs text-muted-foreground">Couldn&apos;t load the thread. It will retry.</p>
        ) : isLoading && !shown.length ? (
          <ul className="space-y-3" aria-busy="true" aria-label="Loading chat">
            {[70, 45, 60].map((w, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-0.5 size-6 shrink-0 rounded-full bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-20 rounded bg-muted" />
                  <div className="h-3.5 rounded bg-muted" style={{ width: `${w}%` }} />
                </div>
              </li>
            ))}
          </ul>
        ) : !shown.length ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <p className="text-sm font-medium">Ask the team&apos;s graph</p>
            <p className="max-w-[30ch] text-xs text-muted-foreground">Ask about the team&apos;s papers, or paste a sentence to find citations for it. Everyone in the workspace sees this thread.</p>
          </div>
        ) : (
          shown.map((m, i) => {
            const isUser = m.role === "user";
            const author = m.author ?? (isUser ? me : null);
            const route = (m as ChatMessageDTO).annotations?.[0]?.route;
            const streaming = busy && i === shown.length - 1 && !isUser && typeof m.seq !== "number";
            return (
              <div key={m.id} className={cn("group flex gap-2", enter)} style={{ animationDelay: `${Math.min(i, 6) * 20}ms` }}>
                {isUser ? (
                  <Avatar className="mt-0.5 size-6 shrink-0">
                    {author?.image && <AvatarImage src={author.image} alt="" />}
                    <AvatarFallback className="text-[10px]">{initials(author?.name ?? null)}</AvatarFallback>
                  </Avatar>
                ) : (
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-sky-100 [&_svg]:size-4">{neuraQueryLogo}</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] leading-4 text-muted-foreground">
                    <span className="font-medium text-foreground">{isUser ? (author?.id === me.id ? "You" : (author?.name ?? "Collaborator")) : "Neura"}</span>
                    {!isUser && route && route !== "general" && (
                      <span className="rounded bg-sky-50 px-1 text-[10px] font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300">{ROUTE_NAMES[route]}</span>
                    )}
                    {m.createdAt && <span className="tabular-nums">{clock(m.createdAt)}</span>}
                  </p>
                  {isUser ? (
                    <Markdown className="prose prose-sm max-w-none text-sm leading-relaxed dark:prose-invert">{m.content}</Markdown>
                  ) : (
                    <div className={cn("rounded-md border bg-card p-2.5", streaming && "border-sky-200")}>
                      {!m.content && streaming && !(m as Message).toolInvocations?.length ? (
                        <div className="space-y-1.5" aria-busy="true">
                          <div className="h-3 w-3/4 rounded bg-muted" />
                          <div className="h-3 w-1/2 rounded bg-muted" />
                        </div>
                      ) : (
                        <ResearchMessage message={m as Message} onCite={onCite} />
                      )}
                      {!streaming && m.content && (
                        <MessageActions
                          text={m.content}
                          workspaceId={workspaceId}
                          fileId={fileId}
                          className="mt-1.5 sm:opacity-0 sm:transition-opacity sm:duration-150 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim() || busy) return;
          handleSubmit(e);
        }}
        className={cn("border-t py-2", pad)}
      >
        <div className="flex items-center gap-1 rounded-lg border bg-card pl-3 pr-1 focus-within:ring-1 focus-within:ring-ring">
          <input
            id={`chat-input-${threadId}`}
            type="text"
            value={input}
            onChange={handleInputChange}
            placeholder={fileId ? "Ask about the team's papers or this draft…" : "Ask about the team's papers…"}
            className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            autoComplete="off"
          />
          {voice && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <VoiceRecorder onTranscript={(t) => handleInputChange({ target: { value: input + t } } as React.ChangeEvent<HTMLInputElement>)} />
                </TooltipTrigger>
                <TooltipContent>Dictate</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send"
            className={cn("flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50", press)}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          </button>
        </div>
      </form>
    </div>
  );
}
