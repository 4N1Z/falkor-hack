"use client";

import { UploadPanel } from "@/app/(main)/dashboard/_components/upload-research-papers";
import type { LibraryPaper } from "@/app/api/papers/route";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ImportPaper from "@/components/zotero/components/dialog/ImportPaper";
import type { PaperSearchResult } from "@/lib/graph/openalex";
import { refreshLibrary, useLibrary } from "@/lib/hooks/use-library";
import { cn } from "@/lib/utils";
import { Check, ExternalLink, FileText, Loader2, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type SearchHit = PaperSearchResult & { inLibrary: boolean };
type Tab = "library" | "search" | "upload";

const press = "transition-transform duration-150 ease-out active:scale-[0.97]";

// Scroll region: reserve the scrollbar's space so it never sits on top of row status text,
// and fade the bottom edge so it's clear there's more below (padding lets the last row clear the fade).
const scrollArea =
  "overflow-y-auto pr-2 pb-6 [scrollbar-gutter:stable] [mask-image:linear-gradient(to_bottom,black_calc(100%-24px),transparent)]";

/** Workspace library: what's in it, search OpenAlex to add more, or upload PDFs / import from Zotero. */
export default function ResearchLibrary({ workspaceId }: { workspaceId: string }) {
  const [tab, setTab] = useState<Tab>("library");
  // Shared with the dashboard card; polls by itself while papers are indexing
  const { papers } = useLibrary(workspaceId);
  const loadLibrary = useCallback(() => refreshLibrary(workspaceId), [workspaceId]);

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex flex-col gap-3 min-h-0 flex-1">
      <TabsList className="w-full grid grid-cols-3">
        <TabsTrigger value="library">
          Library{papers ? <span className="ml-1.5 text-muted-foreground tabular-nums">{papers.length}</span> : null}
        </TabsTrigger>
        <TabsTrigger value="search">Search papers</TabsTrigger>
        <TabsTrigger value="upload">Upload &amp; import</TabsTrigger>
      </TabsList>

      <TabsContent value="library" className={cn("mt-0 min-h-0 flex-1", scrollArea)}>
        <LibraryList papers={papers} onFindPapers={() => setTab("search")} />
      </TabsContent>

      <TabsContent value="search" className="mt-0 min-h-0 flex-1 flex flex-col">
        <SearchPanel workspaceId={workspaceId} onImported={loadLibrary} />
      </TabsContent>

      <TabsContent value="upload" className={cn("mt-0 min-h-0 flex-1 space-y-4", scrollArea)}>
        <UploadPanel workspaceId={workspaceId} onUploaded={loadLibrary} />
        <div className="flex items-center justify-between gap-3 rounded-md border border-dashed p-3">
          <p className="text-sm text-muted-foreground">Already keep your papers in Zotero?</p>
          <ImportPaper workspaceId={workspaceId} />
        </div>
        <p className="text-xs text-muted-foreground">
          PDF, DOC or DOCX up to 10MB. Every paper is indexed into your team&apos;s research graph, including its
          full text when a PDF is available, so collaborators&apos; agents can cite it.
        </p>
      </TabsContent>
    </Tabs>
  );
}

function GraphStatus({ paper }: { paper: LibraryPaper }) {
  if (!paper.graph) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
        <span className="size-1.5 rounded-full bg-sky-500 animate-pulse motion-reduce:animate-none" />
        Indexing
      </span>
    );
  }
  const g = paper.graph;
  const parts = [g.matched ? `${g.links} link${g.links === 1 ? "" : "s"}` : "Not matched", g.chunks ? "full text" : null];
  return (
    <span
      className={cn("text-xs whitespace-nowrap", g.matched ? "text-emerald-700" : "text-amber-700")}
      title={
        g.matched
          ? `In the research graph with ${g.links} citation links${g.chunks ? ` and ${g.chunks} indexed passages` : ""}`
          : "Couldn't match this paper on OpenAlex, so it has no citation links yet. Its text is still searchable."
      }
    >
      {parts.filter(Boolean).join(" · ")}
    </span>
  );
}

const sourceLabel = (p: LibraryPaper) =>
  p.externalSource === "openalex" ? "OpenAlex" : p.source === "zotero" ? "Zotero" : p.source === "manual" ? "Upload" : "Other";

function LibraryList({ papers, onFindPapers }: { papers: LibraryPaper[] | null; onFindPapers: () => void }) {
  if (!papers) {
    return (
      <div className="space-y-2 pt-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 rounded-md bg-muted/60 animate-pulse motion-reduce:animate-none" />
        ))}
      </div>
    );
  }
  if (!papers.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
        <FileText className="size-8 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">No papers in this workspace yet</p>
          <p className="text-sm text-muted-foreground">Search millions of papers, or upload your own PDFs.</p>
        </div>
        <Button size="sm" onClick={onFindPapers} className={press}>
          <Search className="mr-1.5 size-4" /> Search papers
        </Button>
      </div>
    );
  }
  return (
    <ul className="divide-y">
      {papers.map((p) => (
        <li key={p.id} className="flex items-start justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium leading-snug line-clamp-2" title={p.title}>
              {p.title}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground truncate">
              {p.importedBy.name} · {sourceLabel(p)}
              {p.graph?.year ? ` · ${p.graph.year}` : ""}
              {p.doi ? (
                <>
                  {" · "}
                  <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer" className="hover:underline">
                    DOI
                  </a>
                </>
              ) : null}
            </p>
          </div>
          <GraphStatus paper={p} />
        </li>
      ))}
    </ul>
  );
}

function SearchPanel({ workspaceId, onImported }: { workspaceId: string; onImported: () => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const latest = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Opening this tab should let you type straight away. autoFocus alone loses to Radix,
  // which moves focus to the tab trigger after the content mounts, so focus a frame later.
  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setHits(null);
      setError(null);
      return;
    }
    const id = ++latest.current;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/papers/search?workspaceId=${workspaceId}&q=${encodeURIComponent(q)}`);
        const body = await res.json();
        if (id !== latest.current) return; // a newer search superseded this one
        if (!res.ok) throw new Error(body.error ?? "Search failed");
        setHits(body.results);
      } catch (e) {
        if (id === latest.current) setError(e instanceof Error ? e.message : "Search failed");
      } finally {
        if (id === latest.current) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query, workspaceId]);

  const add = async (hit: SearchHit) => {
    setAdding((s) => new Set(s).add(hit.openalexId));
    try {
      const res = await fetch("/api/papers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, openalexIds: [hit.openalexId] }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Import failed");
      setHits((h) => h?.map((x) => (x.openalexId === hit.openalexId ? { ...x, inLibrary: true } : x)) ?? h);
      toast.success(body.imported.length ? "Added to library" : "Already in your library", {
        description: body.imported.length
          ? hit.pdfUrl
            ? "Indexing citations and full text into the research graph."
            : "Indexing citations into the research graph. No open-access PDF, so the abstract is used."
          : undefined,
      });
      onImported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setAdding((s) => {
        const next = new Set(s);
        next.delete(hit.openalexId);
        return next;
      });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title, topic, author — or paste a DOI"
          className="pl-8"
        />
        {loading && <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      <div className={cn("min-h-0 flex-1", scrollArea)}>
        {error ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{error}</p>
        ) : hits === null ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Search OpenAlex&apos;s 250M+ works. Added papers join your team&apos;s research graph.
          </p>
        ) : hits.length === 0 && !loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No papers found for “{query.trim()}”.</p>
        ) : (
          <ul className={cn("divide-y transition-opacity duration-150", loading && "opacity-60")}>
            {hits.map((h) => {
              const busy = adding.has(h.openalexId);
              return (
                <li key={h.openalexId} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug line-clamp-2" title={h.title}>
                      {h.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground truncate">
                      {[h.authors.slice(0, 3).join(", ") + (h.authors.length > 3 ? " et al." : ""), h.year, h.venue]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="tabular-nums">{h.citationCount.toLocaleString()} citations</span>
                      {h.pdfUrl && (
                        <a
                          href={h.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-emerald-700 hover:underline"
                        >
                          Open-access PDF <ExternalLink className="size-3" />
                        </a>
                      )}
                    </p>
                  </div>
                  {h.inLibrary ? (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap pt-0.5 text-xs text-emerald-700">
                      <Check className="size-3.5" /> In library
                    </span>
                  ) : (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => add(h)} className={cn("shrink-0", press)}>
                      {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="mr-1 size-4" />}
                      {busy ? "" : "Add"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
