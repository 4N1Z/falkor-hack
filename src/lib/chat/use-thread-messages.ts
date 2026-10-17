"use client";

// History of a chat thread from Postgres, polled only while the panel is visible. The fetcher
// asks for rows after the newest seq it already has, so a quiet thread costs one indexed query
// that returns []. SWR is the single source of truth for persisted messages; useChat holds only
// the turn currently streaming.

import useSWR, { useSWRConfig } from "swr";
import type { ChatMessageDTO } from "./types";

const POLL_MS = 4000;

const normalize = (list: ChatMessageDTO[]): ChatMessageDTO[] =>
  [...list]
    .map((m) => ({ ...m, createdAt: m.createdAt ? new Date(m.createdAt) : undefined }))
    .sort((a, b) => a.seq - b.seq);

export function threadMessagesKey(workspaceId: string, threadId: string) {
  return `/api/neura-ai/threads/${threadId}/messages?workspaceId=${workspaceId}`;
}

export function useThreadMessages(input: { workspaceId?: string; threadId?: string; visible: boolean; fallbackData?: ChatMessageDTO[] }) {
  const key = input.workspaceId && input.threadId ? threadMessagesKey(input.workspaceId, input.threadId) : null;
  const { cache } = useSWRConfig();

  const fetcher = async (url: string): Promise<ChatMessageDTO[]> => {
    const prev = (cache.get(url)?.data as ChatMessageDTO[] | undefined) ?? input.fallbackData ?? [];
    const maxSeq = prev.reduce((m, x) => Math.max(m, x.seq), 0);
    const res = await fetch(maxSeq ? `${url}&after=${maxSeq}` : url);
    const body = (await res.json().catch(() => ({}))) as { messages?: ChatMessageDTO[]; error?: string };
    if (!res.ok) throw new Error(body.error ?? "Couldn't load the chat");
    const fresh = body.messages ?? [];
    if (!maxSeq) return normalize(fresh);
    if (!fresh.length) return prev;
    const byId = new Map(prev.map((m) => [m.id, m]));
    fresh.forEach((m) => byId.set(m.id, m));
    return normalize([...byId.values()]);
  };

  // Hidden panels still fetch once on mount and on window focus (so the unread badge can show
  // before the tab is opened); only the periodic poll is gated on visibility.
  return useSWR<ChatMessageDTO[]>(key, fetcher, {
    refreshInterval: input.visible ? POLL_MS : 0,
    revalidateOnFocus: true,
    keepPreviousData: true,
    dedupingInterval: 1000,
    fallbackData: input.fallbackData ? normalize(input.fallbackData) : undefined,
  });
}
