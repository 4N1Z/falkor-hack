"use client";

import type { KnowledgeGraph, KnowledgeNode } from "@/app/api/adam/[projectId]/knowledge/route";
import { FalkorCanvas, type CanvasLink, type CanvasNode } from "@/components/graph/falkor-canvas";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ProjectStatus } from "@/lib/adam/status";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";

const fetcher = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url);
  const b = await r.json();
  if (!r.ok) throw new Error(b.error ?? "Couldn't load");
  return b as T;
};

const LABEL_COLOR: Record<string, string> = {
  Paper: "#94a3b8",
  Claim: "#2563eb",
  Evidence: "#0891b2",
  Method: "#7c3aed",
  Assumption: "#d97706",
  Condition: "#db2777",
  OpenQuestion: "#dc2626",
  Procedure: "#059669",
  Result: "#4d7c0f",
  Instrument: "#64748b",
  Candidate: "#f59e0b",
};

const STATE_TONE: Record<string, string> = {
  extracted: "bg-slate-100 text-slate-600",
  agent_verified: "bg-emerald-50 text-emerald-700",
  low_confidence: "bg-amber-50 text-amber-800",
  conflict: "bg-rose-50 text-rose-700",
  human_approved: "bg-sky-50 text-sky-700",
  retracted: "bg-slate-50 text-slate-400 line-through",
};

const STATE_LABEL: Record<string, string> = {
  extracted: "unchecked",
  agent_verified: "verified",
  low_confidence: "low confidence",
  conflict: "conflict",
  human_approved: "approved",
  retracted: "retracted",
};

/** The graph of known steps: a filterable table and the canvas, each node one click from its source passage. */
export function KnowledgeTab({ workspaceId, status }: { workspaceId: string; status: ProjectStatus }) {
  const projectId = status.project.id;
  const base = `/api/adam/${projectId}/knowledge?workspaceId=${workspaceId}`;
  const [mode, setMode] = useState<"table" | "graph">("table");
  const [label, setLabel] = useState<string>("all");
  const [state, setState] = useState<string>("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const poll = status.project.status === "running" ? 8000 : 0;
  const { data: table, error } = useSWR(`${base}&view=table`, fetcher<{ nodes: KnowledgeNode[] }>, { refreshInterval: poll, keepPreviousData: true });
  const { data: graph } = useSWR(mode === "graph" ? `${base}&view=graph` : null, fetcher<KnowledgeGraph>, { refreshInterval: poll, keepPreviousData: true });

  const nodes = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (table?.nodes ?? [])
      .filter((n) => (label === "all" || n.label === label) && (state === "all" || n.state === state) && (!needle || n.text.toLowerCase().includes(needle) || n.paperTitle.toLowerCase().includes(needle)))
      .sort((a, b) => Number(b.loadBearing) - Number(a.loadBearing) || b.dependents - a.dependents || b.createdAt - a.createdAt);
  }, [table, label, state, q]);
  const labelCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const n of table?.nodes ?? []) c[n.label] = (c[n.label] ?? 0) + 1;
    return c;
  }, [table]);

  const canvas = useMemo(() => {
    if (!graph) return { nodes: [] as CanvasNode[], links: [] as CanvasLink[] };
    const cnodes: CanvasNode[] = graph.nodes.map((n) => ({
      id: n.id,
      caption: n.label === "Paper" ? n.text.split(/[:–—]/)[0].split(/\s+/).slice(0, 3).join(" ") : n.text.split(/\s+/).slice(0, 4).join(" "),
      color: n.state === "retracted" ? "#cbd5e1" : LABEL_COLOR[n.label] ?? "#64748b",
      size: n.label === "Paper" ? 14 : 6 + Math.min(10, n.weight * 2),
      shape: n.label === "Paper" ? "square" : "circle",
    }));
    const links: CanvasLink[] = graph.links.map((l) => ({
      source: l.source,
      target: l.target,
      color: l.type === "CONTRADICTS" ? "#e11d48" : l.type === "EXTRACTED_FROM" ? "#e2e8f0" : "#94a3b8",
      width: l.type === "CONTRADICTS" ? 2 : 1,
      dashed: l.status === "suggested",
    }));
    return { nodes: cnodes, links };
  }, [graph]);

  if (error) return <p className="text-sm text-red-700">{error.message}</p>;

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-2 text-sm">
        <div className="flex items-center gap-1 rounded-md bg-muted p-0.5">
          {(["table", "graph"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cn("rounded px-2.5 py-1 text-xs capitalize", mode === m ? "bg-white shadow-sm" : "text-muted-foreground")}>
              {m}
            </button>
          ))}
        </div>
        <select value={label} onChange={(e) => setLabel(e.target.value)} className="rounded-md border bg-white px-2 py-1 text-xs">
          <option value="all">All kinds ({table?.nodes.length ?? 0})</option>
          {Object.entries(labelCounts).map(([l, n]) => (
            <option key={l} value={l}>{l} ({n})</option>
          ))}
        </select>
        <select value={state} onChange={(e) => setState(e.target.value)} className="rounded-md border bg-white px-2 py-1 text-xs">
          <option value="all">Any state</option>
          {Object.entries(STATE_LABEL).map(([s, l]) => (
            <option key={s} value={s}>{l}</option>
          ))}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search text or paper…" className="rounded-md border bg-white px-2 py-1 text-xs w-64" />
        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          {Object.entries(LABEL_COLOR).filter(([l]) => l !== "Instrument").map(([l, c]) => (
            <span key={l} className="inline-flex items-center gap-1"><span className="inline-block size-2 rounded-full" style={{ background: c }} />{l}</span>
          ))}
        </div>
      </header>

      {mode === "table" ? (
        !table ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center"><Loader2 className="size-4 animate-spin" /> Loading…</div>
        ) : nodes.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-white p-10 text-center text-sm text-muted-foreground">
            {table.nodes.length === 0 ? "Nothing extracted yet. The Extractor runs once the sweep has read the core papers." : "Nothing matches these filters."}
          </div>
        ) : (
          <div className="rounded-lg border bg-white overflow-hidden">
            <ul className="divide-y max-h-[65vh] overflow-y-auto">
              {nodes.slice(0, 500).map((n) => (
                <li key={n.id} className="px-3 py-2 text-sm flex items-start gap-3 hover:bg-accent/40 cursor-pointer" onClick={() => setSelected(n.id)}>
                  <span className="mt-1 inline-block size-2.5 rounded-full shrink-0" style={{ background: LABEL_COLOR[n.label] }} title={n.label} />
                  <div className="min-w-0 flex-1">
                    <p className="leading-snug">{n.text}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                      <span>{n.label}</span>
                      {n.paperTitle && <span className="truncate max-w-[20rem]">{n.paperTitle}{n.year ? ` (${n.year})` : ""}</span>}
                      {n.page > 0 && <span>p.{n.page}</span>}
                      {n.section && <span>{n.section}</span>}
                      {n.loadBearing && <span className="text-sky-700">{n.dependents} depend on this</span>}
                      {n.aliases.length > 0 && <span>also: {n.aliases.join(", ")}</span>}
                    </p>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] shrink-0", STATE_TONE[n.state] ?? "bg-muted")}>{STATE_LABEL[n.state] ?? n.state}</span>
                </li>
              ))}
            </ul>
            {nodes.length > 500 && <p className="px-3 py-2 text-xs text-muted-foreground border-t">Showing 500 of {nodes.length}; narrow the filters.</p>}
          </div>
        )
      ) : (
        <div className="relative h-[70vh] rounded-lg border bg-white overflow-hidden">
          {!graph ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin mr-2" /> Loading the graph…</div>
          ) : canvas.nodes.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Nothing to draw yet.</div>
          ) : (
            <FalkorCanvas nodes={canvas.nodes} links={canvas.links} layout="force" selectedId={selected} onSelect={(id) => setSelected(id)} />
          )}
        </div>
      )}

      <NodeSheet workspaceId={workspaceId} projectId={projectId} id={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

interface NodeDetail {
  node: Record<string, unknown> & { label: string; id: string; text: string; state: string; reason: string; quote: string; chunkText: string; chunkPage: number; chunkSection: string; paperTitle: string; year: number | null; confidence: number; priorText: string | null; aliases: string[]; conditions: string[]; speculative: boolean; loadBearing: boolean; dependents: number };
  edges: { dir: "in" | "out"; type: string; label: string; otherId: string; otherText: string; status: string; otherState: string }[];
  mentions: { paperId: string; paperTitle: string; year: number | null; name: string; quote: string; page: number; state: string; parameters: string[] }[];
}

/** Provenance of one node: the statement, the passage with the quote marked, the paper, and every edge around it. */
export function NodeSheet({ workspaceId, projectId, id, onClose }: { workspaceId: string; projectId: string; id: string | null; onClose: () => void }) {
  const { data } = useSWR(id && !id.startsWith("W") && !id.startsWith("local:") ? `/api/adam/${projectId}/knowledge?workspaceId=${workspaceId}&view=node&id=${encodeURIComponent(id)}` : null, fetcher<NodeDetail>);
  const n = data?.node;
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
        {!id ? null : id.startsWith("W") || id.startsWith("local:") ? (
          <SheetHeader>
            <SheetTitle>Paper</SheetTitle>
            <SheetDescription>Open the research graph to focus on this paper and its citation neighbourhood.</SheetDescription>
          </SheetHeader>
        ) : !data ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center"><Loader2 className="size-4 animate-spin" /> Loading…</div>
        ) : n ? (
          <div className="flex flex-col gap-4">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-base">
                <span className="inline-block size-2.5 rounded-full" style={{ background: LABEL_COLOR[n.label] }} />
                {n.label}
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-normal", STATE_TONE[n.state])}>{STATE_LABEL[n.state] ?? n.state}</span>
              </SheetTitle>
              <SheetDescription className="text-foreground text-sm leading-relaxed">{n.text}</SheetDescription>
            </SheetHeader>
            {n.priorText && <p className="text-xs text-muted-foreground">Agent&apos;s version: {n.priorText}</p>}
            {n.conditions?.length > 0 && <p className="text-xs"><span className="text-muted-foreground">Holds under:</span> {n.conditions.join("; ")}</p>}
            {n.reason && <p className="text-xs text-amber-800">{n.reason}</p>}
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Source {n.paperTitle ? `· ${n.paperTitle}${n.year ? ` (${n.year})` : ""}` : ""}
                {n.chunkPage > 0 ? ` · p.${n.chunkPage}` : ""}
                {n.chunkSection ? ` · ${n.chunkSection}` : ""}
              </h4>
              {n.chunkText ? (
                <div className="rounded-md bg-muted/30 p-3 text-[13px] max-h-64 overflow-y-auto">
                  <MarkedText text={n.chunkText} quote={n.quote} />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No passage; this came from metadata or a shared entity.</p>
              )}
            </section>
            {data.mentions.length > 0 && (
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Used in {data.mentions.length} paper(s)</h4>
                <ul className="flex flex-col gap-2">
                  {data.mentions.map((m, i) => (
                    <li key={`${m.paperId}-${i}`} className="text-xs">
                      <p className="font-medium">{m.paperTitle}{m.year ? ` (${m.year})` : ""} {m.page ? `· p.${m.page}` : ""}</p>
                      <p className="text-muted-foreground italic">“{m.quote}”</p>
                      {m.parameters.length > 0 && <p className="text-muted-foreground">{m.parameters.join(" · ")}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {data.edges.length > 0 && (
              <section>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Connections</h4>
                <ul className="flex flex-col gap-1 text-xs">
                  {data.edges.map((e, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="font-mono text-muted-foreground w-28 shrink-0">{e.dir === "out" ? `→ ${e.type}` : `← ${e.type}`}</span>
                      <span className="inline-block size-2 rounded-full mt-1 shrink-0" style={{ background: LABEL_COLOR[e.label] ?? "#94a3b8" }} />
                      <span className={cn("leading-snug", e.otherState === "retracted" && "line-through text-muted-foreground")}>{e.otherText.slice(0, 160)}</span>
                      {e.status === "suggested" && <span className="text-muted-foreground shrink-0">proposed</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function MarkedText({ text, quote }: { text: string; quote: string }) {
  if (!quote || quote.length < 12) return <p className="whitespace-pre-wrap leading-relaxed">{text}</p>;
  const re = new RegExp(quote.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"), "i");
  const m = text.match(re);
  if (!m || m.index === undefined) return <p className="whitespace-pre-wrap leading-relaxed">{text}</p>;
  return (
    <p className="whitespace-pre-wrap leading-relaxed">
      {text.slice(0, m.index)}
      <mark className="bg-yellow-100 rounded px-0.5">{m[0]}</mark>
      {text.slice(m.index + m[0].length)}
    </p>
  );
}
