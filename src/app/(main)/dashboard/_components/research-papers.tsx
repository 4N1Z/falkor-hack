"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { LibraryPaper } from "@/app/api/papers/route";
import { useLibrary } from "@/lib/hooks/use-library";
import { cn } from "@/lib/utils";
import { ArrowUpRight, FileText, Notebook } from "lucide-react";
import UploadResearchPapers from "./upload-research-papers";

const sourceLabel = (p: LibraryPaper) =>
  p.externalSource === "openalex" ? "OpenAlex" : p.source === "zotero" ? "Zotero" : p.source === "manual" ? "Upload" : null;

const paperHref = (p: LibraryPaper) => (p.doi ? `https://doi.org/${p.doi}` : p.uploadUrl);

function PaperStatus({ paper }: { paper: LibraryPaper }) {
  if (!paper.graph) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
        <span className="size-1.5 rounded-full bg-sky-500 animate-pulse motion-reduce:animate-none" />
        Indexing
      </span>
    );
  }
  if (paper.graph.chunks) {
    return <span className="whitespace-nowrap text-xs text-emerald-700">Full text</span>;
  }
  return null;
}

function PaperRow({ paper }: { paper: LibraryPaper }) {
  const href = paperHref(paper);
  const meta = [paper.importedBy.name, sourceLabel(paper), paper.graph?.year].filter(Boolean).join(" · ");

  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="flex items-start gap-1 text-sm font-medium leading-snug text-foreground">
          <span className="line-clamp-2" title={paper.title}>
            {paper.title}
          </span>
          {href && (
            <ArrowUpRight
              size={14}
              className="mt-0.5 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100"
            />
          )}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</p>
      </div>
      <PaperStatus paper={paper} />
    </>
  );

  const rowClass = "group flex items-start justify-between gap-3 rounded-md px-2 py-2.5";

  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(rowClass, "transition-colors duration-150 hover:bg-sky-50/70")}
    >
      {body}
    </a>
  ) : (
    <div className={rowClass}>{body}</div>
  );
}

/**
 * Dashboard view of the workspace library. Reads the same cached library as the sidebar's
 * Research library dialog, so papers added anywhere show up here without a page refresh.
 */
export default function ResearchPapers({ workspaceId }: { workspaceId: string }) {
  const { papers } = useLibrary(workspaceId);

  return (
    <Card className="w-full border-2 border-sky-100">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 px-5 pb-3 pt-4">
        <h3 className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Notebook size={14} />
          Research papers
          {papers?.length ? <span className="tabular-nums">· {papers.length}</span> : null}
        </h3>
        <UploadResearchPapers workspaceId={workspaceId} workspaceName="workspace" />
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div
          className={cn(
            "h-[300px] overflow-y-auto pr-1 [scrollbar-gutter:stable]",
            // Fade the bottom edge so it's clear the list continues; padding lets the last row clear it
            papers?.length && "pb-6 [mask-image:linear-gradient(to_bottom,black_calc(100%-24px),transparent)]"
          )}
        >
          {papers === null ? (
            <div className="space-y-2 px-2 pt-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 rounded-md bg-muted/60 animate-pulse motion-reduce:animate-none" />
              ))}
            </div>
          ) : papers.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center select-none">
              <FileText className="size-7 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm font-medium">No papers yet</p>
              <p className="text-xs text-muted-foreground">
                Upload PDFs here, or search papers from Research papers in the sidebar.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-sky-100/70">
              {papers.map((paper) => (
                <li key={paper.id} className="py-0.5">
                  <PaperRow paper={paper} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
