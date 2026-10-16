"use client";

import type { ClaimCheck, Verdict } from "@/lib/agents/citation-checker";
import type { AgentResult } from "@/lib/agents/base";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAppState } from "@/lib/providers/state-providers";
import { cn } from "@/lib/utils";
import { toolbarButton } from "./toolbar-button";
import { CheckCircle2, CircleAlert, CircleHelp, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { useState } from "react";

const press = "transition-transform duration-150 ease-out active:scale-[0.97]";

const META: Record<Verdict, { label: string; tone: string; icon: React.ComponentType<{ className?: string }>; rank: number }> = {
  contradicted: { label: "Contradicted", tone: "text-red-700 bg-red-50", icon: XCircle, rank: 0 },
  unsupported: { label: "Not supported", tone: "text-red-700 bg-red-50", icon: XCircle, rank: 1 },
  "unknown-source": { label: "Unknown source", tone: "text-amber-800 bg-amber-50", icon: CircleHelp, rank: 2 },
  uncited: { label: "Needs citation", tone: "text-amber-800 bg-amber-50", icon: CircleAlert, rank: 3 },
  weak: { label: "Partly supported", tone: "text-amber-800 bg-amber-50", icon: CircleAlert, rank: 4 },
  supported: { label: "Supported", tone: "text-emerald-700 bg-emerald-50", icon: CheckCircle2, rank: 5 },
  ok: { label: "No citation needed", tone: "text-muted-foreground bg-muted", icon: CheckCircle2, rank: 6 },
};

/** Scroll the editor to the paragraph containing `text` and briefly highlight it. */
export function revealClaim(text: string) {
  const root = document.querySelector(".ProseMirror");
  if (!root) return;
  const needle = text.slice(0, 50);
  const block = [...root.querySelectorAll("p, li, blockquote")].find((el) => el.textContent?.includes(needle)) as
    | HTMLElement
    | undefined;
  if (!block) return;
  block.scrollIntoView({ behavior: "smooth", block: "center" });
  block.animate(
    [{ backgroundColor: "rgba(250, 204, 21, 0.35)" }, { backgroundColor: "rgba(250, 204, 21, 0)" }],
    { duration: 1400, easing: "ease-out" },
  );
}

/**
 * "Check citations": runs the Citation Checker over the saved draft and lists a verdict for
 * every claim — worst first — with the passage each verdict was judged on.
 */
export function CitationCheckSheet({ fileId }: { fileId: string }) {
  const { workspaceId } = useAppState();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AgentResult<ClaimCheck> | null>(null);

  const run = async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/citation-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, fileId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Check failed");
      setResult(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check failed");
    } finally {
      setLoading(false);
    }
  };

  const items = [...(result?.items ?? [])].sort((a, b) => META[a.verdict].rank - META[b.verdict].rank || a.order - b.order);
  const problems = items.filter((c) => META[c.verdict].rank <= 4).length;
  const counts = items.reduce<Record<string, number>>((acc, c) => ((acc[c.verdict] = (acc[c.verdict] ?? 0) + 1), acc), {});

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) run(); // always check the latest saved draft
      }}
    >
      <SheetTrigger asChild>
        <Button
          size={null}
          variant="none"
          className={toolbarButton}
        >
          <ShieldCheck /> Check citations
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-3 font-sans">
        <SheetHeader>
          <SheetTitle>Citation check</SheetTitle>
          <SheetDescription>
            Every claim in this draft, checked against your team&apos;s research graph and the cited papers&apos; text.
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Reading the cited papers…
          </p>
        ) : error ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button size="sm" variant="outline" onClick={run} className={press}>
              Try again
            </Button>
          </div>
        ) : result && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No claims yet. Write a few sentences, then check again.</p>
        ) : result ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className={cn("font-medium", problems ? "text-red-700" : "text-emerald-700")}>
                {problems ? `${problems} to review` : "All claims look good"}
              </span>
              {Object.entries(counts).map(([v, n]) => (
                <span key={v} className={cn("rounded px-1.5 py-0.5", META[v as Verdict].tone)}>
                  {n} {META[v as Verdict].label.toLowerCase()}
                </span>
              ))}
            </div>
            <ul className="-mx-2 flex-1 space-y-1 overflow-y-auto px-2">
              {items.map((c) => {
                const m = META[c.verdict];
                const Icon = m.icon;
                const evidence = c.sources.find((s) => s.evidence);
                return (
                  <li key={c.claimId}>
                    <button
                      type="button"
                      onClick={() => revealClaim(c.text)}
                      className="w-full rounded-md p-2 text-left transition-colors duration-150 hover:bg-muted/60"
                    >
                      <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium", m.tone)}>
                        <Icon className="size-3.5" /> {m.label}
                      </span>
                      <p className="mt-1 text-sm leading-snug line-clamp-2">{c.text}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{c.why}</p>
                      {evidence && c.verdict !== "supported" && c.verdict !== "ok" && (
                        <p className="mt-1 border-l-2 pl-2 text-xs italic text-muted-foreground line-clamp-3">
                          {evidence.evidenceKind === "passage" ? "From the paper: " : "Abstract: "}“{evidence.evidence}”
                        </p>
                      )}
                      {c.suggestion && (
                        <p className="mt-1 text-xs">
                          Try <span className="font-medium">{c.suggestion.label}</span>{" "}
                          <span className="text-muted-foreground">from {c.suggestion.owners.join(" & ")}&apos;s library</span>
                        </p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              Judged by Neura on the cited papers&apos; full text · {(result.ms / 1000).toFixed(1)}s · Verdicts saved to FalkorDB
            </p>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
