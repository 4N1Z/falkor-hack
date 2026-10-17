"use client";

import NeuraAIChat from "@/components/AI/neura-ai-chat";
import type { ResearchPaper } from "@/components/AI/blocks/research-message-block";
import { citationContent, citationHref, citationLabel } from "@/lib/citations";
import type { ChatThreadDTO } from "@/lib/chat/types";
import { useAppState } from "@/lib/providers/state-providers";
import { useUser } from "@/lib/providers/user-provider";
import { useCurrentEditor } from "@tiptap/react";
import { useCallback } from "react";
import { toast } from "sonner";
import useSWR from "swr";

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    const b = await r.json();
    if (!r.ok) throw new Error(b.error ?? "Couldn't open the chat");
    return b as { threads: ChatThreadDTO[]; defaultThreadId: string };
  });

/**
 * The workspace chat inside a document: the same shared thread as the dashboard, with "Cite"
 * on every paper card inserting a graph-resolvable citation at the caret. Stays mounted while
 * other rail tabs are shown so a streaming answer is never lost.
 */
export function WorkspaceChatPanel({ fileId, visible, onUnread }: { fileId: string; visible: boolean; onUnread: (n: number) => void }) {
  const { workspaceId } = useAppState();
  const { editor } = useCurrentEditor();
  const { session } = useUser();
  const { data, error } = useSWR(workspaceId ? `/api/neura-ai/threads?workspaceId=${workspaceId}` : null, fetcher, { revalidateOnFocus: false });
  const threadId = data?.defaultThreadId;

  const onCite = useCallback(
    (paper: ResearchPaper) => {
      if (!editor) return;
      const label = citationLabel({ authors: paper.authors.map((a) => a.name), year: paper.year, title: paper.title });
      const href = citationHref({ doi: paper.externalIds?.DOI ?? null, paperId: paper.paperId });
      const at = editor.state.selection.to;
      const before = editor.state.doc.textBetween(Math.max(0, at - 1), at);
      editor.chain().focus().insertContentAt(at, citationContent(label, href, !!before && !/\s/.test(before))).run();
      toast.success(`Cited ${label}`, { description: paper.owners?.length ? `From ${paper.owners.join(" & ")}'s library` : undefined });
    },
    [editor],
  );

  if (error) return <p className="p-3 text-xs text-muted-foreground">Couldn&apos;t open the team chat. It will retry when you come back.</p>;
  if (!workspaceId || !threadId) {
    return (
      <ul className="space-y-3 p-3" aria-busy="true" aria-label="Opening the chat">
        {[70, 50].map((w, i) => (
          <li key={i} className="flex gap-2">
            <span className="size-6 shrink-0 rounded-full bg-muted" />
            <div className="h-3.5 flex-1 rounded bg-muted" style={{ maxWidth: `${w}%` }} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <NeuraAIChat
      key={threadId}
      variant="rail"
      workspaceId={workspaceId}
      threadId={threadId}
      fileId={fileId}
      me={{ id: session?.user?.id ?? "", name: session?.user?.name ?? null, image: session?.user?.image ?? null }}
      visible={visible}
      onCite={onCite}
      onUnread={onUnread}
    />
  );
}
