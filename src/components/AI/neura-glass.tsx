"use client";

import { cn } from "@/lib/utils";

/**
 * The Neura glass panel: frosted gradient with the conic glow that sweeps once on mount and
 * settles (see .neura-glow in globals.css). The glow divs sit behind the panel as siblings so
 * the panel's overflow-hidden doesn't clip them.
 */
export function NeuraGlass({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <div aria-hidden className="neura-glow neura-glow--halo" />
      <div aria-hidden className="neura-glow neura-glow--edge" />
      <div
        className={cn(
          "relative h-full w-full overflow-hidden rounded-lg ring-1 ring-white/60",
          "shadow-[inset_5.471px_5.471px_10.941px_rgba(238,244,251,0.40),0px_8.206px_13.677px_rgba(109,205,247,0.22)]",
          "bg-[linear-gradient(0deg,rgba(255,255,255,0.70)_0%,rgba(255,255,255,0.70)_100%),linear-gradient(140deg,#EEF4FB_7.44%,#93C7FB_92.29%)]",
        )}
      >
        {children}
      </div>
    </div>
  );
}
