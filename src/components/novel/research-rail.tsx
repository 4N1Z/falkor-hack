"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CitationCheckPanel } from "./citation-check-sheet";
import { CiteScoutPanel } from "./cite-scout-panel";
import { EvidenceMapSheet } from "./evidence-map-sheet";
import { NotebookPanel } from "./notebook-sheet";
import { RailTile } from "./rail-icons";
import { SynthesisPanel } from "./synthesis-sheet";
import { WorkspaceChatPanel } from "./workspace-chat-panel";

/**
 * The research rail: one persistent home for the agents, beside the document instead of in
 * modal drawers over it. A narrow strip of icons (always visible) carries live counts, and the
 * chosen tool opens as a non-modal panel so you can read the verdicts and fix the text at the
 * same time. The Evidence map keeps its wide sheet because the canvas needs the room.
 *
 * Panels stay mounted while hidden: Cite Scout keeps watching the sentence, "/hypothesis" keeps
 * saving to the Notebook, and a finished citation check is still there when you come back.
 */
export type RailTool = "scout" | "check" | "notebook" | "review" | "chat";

const TOOLS: { id: RailTool; label: string; hint: string }[] = [
  { id: "scout", label: "Cite Scout", hint: "Citations for the sentence you're on, from everyone's library" },
  { id: "check", label: "Check citations", hint: "Does each cited paper actually support its claim?" },
  { id: "notebook", label: "Notebook", hint: "What the team believes, found and asked, and what to do next" },
  { id: "review", label: "Draft review", hint: "A literature review grouped by citation community, as a new document" },
  { id: "chat", label: "Workspace chat", hint: "Ask Neura with the team; everyone in the workspace sees the thread" },
];

const STORAGE_KEY = "neura:rail";
const STRIP_W = 56; // 44px strip + 12px gap, reserved beside the document
const PANEL_W = 340;
const press = "transition-transform duration-150 ease-out active:scale-[0.96]";

export function ResearchRail({ fileId }: { fileId: string }) {
  // Opening a document opens the rail: the last tool used in this browser, Cite Scout the first
  // time. Closing it is for the current visit only. (The editor subtree is client-rendered after
  // the file loads, so reading localStorage in the initializer cannot mismatch a server render.)
  const [active, setActive] = useState<RailTool | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved && TOOLS.some((t) => t.id === saved) ? (saved as RailTool) : "scout";
    } catch {
      return "scout";
    }
  });
  const [mapOpen, setMapOpen] = useState(false);
  const [counts, setCounts] = useState<{ scout: number; check: number | null; notebook: number; chat: number }>({ scout: 0, check: null, notebook: 0, chat: 0 });

  const choose = (tool: RailTool | null) => {
    setActive(tool);
    if (tool) {
      try {
        localStorage.setItem(STORAGE_KEY, tool);
      } catch {}
    }
  };

  // The document column reads this to keep text clear of the rail (see Editore.tsx)
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--research-rail", `${active ? STRIP_W + PANEL_W + 8 : STRIP_W}px`);
    return () => {
      root.style.removeProperty("--research-rail");
    };
  }, [active]);

  const onScoutCount = useCallback((n: number) => setCounts((c) => (c.scout === n ? c : { ...c, scout: n })), []);
  const onProblems = useCallback((n: number | null) => setCounts((c) => (c.check === n ? c : { ...c, check: n })), []);
  const onOpenNotes = useCallback((n: number) => setCounts((c) => (c.notebook === n ? c : { ...c, notebook: n })), []);
  const onChatUnread = useCallback((n: number) => setCounts((c) => (c.chat === n ? c : { ...c, chat: n })), []);

  const current = TOOLS.find((t) => t.id === active) ?? null;

  return (
    <>
      <div className="fixed bottom-24 right-4 top-4 z-30 hidden items-stretch gap-2 font-sans md:flex" aria-label="Research tools">
        {/* Panel: non-modal, stays beside the text. Hidden state is fully inert. */}
        <section
          aria-label={current?.label}
          // React 19 passes `inert` through; it removes the hidden panel from tab order and hit testing
          inert={!active}
          className={cn(
            "flex w-[340px] flex-col overflow-hidden rounded-lg border bg-background/95 shadow-sm backdrop-blur",
            "transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none",
            active ? "opacity-100 translate-x-0" : "pointer-events-none opacity-0 translate-x-2",
          )}
        >
          <header className="flex items-start justify-between gap-2 border-b px-3 py-2">
            <div className="flex min-w-0 items-start gap-2">
              {current && <RailTile tool={current.id} size="sm" active className="mt-0.5" />}
              <div className="min-w-0">
                <p className="text-sm font-medium">{current?.label}</p>
                <p className="text-[11px] leading-4 text-muted-foreground">{current?.hint}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => choose(null)}
              aria-label="Close panel"
              className={cn("rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground", press)}
            >
              <X className="size-3.5" />
            </button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col">
            <PanelSlot shown={active === "scout"}>
              <CiteScoutPanel fileId={fileId} visible={active === "scout"} onCount={onScoutCount} />
            </PanelSlot>
            <PanelSlot shown={active === "check"}>
              <CitationCheckPanel fileId={fileId} visible={active === "check"} onProblems={onProblems} />
            </PanelSlot>
            <PanelSlot shown={active === "notebook"}>
              <NotebookPanel fileId={fileId} visible={active === "notebook"} onOpenCount={onOpenNotes} />
            </PanelSlot>
            <PanelSlot shown={active === "review"}>
              <SynthesisPanel fileId={fileId} />
            </PanelSlot>
            <PanelSlot shown={active === "chat"}>
              <WorkspaceChatPanel fileId={fileId} visible={active === "chat"} onUnread={onChatUnread} />
            </PanelSlot>
          </div>
        </section>

        {/* Strip: always visible, with live counts */}
        <nav className="flex w-11 flex-col items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-sm backdrop-blur" aria-label="Tools">
          {TOOLS.map((t) => {
            const on = active === t.id;
            const badge =
              t.id === "scout" ? (counts.scout > 0 ? { n: counts.scout, tone: "bg-sky-600" } : null)
              : t.id === "check" ? (counts.check === null ? null : counts.check > 0 ? { n: counts.check, tone: "bg-red-600" } : { n: 0, tone: "bg-emerald-600" })
              : t.id === "notebook" ? (counts.notebook > 0 ? { n: counts.notebook, tone: "bg-violet-600" } : null)
              : t.id === "chat" ? (counts.chat > 0 ? { n: counts.chat, tone: "bg-blue-600" } : null)
              : null;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => choose(on ? null : t.id)}
                aria-pressed={on}
                aria-label={t.label}
                title={t.label}
                className={cn(
                  "group relative flex size-9 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on && "ring-2 ring-foreground/15",
                  press,
                )}
              >
                <RailTile tool={t.id} active={on} />
                {badge && (
                  <span
                    className={cn(
                      "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums text-white ring-2 ring-background",
                      badge.tone,
                    )}
                    aria-label={`${badge.n} ${t.id === "check" ? "to review" : t.id === "scout" ? "suggestions" : t.id === "chat" ? "new messages" : "open notes"}`}
                  >
                    {badge.n === 0 ? "✓" : badge.n}
                  </span>
                )}
              </button>
            );
          })}
          <span aria-hidden className="my-0.5 h-px w-6 bg-border" />
          <button
            type="button"
            onClick={() => setMapOpen(true)}
            aria-label="Evidence map"
            title="Evidence map: the draft's claims and the papers behind them"
            className={cn("group flex size-9 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", press)}
          >
            <RailTile tool="map" active={mapOpen} />
          </button>
        </nav>
      </div>

      <EvidenceMapSheet fileId={fileId} open={mapOpen} onOpenChange={setMapOpen} />
    </>
  );
}

/** Keeps a panel mounted while another is shown, so its state and background work survive. */
function PanelSlot({ shown, children }: { shown: boolean; children: React.ReactNode }) {
  return (
    <div hidden={!shown} className={cn(shown && "flex min-h-0 flex-1 flex-col")}>
      {children}
    </div>
  );
}
