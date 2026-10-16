"use client";

import { Button } from "@/components/ui/button";
import type { QueueItem, QueueKind } from "@/lib/adam/review";
import type { ProjectStatus } from "@/lib/adam/status";
import { refreshAdam } from "@/lib/hooks/use-adam";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, ExternalLink, GitFork, Loader2, RotateCw, Scale, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";

const queueKey = (workspaceId: string, projectId: string) => `/api/adam/${projectId}/queue?workspaceId=${workspaceId}`;
const fetcher = async (url: string) => {
  const r = await fetch(url);
  const b = await r.json();
  if (!r.ok) throw new Error(b.error ?? "Couldn't load the queue");
  return b as { items: QueueItem[] };
};

const KIND: Record<QueueKind, { label: string; tone: string; help: string; icon: React.ReactNode }> = {
  conflict: { label: "Conflict", tone: "bg-rose-50 text-rose-700 ring-rose-600/20", help: "Two extractors read the same passage differently", icon: <GitFork className="size-3" /> },
  unsourced: { label: "Unsourced", tone: "bg-amber-50 text-amber-800 ring-amber-600/20", help: "The quote was not found in the paper", icon: <AlertTriangle className="size-3" /> },
  load_bearing: { label: "Load-bearing", tone: "bg-sky-50 text-sky-700 ring-sky-600/20", help: "Many other nodes depend on this; an error here propagates", icon: <Scale className="size-3" /> },
  low_confidence: { label: "Low confidence", tone: "bg-slate-100 text-slate-700 ring-slate-500/20", help: "The source is ambiguous, abstract-only, or the passage is weak", icon: <AlertTriangle className="size-3" /> },
};

const REASON: Record<string, string> = {
  quote_not_found: "The quoted passage is not in the paper's text",
  with_caveats: "The passage states this with caveats",
  weaker_version: "The passage states a weaker version",
  abstract_only: "Only the abstract was available",
  extractors_disagree: "The two readings of this passage differ",
};

/** Mark the quote inside its passage, when it is there. */
function Marked({ text, quote }: { text: string; quote: string }) {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");
  const t = norm(text);
  const q = norm(quote);
  const i = q.length >= 12 ? t.indexOf(q) : -1;
  if (i < 0) return <p className="whitespace-pre-wrap leading-relaxed">{text}</p>;
  // Map the normalised index back approximately by searching the original with a loose regex
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

/** The exception queue: only what the Verifier flagged, each beside its source, one keystroke per decision. */
export function QueueTab({ workspaceId, status }: { workspaceId: string; status: ProjectStatus }) {
  const projectId = status.project.id;
  const { data, error } = useSWR(queueKey(workspaceId, projectId), fetcher, { refreshInterval: status.project.status === "running" ? 5000 : 0, keepPreviousData: true });
  const [kind, setKind] = useState<QueueKind | "all">("all");
  const [paper, setPaper] = useState<string | "all">("all");
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");

  const items = useMemo(() => (data?.items ?? []).filter((it) => (kind === "all" || it.kind === kind) && (paper === "all" || it.paperId === paper)), [data, kind, paper]);
  const papers = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of data?.items ?? []) if (it.paperId) m.set(it.paperId, it.paperTitle);
    return [...m.entries()];
  }, [data]);
  const counts = useMemo(() => {
    const c: Partial<Record<QueueKind, number>> = {};
    for (const it of data?.items ?? []) c[it.kind] = (c[it.kind] ?? 0) + 1;
    return c;
  }, [data]);
  useEffect(() => setCursor((c) => Math.min(c, Math.max(0, items.length - 1))), [items.length]);

  const act = useCallback(
    async (it: QueueItem, decision: "approve" | "correct" | "reject" | "send_back", extra: { text?: string; note?: string } = {}) => {
      setBusy(true);
      try {
        const r = await fetch(`/api/adam/${projectId}/queue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, nodeId: it.id, decision, ...extra }),
        });
        if (!r.ok) throw new Error((await r.json()).error ?? "Decision failed");
        setCorrecting(null);
        setNote("");
        await Promise.all([mutate(queueKey(workspaceId, projectId)), refreshAdam(workspaceId, projectId)]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Decision failed");
      } finally {
        setBusy(false);
      }
    },
    [projectId, workspaceId],
  );

  const unmerge = async (it: QueueItem, alias: string) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/adam/${projectId}/queue`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, unmerge: { methodId: it.id, alias } }) });
      if (!r.ok) throw new Error((await r.json()).error ?? "Unmerge failed");
      toast.success(`"${alias}" is its own method again`);
      await mutate(queueKey(workspaceId, projectId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unmerge failed");
    } finally {
      setBusy(false);
    }
  };

  // Keyboard: j/k move, a approve, c correct, r reject, s send back
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy || correcting || (e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      const it = items[cursor];
      if (e.key === "j") setCursor((c) => Math.min(c + 1, items.length - 1));
      else if (e.key === "k") setCursor((c) => Math.max(c - 1, 0));
      else if (it && e.key === "a") act(it, "approve");
      else if (it && e.key === "r") act(it, "reject");
      else if (it && e.key === "c") {
        setCorrecting(it.id);
        setDraft(it.text);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, cursor, busy, correcting, act]);

  if (error) return <p className="text-sm text-red-700">{error.message}</p>;
  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
        <Loader2 className="size-4 animate-spin" /> Loading the queue…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-2 text-sm">
        <Chip active={kind === "all"} onClick={() => setKind("all")}>
          All <span className="text-muted-foreground tabular-nums">{data.items.length}</span>
        </Chip>
        {(Object.keys(KIND) as QueueKind[]).map((k) => (
          <Chip key={k} active={kind === k} onClick={() => setKind(k)} title={KIND[k].help}>
            {KIND[k].label} <span className="text-muted-foreground tabular-nums">{counts[k] ?? 0}</span>
          </Chip>
        ))}
        <select value={paper} onChange={(e) => setPaper(e.target.value)} className="ml-auto rounded-md border bg-white px-2 py-1 text-xs max-w-[22rem]">
          <option value="all">All papers</option>
          {papers.map(([id, title]) => (
            <option key={id} value={id}>{title.slice(0, 80)}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">j/k move · a approve · c correct · r reject</span>
      </header>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-10 text-center text-sm text-muted-foreground">
          {data.items.length === 0 ? "Nothing to review. Everything the agents wrote is either verified against its source or still being checked." : "Nothing matches these filters."}
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((it, i) => (
            <li key={it.id} onClick={() => setCursor(i)}>
              <QueueCard
                item={it}
                active={i === cursor}
                busy={busy}
                correcting={correcting === it.id}
                draft={draft}
                note={note}
                onDraft={setDraft}
                onNote={setNote}
                onStartCorrect={() => {
                  setCorrecting(it.id);
                  setDraft(it.text);
                }}
                onCancelCorrect={() => setCorrecting(null)}
                onAct={(d, extra) => act(it, d, extra)}
                onUnmerge={(alias) => unmerge(it, alias)}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Chip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button onClick={onClick} title={title} className={cn("rounded-full px-2.5 py-0.5 text-xs transition-colors", active ? "bg-foreground text-background" : "hover:bg-accent")}>
      {children}
    </button>
  );
}

function QueueCard({
  item: it,
  active,
  busy,
  correcting,
  draft,
  note,
  onDraft,
  onNote,
  onStartCorrect,
  onCancelCorrect,
  onAct,
  onUnmerge,
}: {
  item: QueueItem;
  active: boolean;
  busy: boolean;
  correcting: boolean;
  draft: string;
  note: string;
  onDraft: (s: string) => void;
  onNote: (s: string) => void;
  onStartCorrect: () => void;
  onCancelCorrect: () => void;
  onAct: (d: "approve" | "correct" | "reject" | "send_back", extra?: { text?: string; note?: string }) => void;
  onUnmerge: (alias: string) => void;
}) {
  const k = KIND[it.kind];
  return (
    <article className={cn("rounded-lg border bg-white transition-shadow", active && "ring-2 ring-primary/30 shadow-sm")}>
      <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
        <div className="p-4 flex flex-col gap-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 ring-inset", k.tone)}>
              {k.icon} {k.label}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5">{it.label}</span>
            {it.speculative && <span className="rounded-full bg-violet-50 text-violet-700 px-2 py-0.5">speculative</span>}
            {it.loadBearing && <span className="text-sky-700">{it.dependents} depend on this</span>}
            <span className="text-muted-foreground ml-auto tabular-nums">confidence {Math.round(it.confidence * 100)}%</span>
          </div>
          {correcting ? (
            <textarea className="w-full rounded-md border px-3 py-2 text-sm leading-relaxed min-h-[6rem] focus:outline-none focus:ring-2 focus:ring-primary/30" value={draft} onChange={(e) => onDraft(e.target.value)} autoFocus />
          ) : (
            <p className="text-sm leading-relaxed">{it.text}</p>
          )}
          {it.reason && <p className="text-xs text-muted-foreground">{REASON[it.reason.split(":")[0]] ?? it.reason}</p>}
          {it.partner && (
            <div className="rounded-md border border-rose-100 bg-rose-50/50 p-2 text-sm">
              <p className="text-[11px] uppercase tracking-wide text-rose-700 mb-1">The other extractor read it as</p>
              <p className="leading-relaxed">{it.partner.text}</p>
              <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" disabled={busy} onClick={() => onAct("approve", { note: `prefer:${it.partner!.id}` })}>
                Keep this one instead
              </Button>
            </div>
          )}
          {it.aliases.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Merged names:{" "}
              {it.aliases.map((a) => (
                <button key={a} className="underline decoration-dotted mr-2 hover:text-foreground" onClick={() => onUnmerge(a)} disabled={busy} title="Split this name into its own node">
                  {a}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="p-4 text-sm min-w-0 bg-muted/20">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-2">
            <span className="truncate" title={it.paperTitle}>{it.paperTitle || "No paper"}</span>
            {it.year && <span>({it.year})</span>}
            {(it.chunkPage || it.page) > 0 && <span>· p.{it.chunkPage || it.page}</span>}
            {it.chunkSection && <span>· {it.chunkSection}</span>}
            {it.paperId && (
              <a href={`/dashboard/graph?paperId=${it.paperId}`} className="ml-auto hover:text-foreground" title="Open in the research graph" onClick={(e) => e.stopPropagation()}>
                <ExternalLink className="size-3.5" />
              </a>
            )}
          </p>
          {it.chunkText ? (
            <div className="max-h-56 overflow-y-auto text-[13px] text-slate-700">
              <Marked text={it.chunkText} quote={it.quote} />
            </div>
          ) : (
            <p className="text-muted-foreground italic">No passage available for this paper.</p>
          )}
          {it.kind === "unsourced" && it.quote && (
            <p className="mt-2 text-xs text-amber-800">
              Quoted: <span className="italic">“{it.quote}”</span>
            </p>
          )}
        </div>
      </div>
      <footer className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
        {correcting ? (
          <>
            <Button size="sm" disabled={busy || draft.trim().length < 3} onClick={() => onAct("correct", { text: draft })}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              <span className="ml-1.5">Save correction</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancelCorrect}>Cancel</Button>
          </>
        ) : (
          <>
            <Button size="sm" disabled={busy} onClick={() => onAct("approve")}>
              <Check className="size-3.5" />
              <span className="ml-1.5">Approve</span>
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={onStartCorrect}>Correct</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onAct("reject")}>
              <X className="size-3.5" />
              <span className="ml-1.5">Reject</span>
            </Button>
            {it.paperId && (
              <div className="ml-auto flex items-center gap-1">
                <input value={note} onChange={(e) => onNote(e.target.value)} placeholder="Note for the Extractor…" className="rounded-md border px-2 py-1 text-xs w-56" onClick={(e) => e.stopPropagation()} />
                <Button size="sm" variant="ghost" disabled={busy || note.trim().length < 3} onClick={() => onAct("send_back", { note })} title="Re-extract this paper with your note">
                  <RotateCw className="size-3.5" />
                  <span className="ml-1.5">Send back</span>
                </Button>
              </div>
            )}
          </>
        )}
      </footer>
    </article>
  );
}
