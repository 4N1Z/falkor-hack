"use client";

import type { MemoryKind } from "@/lib/agents/historian";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { BookmarkPlus, ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const press = "transition-transform duration-150 ease-out active:scale-[0.97]";

/** Strip the "**Agent**:" lead-in the evidence prompt asks for, so the note reads as a statement. */
const cleanAnswer = (text: string) => text.replace(/^\s*\*\*[^*]{1,40}\*\*:\s*/, "").trim();

/**
 * Explicit write-back from a chat answer into the research graph. Nothing here runs on its own:
 * a person picks what to keep. If text is selected inside the answer, that selection is what is
 * remembered; otherwise the whole answer.
 */
export function MessageActions({ text, workspaceId, fileId, className }: { text: string; workspaceId: string; fileId?: string; className?: string }) {
  const [saving, setSaving] = useState(false);

  const remember = async (kind?: MemoryKind) => {
    const selection = window.getSelection()?.toString().trim() ?? "";
    const body = (selection.length >= 8 ? selection : cleanAnswer(text)).slice(0, 1000);
    if (body.length < 8) return;
    setSaving(true);
    try {
      const res = await fetch("/api/agents/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, text: body, kind, fileId }),
      });
      const r = (await res.json().catch(() => ({}))) as { kind?: MemoryKind; about?: string[]; error?: string };
      if (!res.ok) throw new Error(r.error ?? "Couldn't save");
      toast.success(`Saved as a ${r.kind ?? kind ?? "note"}`, {
        description: r.about?.length ? `Linked to “${r.about[0]}”` : selection.length >= 8 ? "From your selection" : undefined,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={saving}
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60",
              press,
            )}
            title="Keep this in the team's research memory"
          >
            {saving ? <Loader2 className="size-3 animate-spin" /> : <BookmarkPlus className="size-3" />}
            Remember
            <ChevronDown className="size-3 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48 font-sans">
          <DropdownMenuItem onClick={() => remember("hypothesis")}>As a hypothesis</DropdownMenuItem>
          <DropdownMenuItem onClick={() => remember("finding")}>As a finding</DropdownMenuItem>
          <DropdownMenuItem onClick={() => remember("question")}>As a question</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => remember()}>Let Neura decide</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
