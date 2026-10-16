"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { GraduationCap, Loader2, MousePointerClick } from "lucide-react";

import { useResearchSummary } from "@/lib/hooks/use-research-summary";
import Markdown from "react-markdown";

export default function ResearchTrendsSummary() {
  const [summary, setSummary] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { getCachedSummary } = useResearchSummary();

  const loadSummary = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data: freshSummary } = await getCachedSummary("ai");
      if (freshSummary) {
        setSummary(freshSummary);
      } else {
        throw new Error("No summary available");
      }
    } catch (err) {
      console.error("Error loading research trends:", err);
      setError("Stay tuned for your personalized updates!");
    } finally {
      setIsLoading(false);
    }
  }, [getCachedSummary]);

  useEffect(() => {
    loadSummary();
  }, []);

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="flex justify-center items-center p-6">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          <span className="text-muted-foreground italic text-xs">
            Personalizing your Research !{" "}
          </span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full border-primary ring-card">
        <CardContent className="p-6 text-muted-foreground italic">
          {error}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={`
    rounded-xl
    bg-[linear-gradient(0deg,rgba(255,255,255,0.70)_0%,rgba(255,255,255,0.70)_100%),linear-gradient(140deg,#FFF_24.44%,#93C7FB_92.29%)]
    backdrop-blur-sm
    shadow-[inset_5.471px_5.471px_10.941px_rgba(238,244,251,0.50),0px_8.206px_13.677px_rgba(109,205,247,0.52)]
    ring-4 ring-white/40
    border-2 border-sky-100
    relative overflow-hidden
  `}
    >
      <CardHeader className="flex justify-between pt-3 pb-2">
        <div className="flex items-center gap-2">
          <GraduationCap size={16} className="text-muted-foreground" />
          <h3 className="text-sm text-muted-foreground">
            Your personalized suggestion
          </h3>
        </div>
      </CardHeader>

      <div className="relative">
        {/* Top shadow overlay */}
        <div
          className="absolute top-0 left-0 right-0 h-4 
      bg-gradient-to-b from-card/60 to-transparent 
      z-10 pointer-events-none"
        />

        {/* Bottom shadow overlay */}
        <div
          className="absolute bottom-0 left-0 right-0 h-4 
      bg-gradient-to-t from-white/50 to-transparent 
      z-10 pointer-events-none"
        />

        <CardContent className="overflow-y-auto max-h-[calc(60vh-4rem)] relative pb-6">
        {/* <CardContent className="overflow-y-auto h-fit relative"> */}

          <Markdown className="prose prose-sm dark:prose-invert text-black/60">
            {summary || "No summary available."}
          </Markdown>

          {/* {true && (
            <div
              className="absolute bottom-4 right-4  text-sky-500/70
                flex items-center gap-2 text-sm bg-white/80 px-3 py-1.5 rounded-full
                shadow-sm transition-opacity duration-300"
            >
              <MousePointerClick size={14} />
              <span>Scroll for more</span>
            </div>
          )} */}
        </CardContent>
      </div>
    </Card>
  );
}
