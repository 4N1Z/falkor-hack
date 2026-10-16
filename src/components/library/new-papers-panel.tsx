"use client";

import type { AgentResult } from "@/lib/agents/base";
import type { NewPaper } from "@/lib/agents/scout-watcher";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, ExternalLink, Loader2, Plus, Radar } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const press = "transition-transform duration-150 ease-out active:scale-[0.97]";
const CHALLENGE = 0.7;
const WINDOWS = [
  { months: 6, label: "6 months" },
  { months: 12, label: "year" },
  { months: 24, label: "2 years" },
];

/**
 * Scout Watcher: recent papers that cite two or more of the team's papers and sit close to the
 * team's work in the graph. Papers that contradict a team paper are flagged first.
 */
export function NewPapersPanel({ workspaceId, onImported, scrollArea }: { workspaceId: string; onImported: () => void; scrollArea: string }) {
  const [months, setMonths] = useState(12);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AgentResult<NewPaper> | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);

  const check = async (m = months) => {
    setMonths(m);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/scout-watcher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, sinceMonths: m }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't check for new papers");
      setResult(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't check for new papers");
    } finally {
      setLoading(false);
    }
  };

  const add = async (p: NewPaper) => {
    setAdding(p.openalexId);
    try {
      const res = await fetch("/api/papers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, openalexIds: [p.openalexId] }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Import failed");
      setAdded((s) => new Set(s).add(p.openalexId));
      toast.success("Added to library", { description: "Indexing it into the research graph." });
      onImported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Recent papers that cite two or more of your team&apos;s papers. Anything that contradicts your work is flagged first.
        </p>
        <div className="flex shrink-0 items-center gap-1 text-xs">
          <span className="text-muted-foreground">Past</span>
          {WINDOWS.map((w) => (
            <button
              key={w.months}
              type="button"
              disabled={loading}
              onClick={() => check(w.months)}
              className={cn(
                "rounded px-1.5 py-0.5 transition-colors duration-150",
                months === w.months && result ? "bg-foreground text-background" : "hover:bg-muted",
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("min-h-0 flex-1", scrollArea)}>
        {!result && !loading && !error ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="max-w-sm text-sm text-muted-foreground">
              The Scout checks OpenAlex for new work citing your library, then keeps only papers close to your team&apos;s research in the graph.
            </p>
            <Button size="sm" onClick={() => check()} className={press}>
              <Radar className="mr-1.5 size-4" /> Check for new papers
            </Button>
          </div>
        ) : loading ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Looking for papers that cite your library…
          </p>
        ) : error ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{error}</p>
        ) : result && result.items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No new papers cite two or more of your team&apos;s papers in this window.</p>
        ) : (
          <ul className="divide-y">
            {result!.items.map((p) => {
              const inLib = added.has(p.openalexId);
              const challenges = p.challenge >= CHALLENGE;
              return (
                <li key={p.openalexId} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    {challenges && (
                      <p className="mb-0.5 inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
                        <AlertTriangle className="size-3" /> May contradict “{p.closest?.title.slice(0, 60)}”
                      </p>
                    )}
                    <p className="text-sm font-medium leading-snug line-clamp-2" title={p.title}>
                      {p.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[p.authors.slice(0, 3).join(", ") + (p.authors.length > 3 ? " et al." : ""), p.publicationDate ?? p.year, p.venue]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="mt-1 text-xs">
                      <span className="text-muted-foreground">Cites {p.cites.length} team papers</span>
                      {p.owners.length > 1 && <span className="text-emerald-700"> · connects {p.owners.join(" & ")}</span>}
                      {p.owners.length === 1 && <span className="text-muted-foreground"> · all from {p.owners[0]}&apos;s library</span>}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2" title={p.cites.map((c) => c.title).join("\n")}>
                      {p.cites.map((c) => c.title.replace(/:.*$/, "")).join(" · ")}
                    </p>
                    {p.pdfUrl && (
                      <a
                        href={p.pdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 inline-flex items-center gap-0.5 text-xs text-emerald-700 hover:underline"
                      >
                        Open-access PDF <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                  {inLib ? (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap pt-0.5 text-xs text-emerald-700">
                      <Check className="size-3.5" /> Added
                    </span>
                  ) : (
                    <Button size="sm" variant="outline" disabled={adding === p.openalexId} onClick={() => add(p)} className={cn("shrink-0", press)}>
                      {adding === p.openalexId ? <Loader2 className="size-4 animate-spin" /> : <Plus className="mr-1 size-4" />}
                      {adding === p.openalexId ? "" : "Add"}
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
