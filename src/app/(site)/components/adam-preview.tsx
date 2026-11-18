"use client";

import { cn } from "@/lib/utils";
import { neuraQueryLogo } from "@/lib/logos";
import { useEffect, useState } from "react";
import { adamPhases, glassCard, innerCard, logoTile } from "./styles";

const chain = [
  { step: "Thin-film deposition", status: "runnable", cost: "2 d" },
  { step: "Photoluminescence sweep", status: "runnable", cost: "1 d" },
  { step: "Defect passivation at 85 °C", status: "gap", cost: "?" },
  { step: "Spectral shift readout", status: "partial", cost: "4 h" },
];

const statusStyle: Record<string, string> = {
  runnable: "bg-green-100 text-green-700",
  partial: "bg-yellow-100 text-yellow-700",
  gap: "bg-red-100 text-red-600",
};

export default function AdamPreview() {
  const [phase, setPhase] = useState(2);

  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % adamPhases.length), 1800);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={cn(glassCard, "w-full p-4 md:p-6 text-foreground relative overflow-hidden")}>
      <div className="absolute h-[300px] w-[300px] -bottom-20 -right-10 bg-secondary rounded-full filter blur-3xl opacity-60 pointer-events-none" />

      {/* status bar */}
      <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-sky-100 pb-4">
        <div className="flex items-center gap-3">
          <div className={cn(logoTile, "w-11 h-11 p-2 shrink-0")}>
            {neuraQueryLogo}
          </div>
          <div className="flex flex-col">
            <p className="text-lg font-medium leading-none">Adam · Photon spectrum project</p>
            <p className="text-sm text-muted-foreground leading-tight">
              pass 1 · 71 papers triaged · 33 read in full · 2,215 passages
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded-md bg-amber-100 text-amber-700 px-2 py-1 font-medium">
            Waiting for you · gate 2
          </span>
          <span className="rounded-md bg-primary text-white px-3 py-1 font-medium">Run</span>
        </div>
      </div>

      {/* phase stepper */}
      <div className="relative flex flex-wrap gap-1.5 py-4">
        {adamPhases.map((p, i) => (
          <div
            key={p}
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1 text-xs md:text-sm border transition-colors duration-300",
              i < phase && "bg-sky-50 border-sky-100 text-primary",
              i === phase && "bg-primary border-primary text-white",
              i > phase && "bg-white/60 border-transparent text-muted-foreground"
            )}
          >
            {i + 1}. {p}
          </div>
        ))}
      </div>

      <div className="relative grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
        {/* exception queue */}
        <div className={cn(innerCard, "p-4 flex flex-col gap-3")}>
          <div className="flex items-center justify-between">
            <p className="font-medium text-primary">Extraction queue</p>
            <span className="text-xs rounded bg-red-100 text-red-600 px-1.5 py-0.5">conflict</span>
          </div>
          <p className="text-sm leading-snug">
            Passivated films keep 92% of initial PL intensity after 500 h.
          </p>
          <blockquote className="text-xs leading-snug text-muted-foreground border-l-2 border-primary pl-2">
            “…retained <mark className="bg-sky-100 text-foreground">92% of their initial PL intensity</mark>{" "}
            after 500 h of continuous illumination…”
            <span className="block mt-1 text-primary/80">Results · p. 6</span>
          </blockquote>
          <div className="flex gap-2 text-xs">
            <span className="rounded border border-sky-100 bg-white px-2 py-1">a · approve</span>
            <span className="rounded border border-sky-100 bg-white px-2 py-1">c · correct</span>
            <span className="rounded border border-sky-100 bg-white px-2 py-1">r · reject</span>
          </div>
        </div>

        {/* hypothesis brief */}
        <div className={cn(innerCard, "p-4 flex flex-col gap-3")}>
          <div className="flex items-center justify-between">
            <p className="font-medium text-primary">Hypothesis brief B</p>
            <span className="text-xs rounded bg-green-100 text-green-700 px-1.5 py-0.5">survived</span>
          </div>
          <p className="text-sm leading-snug">
            Surface passivation, not grain size, sets the emission shift under heat.
          </p>
          <div className="text-xs grid grid-cols-2 gap-2">
            <span className="rounded bg-green-50 text-green-700 px-2 py-1">7 claims for</span>
            <span className="rounded bg-red-50 text-red-600 px-2 py-1">2 claims against</span>
          </div>
          <div className="text-xs rounded border border-dashed border-primary/40 px-2 py-1.5">
            <span className="font-semibold text-primary">Kill criterion (signed):</span> no shift
            above 4 nm at 85 °C across 3 batches.
          </div>
        </div>

        {/* chain */}
        <div className={cn(innerCard, "p-4 flex flex-col gap-3")}>
          <div className="flex items-center justify-between">
            <p className="font-medium text-primary">Chain · cheapest-to-kill first</p>
          </div>
          <ol className="flex flex-col gap-2">
            {chain.map((c, i) => (
              <li key={c.step} className="flex items-center gap-2 text-sm">
                <span className="w-5 h-5 shrink-0 rounded-full bg-sky-50 border border-sky-100 text-xs flex items-center justify-center text-primary">
                  {i + 1}
                </span>
                <span className="flex-1 leading-tight">{c.step}</span>
                <span className={cn("text-xs rounded px-1.5 py-0.5", statusStyle[c.status])}>
                  {c.status}
                </span>
                <span className="text-xs text-muted-foreground w-7 text-right">{c.cost}</span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">
            The gap at step 3 sends the Methods Hunter back out.
          </p>
        </div>
      </div>
    </div>
  );
}
