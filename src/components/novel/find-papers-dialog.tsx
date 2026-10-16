"use client";

import type { TeamPaper } from "@/lib/graph/team-search";
import type { PaperSearchResult } from "@/lib/graph/openalex";
import { citationContent, citationHref, citationLabel } from "@/lib/citations";
import { refreshLibrary } from "@/lib/hooks/use-library";
import { useAppState } from "@/lib/providers/state-providers";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Command as CommandPrimitive } from "cmdk";
import { useCurrentEditor } from "@tiptap/react";
import { Loader2, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/** Opened by the "/Search Papers" slash command. */
export const FIND_PAPERS_EVENT = "neura:find-papers";
export type FindPapersDetail = { query: string; pos: number };

type Hit =
  | { kind: "team"; key: string; label: string; href: string; paper: TeamPaper }
  | { kind: "openalex"; key: string; label: string; href: string; paper: PaperSearchResult };

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Cite from the team library (FalkorDB: every collaborator's papers, ranked by meaning,
 * full-text passages and keywords) or from OpenAlex. Inserts a linked "[Author et al., Year]"
 * at the cursor; an OpenAlex pick is also added to the team library so the graph knows it.
 */
export function FindPapersDialog() {
  const { editor } = useCurrentEditor();
  const { workspaceId } = useAppState();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState<TeamPaper[]>([]);
  const [world, setWorld] = useState<PaperSearchResult[]>([]);
  const [loading, setLoading] = useState({ team: false, world: false });
  const pos = useRef(0);
  const debounced = useDebounced(query, 300);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<FindPapersDetail>).detail;
      pos.current = d.pos;
      setQuery(d.query);
      setTeam([]);
      setWorld([]);
      setOpen(true);
    };
    window.addEventListener(FIND_PAPERS_EVENT, onOpen);
    return () => window.removeEventListener(FIND_PAPERS_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open || !workspaceId || debounced.trim().length < 3) return;
    const q = encodeURIComponent(debounced.trim());
    let cancelled = false;
    setLoading({ team: true, world: true });
    fetch(`/api/papers/team-search?workspaceId=${workspaceId}&q=${q}`)
      .then((r) => r.json())
      .then((b) => !cancelled && setTeam(b.results ?? []))
      .catch(() => !cancelled && setTeam([]))
      .finally(() => !cancelled && setLoading((l) => ({ ...l, team: false })));
    // Long sentences make poor OpenAlex queries; its search works best on a short phrase
    const worldQ = encodeURIComponent(debounced.trim().split(/\s+/).slice(0, 12).join(" "));
    fetch(`/api/papers/search?workspaceId=${workspaceId}&q=${worldQ}`)
      .then((r) => r.json())
      .then((b) => !cancelled && setWorld((b.results ?? []).filter((r: { inLibrary: boolean }) => !r.inLibrary).slice(0, 6)))
      .catch(() => !cancelled && setWorld([]))
      .finally(() => !cancelled && setLoading((l) => ({ ...l, world: false })));
    return () => {
      cancelled = true;
    };
  }, [debounced, open, workspaceId]);

  const hits: Hit[] = [
    ...team.map((p) => ({ kind: "team" as const, key: `t:${p.paperId}`, label: citationLabel(p), href: citationHref(p), paper: p })),
    ...world.map((p) => ({
      kind: "openalex" as const,
      key: `w:${p.openalexId}`,
      label: citationLabel(p),
      href: citationHref({ doi: p.doi, paperId: p.openalexId }),
      paper: p,
    })),
  ];

  const cite = (hit: Hit) => {
    if (!editor) return;
    const at = Math.min(pos.current, editor.state.doc.content.size);
    const before = editor.state.doc.textBetween(Math.max(0, at - 1), at);
    editor.chain().focus().insertContentAt(at, citationContent(hit.label, hit.href, !!before && !/\s/.test(before))).run();
    setOpen(false);
    if (hit.kind === "openalex" && workspaceId) {
      // Citing a paper the team doesn't have yet adds it, so the graph (and agents) know it
      fetch("/api/papers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, openalexIds: [hit.paper.openalexId] }),
      })
        .then(() => {
          refreshLibrary(workspaceId);
          toast.success(`Cited ${hit.label}`, { description: "Also added to your team library." });
        })
        .catch(() => toast.error("Cited, but couldn't add it to the team library"));
    } else {
      toast.success(`Cited ${hit.label}`);
    }
  };

  const busy = loading.team || loading.world;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-xl font-sans">
        <DialogTitle className="sr-only">Find papers to cite</DialogTitle>
        <CommandPrimitive shouldFilter={false} loop className="flex flex-col">
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <CommandPrimitive.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Describe the claim, or search a title, topic or author"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
          <CommandPrimitive.List className="max-h-[420px] overflow-y-auto p-2">
            {!busy && debounced.trim().length >= 3 && hits.length === 0 && (
              <CommandPrimitive.Empty className="py-8 text-center text-sm text-muted-foreground">
                No papers found. Try a shorter phrase.
              </CommandPrimitive.Empty>
            )}
            {team.length > 0 && (
              <CommandPrimitive.Group
                heading="Your team's library"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {hits
                  .filter((h): h is Extract<Hit, { kind: "team" }> => h.kind === "team")
                  .map((h) => (
                    <CommandPrimitive.Item
                      key={h.key}
                      value={h.key}
                      onSelect={() => cite(h)}
                      className="cursor-pointer rounded-md px-2 py-2 aria-selected:bg-accent"
                    >
                      <p className="text-sm font-medium leading-snug line-clamp-1">{h.paper.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {h.label} · from {h.paper.owners.join(", ")}&apos;s library
                      </p>
                      {h.paper.passage && (
                        <p className="mt-0.5 text-xs italic text-muted-foreground line-clamp-2">
                          “{h.paper.passage.text.replace(/\s+/g, " ").slice(0, 220)}…”
                        </p>
                      )}
                    </CommandPrimitive.Item>
                  ))}
              </CommandPrimitive.Group>
            )}
            {world.length > 0 && (
              <CommandPrimitive.Group
                heading="More from OpenAlex (adds to your team library)"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {hits
                  .filter((h): h is Extract<Hit, { kind: "openalex" }> => h.kind === "openalex")
                  .map((h) => (
                    <CommandPrimitive.Item
                      key={h.key}
                      value={h.key}
                      onSelect={() => cite(h)}
                      className="cursor-pointer rounded-md px-2 py-2 aria-selected:bg-accent"
                    >
                      <p className="text-sm font-medium leading-snug line-clamp-1">{h.paper.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {h.label} · {h.paper.citationCount.toLocaleString()} citations
                        {h.paper.venue ? ` · ${h.paper.venue}` : ""}
                      </p>
                    </CommandPrimitive.Item>
                  ))}
              </CommandPrimitive.Group>
            )}
          </CommandPrimitive.List>
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">↑↓ to choose · Enter to cite · Esc to close</p>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}
