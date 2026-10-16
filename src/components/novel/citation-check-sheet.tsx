"use client";

import type { ClaimCheck, Verdict } from "@/lib/agents/citation-checker";
import type { AgentResult } from "@/lib/agents/base";
import { Button } from "@/components/ui/button";
import { useAppState } from "@/lib/providers/state-providers";
import { cn } from "@/lib/utils";
import { CheckCircle2, CircleAlert, CircleHelp, Loader2, RotateCw, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

const press = "transition-transform duration-150 ease-out active:scale-[0.97]";
const enter = "animate-in fade-in-0 slide-in-from-bottom-1 duration-150 ease-out fill-mode-both motion-reduce:animate-none";

const META: Record<Verdict, { label: string; tone: string; icon: React.ComponentType<{ className?: string }>; rank: number }> = {
  contradicted: { label: "Contradicted", tone: "text-red-700 bg-red-50 dark:bg-red-950 dark:text-red-300", icon: XCircle, rank: 0 },
  unsupported: { label: "Not supported", tone: "text-red-700 bg-red-50 dark:bg-red-950 dark:text-red-300", icon: XCircle, rank: 1 },
  "unknown-source": { label: "Unknown source", tone: "text-amber-800 bg-amber-50 dark:bg-amber-950 dark:text-amber-200", icon: CircleHelp, rank: 2 },
  uncited: { label: "Needs citation", tone: "text-amber-800 bg-amber-50 dark:bg-amber-950 dark:text-amber-200", icon: CircleAlert, rank: 3 },
  weak: { label: "Partly supported", tone: "text-amber-800 bg-amber-50 dark:bg-amber-950 dark:text-amber-200", icon: CircleAlert, rank: 4 },
  supported: { label: "Supported", tone: "text-emerald-700 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300", icon: CheckCircle2, rank: 5 },
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
 * Check citations: runs the Citation Checker over the saved draft and lists a verdict for
 * every claim, worst first, with the passage each verdict was judged on. Lives in the research
 * rail beside the text, so clicking a verdict scrolls to the sentence without closing anything.
 */
export function CitationCheckPanel({
  fileId,
  visible,
  onProblems,
}: {
  fileId: string;
  visible: boolean;
  /** Number of claims to review after a run, or null before the first run */
  onProblems: (n: number | null) => void;
}) {
  const { workspaceId } = useAppState();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AgentResult<ClaimCheck> | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);

  const run = async () => {
    if (!workspaceId || loading) return;
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
      setCheckedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check failed");
    } finally {
      setLoading(false);
    }
  };

  // First time the panel is opened: start a check of the latest saved draft without asking.
  // Kicked off as a task (it is a network request), not as state work inside the effect itself.
  useEffect(() => {
    if (!visible || result || loading || error) return;
    const t = setTimeout(run, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const items = [...(result?.items ?? [])].sort((a, b) => META[a.verdict].rank - META[b.verdict].rank || a.order - b.order);
  const problems = items.filter((c) => META[c.verdict].rank <= 4).length;
  const counts = items.reduce<Record<string, number>>((acc, c) => ((acc[c.verdict] = (acc[c.verdict] ?? 0) + 1), acc), {});

  useEffect(() => onProblems(result ? problems : null), [result, problems, onProblems]);

  if (!visible) return null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className="tabular-nums">
          {loading ? "Reading the cited papers…" : checkedAt ? `Checked ${new Date(checkedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : "Not checked yet"}
        </span>
        <Button size="sm" variant="ghost" onClick={run} disabled={loading} className={cn("h-6 gap-1 px-1.5 text-[11px]", press)}>
          {loading ? <Loader2 className="size-3 animate-spin" /> : <RotateCw className="size-3" />}
          {result ? "Re-check" : "Check"}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading && !result ? (
          <ul className="space-y-1" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="rounded-md p-2">
                <div className="h-4 w-24 rounded bg-muted" />
                <div className="mt-1.5 h-3.5 w-full rounded bg-muted" />
                <div className="mt-1 h-3 w-2/3 rounded bg-muted" />
              </li>
            ))}
          </ul>
        ) : error ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button size="sm" variant="outline" onClick={run} className={press}>
              Try again
            </Button>
          </div>
        ) : result && items.length === 0 ? (
          <p className="text-xs text-muted-foreground">No claims yet. Write a few sentences, wait for the save, then check again.</p>
        ) : result ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className={cn("font-medium", problems ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300")}>
                {problems ? `${problems} to review` : "All claims look good"}
              </span>
              {Object.entries(counts).map(([v, n]) => (
                <span key={v} className={cn("rounded px-1.5 py-0.5 tabular-nums", META[v as Verdict].tone)}>
                  {n} {META[v as Verdict].label.toLowerCase()}
                </span>
              ))}
            </div>
            <ul className="space-y-1">
              {items.map((c, i) => {
                const m = META[c.verdict];
                const Icon = m.icon;
                const evidence = c.sources.find((s) => s.evidence);
                return (
                  <li key={c.claimId} className={enter} style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                    <button
                      type="button"
                      onClick={() => revealClaim(c.text)}
                      title="Show in the draft"
                      className="w-full rounded-md p-2 text-left transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium", m.tone)}>
                        <Icon className="size-3.5" /> {m.label}
                      </span>
                      <p className="mt-1 text-sm leading-snug line-clamp-2">{c.text}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{c.why}</p>
                      {evidence && c.verdict !== "supported" && c.verdict !== "ok" && (
                        <p className="mt-1 border-l-2 pl-2 text-xs italic text-muted-foreground line-clamp-3">
                          {evidence.evidenceKind === "claim"
                            ? `Verified claim${evidence.page ? `, p.${evidence.page}` : ""}${evidence.section ? ` · ${evidence.section}` : ""}: `
                            : evidence.evidenceKind === "passage"
                              ? "From the paper: "
                              : "Abstract: "}
                          “{evidence.evidence}”
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
          </div>
        ) : null}
      </div>
    </div>
  );
}
