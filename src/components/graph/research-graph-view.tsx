"use client";

import type { AgentRunView, GraphView, GraphViewNode, GraphViewResponse } from "@/app/api/graph/[workspaceId]/route";
import type { LayoutMode } from "@falkordb/canvas";
import { FalkorCanvas, type CanvasLink, type CanvasNode } from "./falkor-canvas";
import { cn } from "@/lib/utils";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

const OWNER_COLORS = ["#2563eb", "#db2777", "#059669", "#d97706", "#7c3aed", "#0891b2", "#dc2626", "#4d7c0f"];
const FRONTIER = "#94a3b8";
const AGENT_NAMES: Record<string, string> = {
  "cite-scout": "Cite Scout",
  "citation-checker": "Citation Checker",
  "next-steps": "Next-Step",
  historian: "Historian",
  synthesis: "Synthesis",
  "scout-watcher": "Scout Watcher",
};
/** Stored traces name the internal model ("jev.classify", source "jev"); show it as Neura. */
const brandTrace = (s: string) => s.replace(/\bjev\b/gi, "neura");
const VIEW_HELP: Record<GraphView, string> = {
  team: "Who has which papers, and the outside papers that connect your libraries. Click a paper to focus on it.",
  focus: "Everything this paper cites and is cited by in your graph. Coloured nodes are in a collaborator's library.",
  provenance: "Exactly the papers and citation chains this agent run used to reach its suggestion.",
};

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    const b = await r.json();
    if (!r.ok) throw new Error(b.error ?? "Couldn't load the graph");
    return b as GraphViewResponse;
  });

const ago = (ms: number) => {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/** Short caption that fits inside a node: first meaningful words of the title. */
const shortCaption = (n: GraphViewNode) => {
  if (n.kind === "user") return n.label.replace(/\s*\(demo\)/, "");
  const words = n.label.replace(/(:| [–—-] ).*$/, "").split(/\s+/).slice(0, 2).join(" ");
  return n.year ? `${words} ’${String(n.year).slice(2)}` : words;
};

/**
 * Research graph — three focused views drawn with FalkorDB's own canvas (@falkordb/canvas):
 * Team map (force), Paper focus (force, centred) and Agent provenance (tree). Each answers one question
 * a researcher actually has, instead of showing the whole graph at once.
 */
export default function ResearchGraphView({ workspaceId }: { workspaceId: string }) {
  const [view, setView] = useState<GraphView>("team");
  const [paperId, setPaperId] = useState<string | null>(null);
  const [run, setRun] = useState<AgentRunView | null>(null);
  const [selected, setSelected] = useState<GraphViewNode | null>(null);

  const url =
    view === "focus" && paperId
      ? `/api/graph/${workspaceId}?view=focus&paperId=${paperId}`
      : view === "provenance" && run
        ? `/api/graph/${workspaceId}?view=provenance&runId=${run.id}`
        : `/api/graph/${workspaceId}?view=team`;
  const { data, error, isLoading } = useSWR(url, fetcher, { keepPreviousData: true });

  // Colours are assigned on first sight and never reshuffled, so a collaborator keeps their colour across views
  const palette = useRef(new Map<string, string>());
  const ownerColor = useMemo(() => {
    const users = [...new Set((data?.nodes ?? []).flatMap((n) => (n.kind === "user" ? [n.id] : n.owners ?? [])))].sort();
    for (const id of users) if (!palette.current.has(id)) palette.current.set(id, OWNER_COLORS[palette.current.size % OWNER_COLORS.length]);
    return new Map(users.map((id) => [id, palette.current.get(id)!]));
  }, [data]);
  const userName = (id: string) => data?.nodes.find((n) => n.id === id)?.label ?? "Collaborator";

  const focusPaper = (id: string) => {
    setPaperId(id);
    setRun(null);
    setSelected(null);
    setView("focus");
  };
  const showRun = (r: AgentRunView) => {
    setRun(r);
    setSelected(null);
    setView("provenance");
  };
  const backToTeam = () => {
    setView("team");
    setRun(null);
    setPaperId(null);
    setSelected(null);
  };

  const layout: LayoutMode = view === "provenance" ? "tree" : "force";

  return (
    <div className="flex h-[calc(100dvh-1rem)] gap-3 p-2 font-sans">
      <div className="relative flex-1 overflow-hidden rounded-lg border bg-white">
        <div className="absolute left-3 right-3 top-3 z-10 flex items-start justify-between gap-3">
          <div className="pointer-events-auto max-w-md rounded-md bg-white/90 px-3 py-2 shadow-sm">
            <div className="flex items-center gap-2">
              {view !== "team" && (
                <button
                  type="button"
                  onClick={backToTeam}
                  className="rounded p-0.5 text-muted-foreground transition-transform duration-150 ease-out hover:bg-muted active:scale-[0.95]"
                  aria-label="Back to team map"
                >
                  <ArrowLeft className="size-4" />
                </button>
              )}
              <p className="text-sm font-medium">
                {view === "team" ? "Team map" : view === "focus" ? "Paper focus" : `Why ${AGENT_NAMES[run?.agent ?? ""] ?? "the agent"} suggested this`}
              </p>
              {isLoading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{VIEW_HELP[view]}</p>
          </div>
          <Legend ownerColor={ownerColor} userName={userName} />
        </div>

        {error ? (
          <p className="p-6 pt-28 text-sm text-muted-foreground">{(error as Error).message}</p>
        ) : data ? (
          <Canvas
            nodes={data.nodes}
            links={data.links}
            layout={layout}
            ownerColor={ownerColor}
            selectedId={selected?.id ?? null}
            onSelect={(n) => setSelected(n)}
          />
        ) : null}
      </div>

      <aside className="flex w-[320px] shrink-0 flex-col gap-3 overflow-hidden">
        {selected ? (
          <NodeCard node={selected} userName={userName} onFocus={focusPaper} onClose={() => setSelected(null)} />
        ) : (
          <div className="rounded-lg border p-3 text-xs text-muted-foreground">
            Click a node to see what it is. Click <span className="font-medium text-foreground">Focus</span> on a paper to see its citation
            neighbourhood, or pick an agent run below to see exactly what it used.
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col rounded-lg border">
          <p className="border-b px-3 py-2 text-sm font-medium">Agent activity</p>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {(data?.runs ?? []).length === 0 && (
              <li className="p-3 text-xs text-muted-foreground">No agent runs yet. Write in a document to wake them up.</li>
            )}
            {(data?.runs ?? []).map((r) => {
              const open = run?.id === r.id;
              return (
                <li key={r.id} className="border-b last:border-b-0">
                  <button
                    type="button"
                    disabled={!r.highlight.length}
                    onClick={() => (open ? backToTeam() : showRun(r))}
                    className={cn(
                      "w-full px-3 py-2 text-left transition-colors duration-150 enabled:hover:bg-muted/50 disabled:cursor-default",
                      open && "bg-amber-50",
                    )}
                  >
                    <p className="flex items-center justify-between text-xs">
                      <span className="font-medium">{AGENT_NAMES[r.agent] ?? r.agent}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {ago(r.at)} · {(r.ms / 1000).toFixed(1)}s
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {r.outcome.toLowerCase().replace(/_/g, " ")} · {r.items} result{r.items === 1 ? "" : "s"}
                      {r.highlight.length ? ` · show ${r.highlight.length} nodes` : ""}
                    </p>
                  </button>
                  {open && (
                    <ol className="space-y-1 bg-amber-50/50 px-3 pb-2 text-[11px]">
                      {r.trace.map((t, i) => (
                        <li key={i} className="rounded bg-white/70 px-2 py-1">
                          <p className="flex justify-between gap-2">
                            <span className="font-mono">{brandTrace(t.tool)}</span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">
                              {t.ms}ms{t.rows !== undefined ? ` · ${t.rows} rows` : ""}
                            </span>
                          </p>
                          {(t.cypher || t.source) && (
                            <p className="text-muted-foreground">
                              {t.source ? brandTrace(t.source) : ""}
                              {t.cypher ? ` · ${t.cypher}` : ""}
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </div>
  );
}

/** Map the research-graph view model onto the shared FalkorDB canvas. */
function Canvas({
  nodes,
  links,
  layout,
  ownerColor,
  selectedId,
  onSelect,
}: {
  nodes: GraphViewNode[];
  links: GraphViewResponse["links"];
  layout: LayoutMode;
  ownerColor: Map<string, string>;
  selectedId: string | null;
  onSelect: (n: GraphViewNode | null) => void;
}) {
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const canvasNodes = useMemo<CanvasNode[]>(
    () =>
      nodes.map((n) => ({
        id: n.id,
        caption: shortCaption(n),
        color:
          n.kind === "user" || n.kind === "paper"
            ? ownerColor.get(n.kind === "user" ? n.id : n.owners![0]) ?? "#334155"
            : n.kind === "frontier"
              ? FRONTIER
              : n.kind === "idea"
                ? "#f59e0b"
                : n.kind === "question"
                  ? "#305eff"
                  : "#8b5cf6",
        size: n.center ? 16 : n.kind === "user" ? 14 : n.kind === "paper" ? 11 : n.kind === "frontier" ? 7 + (n.bridges ?? 0) : 9,
        shape: n.kind === "user" ? "square" : "circle",
      })),
    [nodes, ownerColor],
  );
  const canvasLinks = useMemo<CanvasLink[]>(
    () =>
      links.map((l) => ({
        source: l.source,
        target: l.target,
        width: l.kind === "cites" ? 1.2 : 0.8,
        color: l.kind === "cites" ? "#64748b" : l.kind === "imported" ? "#cbd5e1" : l.kind === "grounded" ? "#f59e0b" : "#a78bfa",
        dashed: !!l.suggested,
      })),
    [links],
  );
  return (
    <FalkorCanvas
      nodes={canvasNodes}
      links={canvasLinks}
      layout={layout}
      selectedId={selectedId}
      onSelect={(id) => onSelect(id ? byId.get(id) ?? null : null)}
    />
  );
}

function Legend({ ownerColor, userName }: { ownerColor: Map<string, string>; userName: (id: string) => string }) {
  return (
    <div className="pointer-events-none space-y-1 rounded-md bg-white/90 p-2 text-[11px] shadow-sm">
      {[...ownerColor.entries()].map(([id, color]) => (
        <p key={id} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: color }} /> {userName(id)}&apos;s papers
        </p>
      ))}
      <p className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full" style={{ background: FRONTIER }} /> Outside the library
      </p>
    </div>
  );
}

function NodeCard({
  node,
  userName,
  onFocus,
  onClose,
}: {
  node: GraphViewNode;
  userName: (id: string) => string;
  onFocus: (id: string) => void;
  onClose: () => void;
}) {
  const kind = {
    user: "Collaborator",
    paper: "In the team library",
    frontier: node.bridges ? `Connects ${node.bridges} collaborators' libraries` : "Outside the library",
    memory: "Note (Historian)",
    idea: "Idea (Next-Step)",
    question: node.byName ? `Asked in the team chat by ${node.byName}` : "Asked in the team chat",
  }[node.kind];
  const isPaper = node.kind === "paper" || node.kind === "frontier";
  return (
    <div className="rounded-lg border p-3 text-sm animate-in fade-in-0 duration-150">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">{kind}</p>
        <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
          Close
        </button>
      </div>
      <p className="mt-0.5 font-medium leading-snug">{node.label}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {[
          node.year,
          node.owners?.length ? `${node.owners.map(userName).join(" & ")}'s library` : null,
          node.chunks ? `${node.chunks} passages indexed` : null,
          node.center ? "centre of this view" : null,
          node.citedByCenter === true ? "cited by the centre paper" : node.citedByCenter === false ? "cites the centre paper" : null,
          node.status,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {node.asked && node.asked.length > 0 && (
        <div className="mt-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Asked about in the team chat</p>
          <ul className="mt-1 space-y-1">
            {node.asked.slice(0, 3).map((a, i) => (
              <li key={i} className="text-xs leading-snug">
                <span className="text-muted-foreground">{a.byName}:</span> {a.text.length > 120 ? `${a.text.slice(0, 120)}…` : a.text}
              </li>
            ))}
          </ul>
        </div>
      )}
      {isPaper && !node.center && (
        <button
          type="button"
          onClick={() => onFocus(node.id)}
          className="mt-2 w-full rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground transition-transform duration-150 ease-out hover:bg-primary/90 active:scale-[0.97]"
        >
          Focus on this paper
        </button>
      )}
    </div>
  );
}
