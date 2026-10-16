"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { GraduationCap, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

import { useResearchSummary } from "@/lib/hooks/use-research-summary";
import Markdown from "react-markdown";

// Same height as the Research papers card so the two sit level side by side
export const DASHBOARD_CARD_HEIGHT = "h-[440px]";

const cardStyle = `
  rounded-xl
  bg-[linear-gradient(0deg,rgba(255,255,255,0.70)_0%,rgba(255,255,255,0.70)_100%),linear-gradient(140deg,#FFF_24.44%,#93C7FB_92.29%)]
  backdrop-blur-sm
  shadow-[inset_5.471px_5.471px_10.941px_rgba(238,244,251,0.50),0px_8.206px_13.677px_rgba(109,205,247,0.52)]
  ring-4 ring-white/40
  border-2 border-sky-100
  relative overflow-hidden flex flex-col
`;

export default function ResearchTrendsSummary() {
  const [summary, setSummary] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { getCachedSummary } = useResearchSummary();

  const loadSummary = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const { data: freshSummary } = await getCachedSummary("ai");
      if (freshSummary) {
        setSummary(freshSummary);
      } else {
        throw new Error("No summary available");
      }
    } catch (err) {
      console.error("Error loading research trends:", err);
      setError("Suggestions will appear here once Neura has read a few of your papers.");
    } finally {
      setIsLoading(false);
    }
  }, [getCachedSummary]);

  useEffect(() => {
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card className={cn(cardStyle, DASHBOARD_CARD_HEIGHT)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 px-5 pb-3 pt-4">
        <h3 className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <GraduationCap size={14} />
          Suggested reading
        </h3>
        {!isLoading && (
          <button
            type="button"
            onClick={loadSummary}
            aria-label="Refresh suggestions"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] duration-150 ease-out hover:bg-white/70 hover:text-foreground active:scale-90"
          >
            <RotateCw size={14} />
          </button>
        )}
      </CardHeader>

      <CardContent
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-5 pb-6 [scrollbar-gutter:stable]",
          // Fade the bottom edge so it's clear the summary continues
          !isLoading && !error && "[mask-image:linear-gradient(to_bottom,black_calc(100%-28px),transparent)]"
        )}
      >
        {isLoading ? (
          <div className="space-y-3 pt-1" aria-label="Loading suggestions">
            {["w-11/12", "w-full", "w-4/5", "w-2/3", "w-full", "w-3/4"].map((w, i) => (
              <div key={i} className={cn("h-3.5 rounded bg-white/70 animate-pulse motion-reduce:animate-none", w)} />
            ))}
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <GraduationCap className="size-7 text-muted-foreground" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">{error}</p>
            <button
              type="button"
              onClick={loadSummary}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-primary transition-[background-color,transform] duration-150 ease-out hover:bg-white/70 active:scale-[0.97]"
            >
              Try again
            </button>
          </div>
        ) : (
          <Markdown className="prose prose-sm max-w-none text-black/65 prose-headings:text-foreground prose-strong:text-foreground prose-a:text-primary">
            {summary}
          </Markdown>
        )}
      </CardContent>
    </Card>
  );
}
