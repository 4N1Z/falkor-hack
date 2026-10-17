"use client";

import { FalkorCanvas, type CanvasLink, type CanvasNode } from "@/components/graph/falkor-canvas";
import type { HypothesisMap as MapData, MapNode } from "@/lib/adam/hypothesis-map";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";

const COLOR: Record<string, string> = {
  Hypothesis: "#0f172a",
  Claim: "#2563eb",
  Paper: "#94a3b8",
  Topic: "#f59e0b",
  Method: "#7c3aed",
  Assumption: "#d97706",
  Procedure: "#059669",
  Result: "#4d7c0f",
  Attack: "#e11d48",
  Candidate: "#f97316",
  Plan: "#0891b2",
};

const fetcher = async (url: string) => {
  const r = await fetch(url);
  const b = await r.json();
  if (!r.ok) throw new Error(b.error ?? "Couldn't load the map");
  return b as MapData;
};

const caption = (n: MapNode) => {
  const words = n.text.replace(/\s+/g, " ").split(" ");
  if (n.label === "Hypothesis") return words.slice(0, 5).join(" ");
  if (n.label === "Topic") return n.text.split("·")[0].trim();
  if (n.label === "Paper") return n.text.replace(/\s*\(\d{4}\)$/, "").split(/[:–—]/)[0].split(" ").slice(0, 3).join(" ");
  if (n.label === "Attack") return `${n.kind?.replace(/_/g, " ")} · ${n.status}`;
  return words.slice(0, 4).join(" ");
};

/** A brief at the centre; its evidence, papers, topics, methods, assumptions, attacks and plan around it. */
export function HypothesisMapView({ workspaceId, projectId, hypothesisId, onOpen }: { workspaceId: string; projectId: string; hypothesisId: string; onOpen: (id: string) => void }) {
  const { data, error } = useSWR(`/api/adam/${projectId}/knowledge?workspaceId=${workspaceId}&view=hypothesis&id=${encodeURIComponent(hypothesisId)}`, fetcher, { keepPreviousData: true });
  const [selected, setSelected] = useState<string | null>(null);
  const [hide, setHide] = useState<Set<string>>(new Set());

  const canvas = useMemo(() => {
    if (!data) return { nodes: [] as CanvasNode[], links: [] as CanvasLink[] };
    const shown = data.nodes.filter((n) => !hide.has(n.label));
    const ids = new Set(shown.map((n) => n.id));
    const nodes: CanvasNode[] = shown.map((n) => ({
      id: n.id,
      caption: caption(n),
      color:
        n.state === "retracted" ? "#cbd5e1"
        : n.label === "Claim" && n.role === "against" ? "#e11d48"
        : n.label === "Claim" && n.role === "contradicts" ? "#be123c"
        : n.label === "Attack" && n.status === "answered" ? "#fb7185"
        : COLOR[n.label] ?? "#64748b",
      size: n.label === "Hypothesis" ? 22 : n.label === "Topic" ? 14 : n.label === "Paper" ? 11 : n.label === "Attack" && n.status === "fatal" ? 12 : n.state === "human_approved" ? 10 : 7,
      shape: n.label === "Paper" || n.label === "Topic" || n.label === "Plan" ? "square" : "circle",
    }));
    const links: CanvasLink[] = data.links
      .filter((l) => ids.has(l.source) && ids.has(l.target))
      .map((l) => ({
        source: l.source,
        target: l.target,
        color: l.type === "EVIDENCE_FOR" ? "#10b981" : l.type === "EVIDENCE_AGAINST" || l.type === "CONTRADICTS" ? "#e11d48" : l.type === "ON" || l.type === "CITES" ? "#fda4af" : l.type === "ABOUT" ? "#fcd34d" : "#cbd5e1",
        width: l.type === "EVIDENCE_FOR" || l.type === "EVIDENCE_AGAINST" ? 2 : 1,
        dashed: l.type === "CITES" || l.type === "ABOUT",
      }));
    return { nodes, links };
  }, [data, hide]);

  const toggle = (label: string) => setHide((h) => {
    const n = new Set(h);
    n.has(label) ? n.delete(label) : n.add(label);
    return n;
  });

  if (error) return <p className="text-xs text-red-700">{error.message}</p>;
  if (!data) return <div className="flex items-center gap-2 text-xs text-muted-foreground py-6"><Loader2 className="size-3.5 animate-spin" /> Drawing the map…</div>;

  const counts: Record<string, number> = {};
  for (const n of data.nodes) counts[n.label] = (counts[n.label] ?? 0) + 1;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {Object.entries(COLOR).filter(([l]) => counts[l]).map(([l, c]) => (
          <button key={l} onClick={() => toggle(l)} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition-colors", hide.has(l) ? "opacity-40" : "bg-white")} title={hide.has(l) ? `Show ${l}` : `Hide ${l}`}>
            <span className="inline-block size-2 rounded-full" style={{ background: c }} />{l} <span className="text-muted-foreground tabular-nums">{counts[l]}</span>
          </button>
        ))}
        <span className="ml-auto text-muted-foreground">
          green edge = evidence for · red = against or contradicts · dashed = cites / topic · bigger node = approved by a person · grey = retracted
        </span>
      </div>
      <div className="relative h-[460px] rounded-md border bg-white overflow-hidden">
        <FalkorCanvas nodes={canvas.nodes} links={canvas.links} layout="force" selectedId={selected} onSelect={(id) => { setSelected(id); if (id && !id.startsWith("topic:") && !/^W\d+$/.test(id) && !id.startsWith("local:")) onOpen(id); }} />
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        Review done on this map: {data.reviews.approved} approved by a person · {data.reviews.corrected} corrected · {data.reviews.rejected} rejected · {data.reviews.verified} agent-verified · {data.reviews.unchecked} unchecked.
      </p>
    </div>
  );
}
