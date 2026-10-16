"use client";

import type { ReviewSection, SynthesisResult } from "@/lib/agents/synthesis";
import type { File } from "@/db/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppState } from "@/lib/providers/state-providers";
import { cn } from "@/lib/utils";
import { ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const press = "transition-transform duration-150 ease-out active:scale-[0.97]";

/** What the agent is doing, in order (see synthesis.ts), so a ~10–30 s wait reads as progress. */
const STAGES = [
  "Choosing the papers in scope",
  "Finding citation communities",
  "Ranking papers by PageRank",
  "Outlining sections from the communities",
  "Reading passages and writing each section",
  "Saving the draft with real citations",
];

/**
 * Draft review: the Synthesis agent writes a literature review of the team's papers into a
 * new file, with sections taken from the citation communities in the research graph.
 */
export function SynthesisPanel({ fileId }: { fileId: string }) {
  const { workspaceId, dispatch } = useAppState();
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(SynthesisResult & { file: File | null }) | null>(null);

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 2500);
    return () => clearInterval(t);
  }, [loading]);

  const run = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!workspaceId || loading) return;
    setStage(0);
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
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <form onSubmit={run} className="flex gap-2">
        <Input
          id="synthesis-topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic (optional), e.g. graph-based retrieval"
          className="h-8 text-sm"
          disabled={loading}
        />
        <Button type="submit" size="sm" disabled={loading} className={cn("h-8", press)}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : "Draft"}
        </Button>
      </form>
      <p className="text-[11px] text-muted-foreground">Writes a new document next to this one. Sections follow how the team&apos;s papers cite each other, and it only cites papers in the library.</p>

      {loading && (
        <div aria-busy="true" className="space-y-2">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {STAGES[stage]}…
          </p>
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-lg border p-2.5">
              <div className="h-3.5 w-1/2 rounded bg-muted" />
              <div className="mt-1.5 h-3 w-full rounded bg-muted" />
              <div className="mt-1 h-3 w-5/6 rounded bg-muted" />
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-muted-foreground">{error}</p>}

      {result?.file && (
        <div className="flex min-h-0 flex-1 flex-col gap-3 animate-in fade-in-0 duration-150 motion-reduce:animate-none">
          <Link
            href={`/dashboard/${workspaceId}/${result.file.id}`}
            className={cn(
              "flex items-center justify-between rounded-lg border bg-emerald-50 px-3 py-2 text-sm hover:bg-emerald-100 dark:bg-emerald-950 dark:hover:bg-emerald-900",
              press,
            )}
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{result.title}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
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
                      {p.owners.length ? <span className="text-emerald-700 dark:text-emerald-300"> · {p.owners.join(" & ")}</span> : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
