"use client";

import { UploadPanel } from "@/app/(main)/dashboard/_components/upload-research-papers";
import type { LibraryPaper } from "@/app/api/papers/route";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ImportPaper from "@/components/zotero/components/dialog/ImportPaper";
import { NewPapersPanel } from "./new-papers-panel";
import type { FullTextState } from "@/lib/graph/document-index";
import type { PaperSearchResult } from "@/lib/graph/openalex";
import { refreshLibrary, reindexPapers, useGraphIndex, useLibrary } from "@/lib/hooks/use-library";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, ExternalLink, FileText, Loader2, Plus, RotateCw, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type SearchHit = PaperSearchResult & { inLibrary: boolean };
type Tab = "library" | "graph" | "search" | "new" | "upload";

const press = "transition-transform duration-150 ease-out active:scale-[0.97]";

// Scroll region: reserve the scrollbar's space so it never sits on top of row status text,
// and fade the bottom edge so it's clear there's more below (padding lets the last row clear the fade).
const scrollArea =
  "overflow-y-auto pr-2 pb-6 [scrollbar-gutter:stable] [mask-image:linear-gradient(to_bottom,black_calc(100%-24px),transparent)]";

/** Plain-language reason for each full-text outcome (shown as a tooltip). */
const FULL_TEXT_REASON: Record<FullTextState, string> = {
  indexed: "Full text is indexed as passages agents can quote.",
  no_file: "No PDF is available for this paper, so its abstract is indexed instead.",
  blocked: "The publisher refused the download, so the abstract is indexed instead. Upload the PDF to index its full text.",
  unreadable: "The file has no extractable text (it may be a scan), so the abstract is indexed instead.",
  too_large: "The file is over 25 MB, so the abstract is indexed instead.",
  unsupported: "This file format can't be read (use PDF or DOCX), so the abstract is indexed instead.",
};

/** Workspace library: what's in it and how it's indexed, search to add more, or upload / import. */
export default function ResearchLibrary({ workspaceId }: { workspaceId: string }) {
  const [tab, setTab] = useState<Tab>("library");
  // Shared with the dashboard card; polls by itself while papers are indexing
  const { papers, graphReachable } = useLibrary(workspaceId);
  const loadLibrary = useCallback(() => refreshLibrary(workspaceId), [workspaceId]);

  const reindex = useCallback(
    async (ids?: string[]) => {
      try {
        const n = await reindexPapers(workspaceId, ids);
        toast.success(ids ? "Re-indexing paper" : `Re-indexing ${n} paper${n === 1 ? "" : "s"}`, {
          description: "Rebuilding citations and full text in the research graph.",
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't start re-indexing");
      }
    },
    [workspaceId],
  );

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex flex-col gap-3 min-h-0 flex-1">
      <TabsList className="w-full grid grid-cols-5">
        <TabsTrigger value="library">
          Library{papers ? <span className="ml-1.5 text-muted-foreground tabular-nums">{papers.length}</span> : null}
        </TabsTrigger>
        <TabsTrigger value="graph">In the graph</TabsTrigger>
        <TabsTrigger value="search">Search papers</TabsTrigger>
        <TabsTrigger value="new">New papers</TabsTrigger>
        <TabsTrigger value="upload">Upload &amp; import</TabsTrigger>
      </TabsList>

      <TabsContent value="library" className="mt-0 min-h-0 flex-1 flex flex-col gap-2">
        {papers && papers.length > 0 && (
          <IndexSummary papers={papers} graphReachable={graphReachable} onReindexAll={() => reindex()} />
        )}
        <div className={cn("min-h-0 flex-1", scrollArea)}>
          <LibraryList papers={papers} onFindPapers={() => setTab("search")} onReindex={(id) => reindex([id])} />
        </div>
      </TabsContent>

      <TabsContent value="graph" className={cn("mt-0 min-h-0 flex-1", scrollArea)}>
        <GraphIndexView workspaceId={workspaceId} indexing={!!papers?.some((p) => p.index.state === "indexing")} />
      </TabsContent>

      <TabsContent value="search" className="mt-0 min-h-0 flex-1 flex flex-col">
        <SearchPanel workspaceId={workspaceId} onImported={loadLibrary} />
      </TabsContent>

      <TabsContent value="new" className="mt-0 min-h-0 flex-1 flex flex-col">
        <NewPapersPanel workspaceId={workspaceId} onImported={loadLibrary} scrollArea={scrollArea} />
      </TabsContent>

      <TabsContent value="upload" className={cn("mt-0 min-h-0 flex-1 space-y-4", scrollArea)}>
        <UploadPanel workspaceId={workspaceId} onUploaded={loadLibrary} />
        <div className="flex items-center justify-between gap-3 rounded-md border border-dashed p-3">
          <p className="text-sm text-muted-foreground">Already keep your papers in Zotero?</p>
          <ImportPaper workspaceId={workspaceId} />
        </div>
        <p className="text-xs text-muted-foreground">
          PDF or DOCX up to 10MB (legacy .doc files are indexed by title and abstract only). Every paper is indexed
          into your team&apos;s research graph, including its full text, so collaborators&apos; agents can cite it.
        </p>
      </TabsContent>
    </Tabs>
  );
}

/** One line of index health for the whole library, with a recovery action. */
function IndexSummary({
  papers,
  graphReachable,
  onReindexAll,
}: {
  papers: LibraryPaper[];
  graphReachable: boolean;
  onReindexAll: () => void;
}) {
  if (!graphReachable) {
    return (
      <p className="flex items-center gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <AlertTriangle className="size-3.5 shrink-0" /> The research graph (FalkorDB) is unreachable, so index status
        can&apos;t be shown.
      </p>
    );
  }
  const count = (f: (p: LibraryPaper) => boolean) => papers.filter(f).length;
  const indexing = count((p) => p.index.state === "indexing");
  const failed = count((p) => p.index.state === "failed" || p.index.state === "not_indexed");
  const fullText = count((p) => p.index.state === "done" && p.index.fullText === "indexed");
  const abstractOnly = count((p) => p.index.state === "done" && p.index.fullText !== "indexed");
  const parts = [
    `${papers.length - failed - indexing}/${papers.length} in FalkorDB`,
    fullText ? `${fullText} full text` : null,
    abstractOnly ? `${abstractOnly} abstract only` : null,
    indexing ? `${indexing} indexing` : null,
  ].filter(Boolean);
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-1.5">
      <p className="text-xs text-muted-foreground tabular-nums">
        {parts.join(" · ")}
        {failed ? <span className="text-red-700"> · {failed} not indexed</span> : null}
      </p>
      <Button
        size="sm"
        variant="ghost"
        onClick={onReindexAll}
        disabled={indexing > 0}
        className={cn("h-7 px-2 text-xs", press)}
        title="Rebuild every paper's citations and full text in the research graph"
      >
        <RotateCw className="mr-1 size-3.5" /> Re-index all
      </Button>
    </div>
  );
}

function IndexBadge({ paper }: { paper: LibraryPaper }) {
  const i = paper.index;
  if (i.state === "indexing") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
        <span className="size-1.5 rounded-full bg-sky-500 animate-pulse motion-reduce:animate-none" />
        Indexing
      </span>
    );
  }
  if (i.state === "failed" || i.state === "not_indexed") {
    return (
      <span
        className="text-xs text-red-700 whitespace-nowrap"
        title={i.error ?? "This paper isn't in the research graph yet. Re-index to add it."}
      >
        {i.state === "failed" ? "Failed" : "Not indexed"}
      </span>
    );
  }
  const links = i.matched ? `${i.links} link${i.links === 1 ? "" : "s"}` : "Not matched";
  const full = i.fullText === "indexed";
  return (
    <span
      className="text-xs whitespace-nowrap"
      title={[
        i.matched
          ? `Connected to ${i.links} papers by citations.`
          : "Couldn't match this paper on OpenAlex, so it has no citation links. Its text is still searchable.",
        i.fullText ? FULL_TEXT_REASON[i.fullText] : "Full-text status unknown. Re-index to check.",
      ].join(" ")}
    >
      <span className={i.matched ? "text-emerald-700" : "text-amber-700"}>{links}</span>
      <span className={full ? "text-emerald-700" : "text-muted-foreground"}>
        {" · "}
        {full ? "Full text" : "Abstract only"}
      </span>
    </span>
  );
}

const sourceLabel = (p: LibraryPaper) =>
  p.externalSource === "openalex" ? "OpenAlex" : p.source === "zotero" ? "Zotero" : p.source === "manual" ? "Upload" : "Other";

function LibraryList({
  papers,
  onFindPapers,
  onReindex,
}: {
  papers: LibraryPaper[] | null;
  onFindPapers: () => void;
  onReindex: (paperId: string) => void;
}) {
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
      {papers.map((p) => {
        const broken = p.index.state === "failed" || p.index.state === "not_indexed";
        return (
          <li key={p.id} className="group flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium leading-snug line-clamp-2" title={p.title}>
                {p.title}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground truncate">
                {p.importedBy.name} · {sourceLabel(p)}
                {p.index.year ? ` · ${p.index.year}` : ""}
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
            <div className="flex items-center gap-1">
              <IndexBadge paper={p} />
              {p.index.state !== "indexing" && (
                <button
                  type="button"
                  onClick={() => onReindex(p.id)}
                  aria-label={`Re-index ${p.title}`}
                  title="Re-index this paper"
                  className={cn(
                    "rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:opacity-100",
                    "transition-[opacity,transform] duration-150 ease-out active:scale-[0.9]",
                    broken ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                  )}
                >
                  <RotateCw className="size-3.5" />
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** What FalkorDB holds for this workspace, read straight from the graph. */
function GraphIndexView({ workspaceId, indexing }: { workspaceId: string; indexing: boolean }) {
  const { papers, totals, error } = useGraphIndex(workspaceId, indexing);
  if (error) {
    return (
      <p className="flex items-center gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <AlertTriangle className="size-3.5 shrink-0" /> {error.message}
      </p>
    );
  }
  if (!papers || !totals) {
    return <div className="h-24 rounded-md bg-muted/60 animate-pulse motion-reduce:animate-none" />;
  }
  const stats: [string, number, string][] = [
    ["Team papers", totals.library, "Papers collaborators brought in"],
    ["Papers in graph", totals.papers, "Team papers plus the papers they cite and are cited by"],
    ["Citations", totals.citations, "CITES links agents can traverse"],
    ["Passages", totals.passages, "Full-text chunks agents can quote"],
    ["Authors", totals.authors, "Author nodes"],
    ["Concepts", totals.concepts, "Topic nodes"],
  ];
  const owners = [...new Set(papers.map((p) => p.importedBy))];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {stats.map(([label, value, hint]) => (
          <div key={label} className="rounded-md border px-3 py-2" title={hint}>
            <p className="text-lg font-semibold tabular-nums leading-tight">{value.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Read live from FalkorDB: the {papers.length} papers your {owners.length} collaborator
        {owners.length === 1 ? "" : "s"} brought in, which agents search, traverse and cite.
        {totals.suspect ? ` ${totals.suspect} records with unreliable metadata are excluded from suggestions.` : ""}
      </p>
      <ul className="divide-y">
        {papers.map((p) => (
          <li key={`${p.importedBy}:${p.paperId}`} className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="text-sm leading-snug line-clamp-2" title={p.title}>
                {p.title}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground truncate">
                {p.importedBy}
                {p.year ? ` · ${p.year}` : ""}
                {!p.pgPaperId || p.pgPaperId.startsWith("seed-") ? " · graph only (demo)" : ""}
              </p>
            </div>
            <span className="text-xs whitespace-nowrap tabular-nums text-muted-foreground">
              <span className={p.unmatched ? "text-amber-700" : undefined}>
                {p.unmatched ? "Not matched" : `${p.links} links`}
              </span>
              {" · "}
              <span className={p.chunks ? "text-emerald-700" : undefined}>
                {p.chunks ? `${p.chunks} passages` : "abstract only"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
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
