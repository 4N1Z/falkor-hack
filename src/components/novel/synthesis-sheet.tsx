"use client";

import type { ReviewSection, SynthesisResult } from "@/lib/agents/synthesis";
import type { File } from "@/db/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAppState } from "@/lib/providers/state-providers";
import { cn } from "@/lib/utils";
import { toolbarButton } from "./toolbar-button";
import { ArrowRight, Layers, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const press = "transition-transform duration-150 ease-out active:scale-[0.97]";

/**
 * "Draft review": the Synthesis agent writes a literature review of the team's papers into a
 * new file, with sections taken from the citation communities in the research graph.
 */
export function SynthesisSheet({ fileId }: { fileId: string }) {
  const { workspaceId, dispatch } = useAppState();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(SynthesisResult & { file: File | null }) | null>(null);

  const run = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!workspaceId || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/agents/synthesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, topic, fileId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't draft the review");
      if (body.outcome === "NOT_IN_GRAPH") throw new Error("Not enough team papers on this topic yet. Import a few more, or leave the topic empty.");
      setResult(body);
      if (body.file) dispatch({ type: "ADD_FILE", payload: { workspaceId, folderId: body.file.folderId, file: body.file } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't draft the review");
    } finally {
      setLoading(false);
    }
  };

  const papers = result?.items.reduce((n, s) => n + s.papers.length, 0) ?? 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size={null} variant="none" className={toolbarButton}>
          <Layers /> Draft review
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-3 font-sans">
        <SheetHeader>
          <SheetTitle>Draft a literature review</SheetTitle>
          <SheetDescription>
            Groups your team&apos;s papers by how they cite each other, then writes one section per group into a new document. It only cites papers in
            your library.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={run} className="flex gap-2">
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Topic (optional), e.g. graph-based retrieval"
            className="text-sm"
            disabled={loading}
          />
          <Button type="submit" size="sm" disabled={loading} className={press}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Draft"}
          </Button>
        </form>

        {loading && (
          <p className="text-sm text-muted-foreground">Finding citation communities, reading passages and writing each section. This takes about half a minute.</p>
        )}
        {error && <p className="text-sm text-muted-foreground">{error}</p>}

        {result?.file && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 animate-in fade-in-0 duration-200">
            <Link
              href={`/dashboard/${workspaceId}/${result.file.id}`}
              onClick={() => setOpen(false)}
              className={cn("flex items-center justify-between rounded-lg border bg-emerald-50 px-3 py-2 text-sm hover:bg-emerald-100", press)}
            >
              <span>
                <span className="block font-medium">{result.title}</span>
                <span className="text-xs text-muted-foreground">
                  {result.items.length} sections · {papers} papers · {(result.ms / 1000).toFixed(0)}s
                </span>
              </span>
              <ArrowRight className="size-4 shrink-0" />
            </Link>
            <ol className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {result.items.map((s: ReviewSection, i) => (
                <li key={i} className="rounded-lg border p-2.5">
                  <p className="text-sm font-medium">{s.heading}</p>
                  <ul className="mt-1 space-y-0.5">
                    {s.papers.map((p) => (
                      <li key={p.paperId} className="text-xs text-muted-foreground">
                        <span className="text-foreground">{p.label}</span> {p.title}
                        {p.owners.length ? <span className="text-emerald-700"> · {p.owners.join(" & ")}</span> : null}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
