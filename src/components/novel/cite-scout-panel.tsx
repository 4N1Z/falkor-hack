"use client";

import type { CiteScoutResult, CiteSuggestion } from "@/lib/agents/cite-scout";
import { citationContent } from "@/lib/citations";
import { useAppState } from "@/lib/providers/state-providers";
import { cn } from "@/lib/utils";
import { useCurrentEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { GHOST_STORAGE_KEY, GHOST_TOGGLE_EVENT, ghostEnabled } from "./ghost-writer";

const PAUSE_MS = 1500;
const STORAGE_KEY = "neura:cite-scout:on";
const press = "transition-transform duration-150 ease-out active:scale-[0.97]";
const enter = "animate-in fade-in-0 slide-in-from-bottom-1 duration-150 ease-out fill-mode-both motion-reduce:animate-none";

type Status = "idle" | "checking" | "done" | "error";

/** Text of the paragraph-level block around the cursor, and where it starts. */
function currentBlock(editor: Editor): { text: string; start: number } | null {
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.isTextblock) return { text: node.textContent, start: $from.start(d) };
  }
  return null;
}

/** Document position right after `sentence` inside the block starting at `start`. */
function sentenceEndPos(editor: Editor, start: number, sentence: string): number | null {
  const $start = editor.state.doc.resolve(start);
  const block = $start.parent;
  const offset = block.textContent.indexOf(sentence);
  if (offset < 0) return null;
  let target = offset + sentence.length;
  let pos: number | null = null;
  block.forEach((child, childOffset) => {
    if (pos !== null || !child.isText) return;
    const len = child.text?.length ?? 0;
    if (target <= len) pos = start + childOffset + target;
    else target -= len;
  });
  return pos;
}

/**
 * Cite Scout: as you write, suggests citations for the sentence you're on from every
 * collaborator's library, with the passage and citation chain behind each suggestion.
 * Nothing is inserted unless you choose "Cite". Lives in the research rail; it keeps
 * watching while another panel is shown, and reports its count for the rail badge.
 */
export function CiteScoutPanel({ fileId, visible, onCount }: { fileId: string; visible: boolean; onCount: (n: number) => void }) {
  const { editor } = useCurrentEditor();
  const { workspaceId } = useAppState();
  // Read once; the component renders nothing until the editor exists on the client, so no hydration mismatch
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<CiteScoutResult | null>(null);
  const [items, setItems] = useState<CiteSuggestion[]>([]);
  const blockStart = useRef(0);
  const lastText = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inflight = useRef<AbortController | null>(null);

  useEffect(() => onCount(enabled ? items.length : 0), [items, enabled, onCount]);

  const check = useCallback(async () => {
    if (!editor || !workspaceId) return;
    const block = currentBlock(editor);
    if (!block || block.text.trim().length < 40 || block.text === lastText.current) return;
    lastText.current = block.text;
    blockStart.current = block.start;
    inflight.current?.abort();
    const ac = new AbortController();
    inflight.current = ac;
    setStatus("checking");
    try {
      const res = await fetch("/api/agents/cite-scout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, fileId, paragraph: block.text }),
        signal: ac.signal,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Cite Scout failed");
      setResult(body);
      setItems(body.items ?? []);
      setStatus("done");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setStatus("error");
    }
  }, [editor, workspaceId, fileId]);

  // Re-check after a pause in typing, or when the cursor moves to another paragraph
  useEffect(() => {
    if (!editor || !enabled) return;
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(check, PAUSE_MS);
    };
    editor.on("update", schedule);
    editor.on("selectionUpdate", schedule);
    return () => {
      editor.off("update", schedule);
      editor.off("selectionUpdate", schedule);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [editor, enabled, check]);

  const decide = (s: CiteSuggestion, decision: "accepted" | "rejected") =>
    fetch("/api/agents/cite-scout", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, fileId, sentence: result?.sentence, paperId: s.paperId, decision }),
    }).catch(() => {});

  const cite = (s: CiteSuggestion) => {
    if (!editor || !result?.sentence) return;
    const at = sentenceEndPos(editor, blockStart.current, result.sentence);
    if (at === null) {
      toast.error("That sentence changed. Cite Scout will look again.");
      lastText.current = "";
      return;
    }
    editor.chain().focus().insertContentAt(at, citationContent(s.label, s.href, true)).run();
    decide(s, "accepted");
    setItems((list) => list.filter((x) => x.paperId !== s.paperId));
    lastText.current = currentBlock(editor)?.text ?? ""; // don't immediately re-check our own insert
    toast.success(`Cited ${s.label}`, { description: s.fromMyLibrary ? undefined : `From ${s.owners.join(" & ")}'s library` });
  };

  const dismiss = (s: CiteSuggestion) => {
    decide(s, "rejected");
    setItems((list) => list.filter((x) => x.paperId !== s.paperId));
  };

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {}
    if (!next) {
      setItems([]);
      setStatus("idle");
    }
  };

  if (!editor || !visible) return null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          {status === "checking" ? (
            <>
              <Loader2 className="size-3 animate-spin" /> Checking the team library…
            </>
          ) : result && status === "done" ? (
            <span className="tabular-nums">
              {result.source === "jev" ? "Scored by Neura" : "Scored by fallback model"} · {(result.ms / 1000).toFixed(1)}s
            </span>
          ) : (
            "Watches the sentence you're on"
          )}
        </span>
        <span className="flex items-center gap-0.5">
          <Switch on={enabled} onClick={toggle} title="Citation suggestions while you write">
            Scout
          </Switch>
          <GhostToggle />
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {!enabled ? (
          <p className="text-xs text-muted-foreground">Turned off. Suggestions won&apos;t appear while you write.</p>
        ) : status === "idle" ? (
          <p className="text-xs text-muted-foreground">Keep writing. After a pause, Cite Scout checks your sentence against everyone&apos;s papers.</p>
        ) : status === "checking" && !items.length ? (
          <ul className="space-y-2" aria-busy="true">
            {[0, 1].map((i) => (
              <li key={i} className="rounded-md border p-2.5">
                <div className="h-3.5 w-3/4 rounded bg-muted" />
                <div className="mt-1.5 h-3 w-1/2 rounded bg-muted" />
              </li>
            ))}
          </ul>
        ) : status === "error" ? (
          <p className="text-xs text-muted-foreground">Couldn&apos;t check right now. It will try again as you write.</p>
        ) : result?.outcome === "SKIPPED" ? (
          <p className="text-xs text-muted-foreground">This sentence doesn&apos;t look like it needs a citation.</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {result?.outcome === "NOT_IN_GRAPH"
              ? "Nothing in your team's library supports this sentence yet. Try /search to look wider."
              : "All suggestions handled."}
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground line-clamp-2" title={result?.sentence}>
              For “{result?.sentence}”
            </p>
            {result?.deadEnd && <DeadEndNote d={result.deadEnd} />}
            {items.map((s, i) => (
              <SuggestionCard key={s.paperId} s={s} index={i} onCite={() => cite(s)} onDismiss={() => dismiss(s)} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function Switch({ on, onClick, title, children }: { on: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded px-1.5 text-[11px] transition-colors duration-150",
        on ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:bg-muted",
        press,
      )}
    >
      <span className={cn("size-1.5 rounded-full", on ? "bg-emerald-500" : "bg-muted-foreground/40")} aria-hidden />
      {children}
    </button>
  );
}

/** Ghost text (next-words suggestions, Tab to accept) on/off. */
function GhostToggle() {
  const [on, setOn] = useState(() => ghostEnabled()); // client-only component; ghostEnabled() guards localStorage
  return (
    <Switch
      on={on}
      title="Ghost text: grey next-word suggestions, Tab to accept"
      onClick={() => {
        const next = !on;
        setOn(next);
        try {
          localStorage.setItem(GHOST_STORAGE_KEY, next ? "on" : "off");
        } catch {}
        window.dispatchEvent(new Event(GHOST_TOGGLE_EVENT));
      }}
    >
      Ghost
    </Switch>
  );
}

/** Historian warning: the sentence resembles a hypothesis the team already dropped. */
function DeadEndNote({ d }: { d: NonNullable<CiteScoutResult["deadEnd"]> }) {
  const when = new Date(d.validTo ?? d.validFrom).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <span className="font-medium">Heads up:</span> {d.byName} dropped a similar hypothesis on {when}
      {d.reason ? ` because ${d.reason.charAt(0).toLowerCase()}${d.reason.slice(1)}` : "."}
    </p>
  );
}

function SuggestionCard({ s, index, onCite, onDismiss }: { s: CiteSuggestion; index: number; onCite: () => void; onDismiss: () => void }) {
  return (
    <div className={cn("rounded-md border p-2.5", enter)} style={{ animationDelay: `${index * 30}ms` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug line-clamp-2" title={s.title}>
            {s.title}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {s.label} ·{" "}
            <span className={s.fromMyLibrary ? undefined : "font-medium text-sky-700 dark:text-sky-300"}>
              {s.fromMyLibrary ? "your library" : `${s.owners.join(" & ")}'s library`}
            </span>{" "}
            · <span className="tabular-nums">{Math.round(s.relevance * 100)}% match</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss suggestion"
          className={cn("shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground", press)}
        >
          <X className="size-3.5" />
        </button>
      </div>
      {s.passage && <p className="mt-1.5 text-xs italic text-muted-foreground line-clamp-3">“{s.passage}”</p>}
      {s.path && s.path.nodes.length > 1 && (
        <p className="mt-1.5 text-[11px] text-muted-foreground line-clamp-2" title={s.reason}>
          {s.path.nodes.map((n, i) => (
            <span key={n.id}>
              {i > 0 && <span className="mx-1 text-sky-700 dark:text-sky-300">{s.path!.rels[i - 1] === "CITES→" ? "cites →" : "← cited by"}</span>}
              <span className={i === s.path!.nodes.length - 1 ? "font-medium text-foreground" : undefined}>
                {n.label.length > 36 ? `${n.label.slice(0, 36)}…` : n.label}
              </span>
            </span>
          ))}
        </p>
      )}
      <button
        type="button"
        onClick={onCite}
        className={cn("mt-2 w-full rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90", press)}
      >
        Cite {s.label}
      </button>
    </div>
  );
}
