"use client";

import NeuraAIChat from "@/components/AI/neura-ai-chat";
import { NeuraGlass } from "@/components/AI/neura-glass";
import type { ChatThreadDTO } from "@/lib/chat/types";
import { setChatPopupOpen, useChatPopupOpen, useWorkspaceChatVisible } from "@/lib/chat/visibility";
import { neuraQueryLogo } from "@/lib/logos";
import { useUser } from "@/lib/providers/user-provider";
import { cn } from "@/lib/utils";
import { Sparkles, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    const b = await r.json();
    if (!r.ok) throw new Error(b.error ?? "Couldn't open the chat");
    return b as { threads: ChatThreadDTO[]; defaultThreadId: string };
  });

/**
 * The team chat as a floating popup, bottom-right, on the dashboard and graph pages. Inside a
 * document the research rail has the same thread, so the popup stays out of the way there.
 * The sidebar switch decides whether it exists at all; the launcher opens and closes it. The
 * chat stays mounted while closed, so the launcher can show unread messages and a reply that is
 * still streaming is not lost.
 */
export default function WorkspaceChatPopup({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname() ?? "";
  const inEditor = /^\/dashboard\/[^/]+\/(?!graph(?:\/|$))[^/]+/.test(pathname);
  const enabled = useWorkspaceChatVisible();
  const open = useChatPopupOpen();
  const { session } = useUser();
  const [unread, setUnread] = useState(0);
  const onUnread = useCallback((n: number) => setUnread(n), []);

  const active = enabled && !inEditor;
  const { data, error } = useSWR(active ? `/api/neura-ai/threads?workspaceId=${workspaceId}` : null, fetcher, { revalidateOnFocus: false });
  const threadId = data?.defaultThreadId;
  if (!active) return null;

  const me = { id: session?.user?.id ?? "", name: session?.user?.name ?? null, image: session?.user?.image ?? null };
  const showing = open && !!threadId;

  return (
    <>
      {/* Panel: scales in from the launcher's corner; inert and invisible when closed */}
      <div
        inert={!showing}
        aria-label="Workspace AI chat"
        role="dialog"
        className={cn(
          "fixed bottom-24 right-6 z-40 h-[600px] max-h-[calc(100dvh-8rem)] w-[420px] max-w-[calc(100vw-3rem)] origin-bottom-right font-sans",
          "transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
          showing ? "opacity-100 translate-y-0 scale-100" : "pointer-events-none opacity-0 translate-y-2 scale-[0.98]",
        )}
      >
        <NeuraGlass className="h-full">
          <div className="flex h-full flex-col">
            <header className="flex items-center justify-between gap-3 border-b border-white/60 px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <Sparkles className="size-4 shrink-0 text-primary" />
                <h2 className="text-sm font-semibold">Workspace AI chat</h2>
                <span className="truncate text-xs text-muted-foreground">· {data?.threads.find((t) => t.id === threadId)?.title ?? "Team chat"} · shared</span>
              </div>
              <button
                type="button"
                onClick={() => setChatPopupOpen(false)}
                aria-label="Close chat"
                className="rounded-md p-1 text-muted-foreground transition-transform duration-150 ease-out hover:bg-white/60 hover:text-foreground active:scale-[0.96]"
              >
                <X className="size-4" />
              </button>
            </header>
            <div className="min-h-0 flex-1">
              {error ? (
                <p className="p-4 text-xs text-muted-foreground">Couldn&apos;t open the team chat. It will retry.</p>
              ) : threadId ? (
                <NeuraAIChat key={threadId} variant="card" workspaceId={workspaceId} threadId={threadId} me={me} visible={showing} onUnread={onUnread} />
              ) : null}
            </div>
          </div>
        </NeuraGlass>
      </div>

      {/* Launcher */}
      <button
        type="button"
        onClick={() => setChatPopupOpen(!open)}
        aria-expanded={showing}
        aria-label={showing ? "Close workspace chat" : unread ? `Open workspace chat, ${unread} new` : "Open workspace chat"}
        title="Workspace AI chat"
        className={cn(
          "fixed bottom-6 right-6 z-40 flex size-12 items-center justify-center rounded-full bg-white ring-1 ring-sky-100",
          "shadow-[0px_8px_20px_rgba(109,205,247,0.35)] transition-[transform,box-shadow] duration-150 ease-out hover:shadow-[0px_10px_24px_rgba(109,205,247,0.5)] active:scale-[0.96]",
          "[&_svg]:size-6",
        )}
      >
        {showing ? <X className="!size-5 text-muted-foreground" /> : neuraQueryLogo}
        {!showing && unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-semibold tabular-nums text-white ring-2 ring-white">
            {unread}
          </span>
        )}
      </button>
    </>
  );
}
