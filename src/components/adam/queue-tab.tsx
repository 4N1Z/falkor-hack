"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { QueueItem, QueueKind, QueuePage } from "@/lib/adam/review";
import type { ProjectStatus } from "@/lib/adam/status";
import { refreshAdam } from "@/lib/hooks/use-adam";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, CheckSquare, ExternalLink, GitFork, Loader2, RotateCw, Scale, Sparkles, Square, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";

const PAGE = 40;
const FLUSH_MS = 350;

type QueueResponse = QueuePage & { autoReview: { status: string; progress: { total?: number; done?: number; approve?: number; reject?: number; unsure?: number } } | null };
type SuggestionFilter = "all" | "approve" | "reject" | "none";

const fetcher = async (url: string) => {
  const r = await fetch(url);
  const b = await r.json();
  if (!r.ok) throw new Error(b.error ?? "Couldn't load the queue");
  return b as QueueResponse;
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

const AUTO_REASON: Record<string, string> = {
  "auto_review:exact": "the passage states exactly this",
  "auto_review:with_caveats": "the passage states this with caveats",
  "auto_review:not_in_source": "the passage does not state this",
  "auto_review:weaker_version": "the passage states only a weaker version",
  "auto_review:unsure": "could not tell",
  "auto_review:uncorroborated": "nothing else in the graph backs this load-bearing item",
  "auto_review:conflict_needs_you": "a person picks between the two readings",
  "auto_review:unsourced_needs_you": "unsourced items are never approved automatically",
};

type Pending = { nodeId: string; decision: "approve" | "reject" };

/**
 * The exception queue. Server-paginated so a 600-item queue stays light; every decision is
 * optimistic (the card leaves at once, the request goes out in a batched outbox a moment
 * later), so approving 500 items is 500 keystrokes, not 500 waits. Multi-select approves or
 * rejects a whole selection in one request. Auto-review is the optional JEV + graph pass.
 */
export function QueueTab({ workspaceId, status }: { workspaceId: string; status: ProjectStatus }) {
  const projectId = status.project.id;
  const [kind, setKind] = useState<QueueKind | "all">("all");
  const [paper, setPaper] = useState<string>("all");
  const [suggestion, setSuggestion] = useState<SuggestionFilter>("all");
  const [offset, setOffset] = useState(0);
  const key = `/api/adam/${projectId}/queue?workspaceId=${workspaceId}&kind=${kind}&paperId=${paper}&suggestion=${suggestion}&offset=${offset}&limit=${PAGE}`;
  const { data, error, isValidating } = useSWR(key, fetcher, { keepPreviousData: true, refreshInterval: (d) => (d?.autoReview ? 2500 : status.project.status === "running" ? 8000 : 0) });

  // Optimistic state: items decided locally vanish immediately and stay hidden until the server agrees
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(0);
  const outbox = useRef<Pending[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const items = useMemo(() => (data?.items ?? []).filter((it) => !hidden.has(it.id)), [data, hidden]);
  const total = Math.max(0, (data?.total ?? 0) - hidden.size);
  useEffect(() => setCursor((c) => Math.min(c, Math.max(0, items.length - 1))), [items.length]);
  useEffect(() => {
    setOffset(0);
    setSelected(new Set());
  }, [kind, paper, suggestion]);

  const refresh = useCallback(async () => {
    await Promise.all([mutate(key), refreshAdam(workspaceId, projectId)]);
    setHidden(new Set());
  }, [key, workspaceId, projectId]);

  /** Send what is in the outbox as one request; on failure the cards come back. */
  const flush = useCallback(async () => {
    const batch = outbox.current.splice(0, 200);
    if (!batch.length) return;
    setSyncing((n) => n + batch.length);
    try {
      const r = await fetch(`/api/adam/${projectId}/queue`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, decisions: batch }) });
      if (!r.ok) throw new Error((await r.json()).error ?? "Decision failed");
      if (!outbox.current.length) await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Decision failed; the items are back in the queue");
      setHidden((h) => {
        const n = new Set(h);
        for (const b of batch) n.delete(b.nodeId);
        return n;
      });
    } finally {
      setSyncing((n) => Math.max(0, n - batch.length));
    }
  }, [projectId, workspaceId, refresh]);

  const queueDecision = useCallback(
    (ids: string[], decision: "approve" | "reject") => {
      setHidden((h) => new Set([...h, ...ids]));
      setSelected((s) => {
        const n = new Set(s);
        ids.forEach((id) => n.delete(id));
        return n;
      });
      outbox.current.push(...ids.map((nodeId) => ({ nodeId, decision })));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, FLUSH_MS);
    },
    [flush],
  );
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (outbox.current.length) void flush();
  }, [flush]);

  /** Corrections and send-backs are single requests (they carry text). */
  const act = useCallback(
    async (it: QueueItem, decision: "correct" | "send_back", extra: { text?: string; note?: string }) => {
      setBusy(true);
      try {
        const r = await fetch(`/api/adam/${projectId}/queue`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, nodeId: it.id, decision, ...extra }) });
        if (!r.ok) throw new Error((await r.json()).error ?? "Decision failed");
        setCorrecting(null);
        setNote("");
        setHidden((h) => new Set([...h, it.id]));
        await refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Decision failed");
      } finally {
        setBusy(false);
      }
    },
    [projectId, workspaceId, refresh],
  );

  const unmerge = async (it: QueueItem, alias: string) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/adam/${projectId}/queue`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, unmerge: { methodId: it.id, alias } }) });
      if (!r.ok) throw new Error((await r.json()).error ?? "Unmerge failed");
      toast.success(`"${alias}" is its own method again`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unmerge failed");
    } finally {
      setBusy(false);
    }
  };

  const autoReview = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/adam/${projectId}/queue`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, autoReview: true, kinds: kind === "all" ? [] : [kind] }) });
      if (!r.ok) throw new Error((await r.json()).error ?? "Couldn't start auto-review");
      toast("Auto-review started", { description: "It reviews every item and proposes what to approve and reject; you apply the proposal in one click." });
      await mutate(key);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start auto-review");
    } finally {
      setBusy(false);
    }
  };

  /** One click applies every open proposal of one kind as the researcher's decision. */
  const applyAll = async (which: "approve" | "reject") => {
    setBusy(true);
    try {
      const r = await fetch(`/api/adam/${projectId}/queue`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, applySuggestions: which }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Couldn't apply");
      toast.success(`${b.applied} item${b.applied === 1 ? "" : "s"} ${which === "approve" ? "approved" : "rejected"}`);
      setSelected(new Set());
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't apply");
    } finally {
      setBusy(false);
    }
  };

  // Keyboard: j/k move, x select, a approve, r reject, c correct; with a selection, a/r act on it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (busy || correcting || tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey) return;
      const it = items[cursor];
      const targets = selected.size ? [...selected] : it ? [it.id] : [];
      if (e.key === "j") setCursor((c) => Math.min(c + 1, items.length - 1));
      else if (e.key === "k") setCursor((c) => Math.max(c - 1, 0));
      else if (it && e.key === "x") setSelected((s) => {
        const n = new Set(s);
        n.has(it.id) ? n.delete(it.id) : n.add(it.id);
        return n;
      });
      else if (targets.length && e.key === "a") queueDecision(targets, "approve");
      else if (targets.length && e.key === "r") queueDecision(targets, "reject");
      else if (it && e.key === "c") {
        setCorrecting(it.id);
        setDraft(it.text);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, cursor, busy, correcting, selected, queueDecision]);

  const allVisibleSelected = items.length > 0 && items.every((it) => selected.has(it.id));
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(items.map((it) => it.id)));

  if (error) return <p className="text-sm text-red-700">{error.message}</p>;
  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
        <Loader2 className="size-4 animate-spin" /> Loading the queue…
      </div>
    );
  }
  const openTotal = Object.values(data.counts).reduce((s, n) => s + (n ?? 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-2 text-sm">
        <Chip active={kind === "all"} onClick={() => setKind("all")}>
          Open <span className="text-muted-foreground tabular-nums">{openTotal}</span>
        </Chip>
        {(Object.keys(KIND) as QueueKind[]).map((k) => (
          <Chip key={k} active={kind === k} onClick={() => setKind(k)} title={KIND[k].help}>
            {KIND[k].label} <span className="text-muted-foreground tabular-nums">{data.counts[k] ?? 0}</span>
          </Chip>
        ))}
        {data.suggestions.reviewed > 0 && (
          <span className="flex items-center gap-1 border-l pl-2 ml-1">
            <Chip active={suggestion === "approve"} onClick={() => setSuggestion(suggestion === "approve" ? "all" : "approve")} title="Items auto-review proposes to approve">
              <Sparkles className="inline size-3 mr-0.5 text-emerald-600" />to approve <span className="text-muted-foreground tabular-nums">{data.suggestions.approve}</span>
            </Chip>
            <Chip active={suggestion === "reject"} onClick={() => setSuggestion(suggestion === "reject" ? "all" : "reject")} title="Items auto-review proposes to reject">
              to reject <span className="text-muted-foreground tabular-nums">{data.suggestions.reject}</span>
            </Chip>
            <Chip active={suggestion === "none"} onClick={() => setSuggestion(suggestion === "none" ? "all" : "none")} title="Items auto-review could not call">
              unsure <span className="text-muted-foreground tabular-nums">{data.suggestions.none + (openTotal - data.suggestions.reviewed)}</span>
            </Chip>
          </span>
        )}
        <select value={paper} onChange={(e) => setPaper(e.target.value)} className="ml-auto rounded-md border bg-white px-2 py-1 text-xs max-w-[22rem]">
          <option value="all">All papers</option>
          {data.papers.map((p) => (
            <option key={p.paperId} value={p.paperId}>{p.title.slice(0, 70)} ({p.n})</option>
          ))}
        </select>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={busy || !!data.autoReview || openTotal === 0}>
              {data.autoReview ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              <span className="ml-1.5">Auto-review{kind !== "all" ? ` ${KIND[kind].label.toLowerCase()}` : ""}</span>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Let Neura review the queue and propose decisions?</AlertDialogTitle>
              <AlertDialogDescription>
                Every open item{kind !== "all" ? ` of kind "${KIND[kind].label}"` : ""} is judged against its passage with a typed question, and the graph is read for corroboration (evidence, dependent verified claims).
                Nothing is decided by it: you get a proposal, approve these and reject those, and apply it in one click. Items it cannot call, conflicts, and unsourced items stay for you.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Not now</AlertDialogCancel>
              <AlertDialogAction onClick={autoReview}>Run auto-review</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </header>

      {data.autoReview && (
        <div className="rounded-md border border-sky-200 bg-sky-50/60 px-3 py-2 text-sm text-sky-900 flex items-center gap-2">
          <Loader2 className="size-3.5 animate-spin" />
          Auto-review {data.autoReview.status}
          {typeof data.autoReview.progress.done === "number" && typeof data.autoReview.progress.total === "number" && (
            <span className="tabular-nums">· {data.autoReview.progress.done} of {data.autoReview.progress.total} reviewed · would approve {data.autoReview.progress.approve ?? 0} · reject {data.autoReview.progress.reject ?? 0} · unsure {data.autoReview.progress.unsure ?? 0}</span>
          )}
        </div>
      )}

      {!data.autoReview && (data.suggestions.approve > 0 || data.suggestions.reject > 0) && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-900 flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5"><Sparkles className="size-3.5" /> Neura suggests approving <b className="tabular-nums">{data.suggestions.approve}</b> and rejecting <b className="tabular-nums">{data.suggestions.reject}</b>{data.suggestions.none > 0 ? <> · <span className="tabular-nums">{data.suggestions.none}</span> it could not call</> : null}.</span>
          <span className="ml-auto flex items-center gap-2">
            {data.suggestions.approve > 0 && (
              <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={() => applyAll("approve")}>
                <Check className="size-3" /><span className="ml-1">Approve all {data.suggestions.approve}</span>
              </Button>
            )}
            {data.suggestions.reject > 0 && (
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => applyAll("reject")}>
                <X className="size-3" /><span className="ml-1">Reject all {data.suggestions.reject}</span>
              </Button>
            )}
            <button className="text-xs underline decoration-dotted" onClick={() => setSuggestion("approve")}>review the proposal first</button>
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <button onClick={toggleAll} className="inline-flex items-center gap-1 hover:text-foreground" disabled={items.length === 0}>
          {allVisibleSelected ? <CheckSquare className="size-3.5" /> : <Square className="size-3.5" />} {allVisibleSelected ? "Clear selection" : "Select all on this page"}
        </button>
        {selected.size > 0 && (
          <>
            <span className="font-medium text-foreground tabular-nums">{selected.size} selected</span>
            <Button size="sm" className="h-7 text-xs" onClick={() => queueDecision([...selected], "approve")}>
              <Check className="size-3" /><span className="ml-1">Approve {selected.size}</span>
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => queueDecision([...selected], "reject")}>
              <X className="size-3" /><span className="ml-1">Reject {selected.size}</span>
            </Button>
          </>
        )}
        <span className="ml-auto tabular-nums">
          {total ? `${offset + 1}–${Math.min(offset + PAGE, offset + items.length)} of ${total}` : "0"} · j/k move · x select · a approve · r reject · c correct
          {syncing > 0 && <span className="ml-2 inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> saving {syncing}</span>}
          {isValidating && !syncing && <Loader2 className="ml-2 inline size-3 animate-spin opacity-50" />}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-10 text-center text-sm text-muted-foreground">
          {openTotal === 0
            ? "Nothing to review. Everything the agents wrote is either verified against its source or still being checked."
            : total > 0 ? "This page is done; load the next one." : "Nothing matches these filters."}
          {total > 0 && (
            <div className="mt-3"><Button size="sm" variant="outline" onClick={() => refresh()}>Load next</Button></div>
          )}
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((it, i) => (
            <li key={it.id} onClick={() => setCursor(i)}>
              <QueueCard
                item={it}
                active={i === cursor}
                selected={selected.has(it.id)}
                onSelect={(v) => setSelected((s) => {
                  const n = new Set(s);
                  v ? n.add(it.id) : n.delete(it.id);
                  return n;
                })}
                busy={busy}
                correcting={correcting === it.id}
                draft={draft}
                note={note}
                onDraft={setDraft}
                onNote={setNote}
                onStartCorrect={() => { setCorrecting(it.id); setDraft(it.text); }}
                onCancelCorrect={() => setCorrecting(null)}
                onApprove={() => queueDecision([it.id], "approve")}
                onReject={() => queueDecision([it.id], "reject")}
                onKeepPartner={() => it.partner && queueDecision([it.partner.id], "approve")}
                onCorrect={(text) => act(it, "correct", { text })}
                onSendBack={(n) => act(it, "send_back", { note: n })}
                onUnmerge={(alias) => unmerge(it, alias)}
              />
            </li>
          ))}
        </ol>
      )}

      {(offset > 0 || offset + PAGE < total) && (
        <footer className="flex items-center justify-between text-sm">
          <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE))}>Previous</Button>
          <span className="text-xs text-muted-foreground tabular-nums">page {Math.floor(offset / PAGE) + 1} of {Math.max(1, Math.ceil(total / PAGE))}</span>
          <Button size="sm" variant="outline" disabled={offset + PAGE >= total} onClick={() => setOffset((o) => o + PAGE)}>Next</Button>
        </footer>
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

/** Mark the quote inside its passage when it is there. */
function Marked({ text, quote }: { text: string; quote: string }) {
  if (!quote || quote.length < 12) return <p className="whitespace-pre-wrap leading-relaxed">{text}</p>;
  const re = new RegExp(quote.trim().split(/\s+/).slice(0, 40).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"), "i");
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

function QueueCard({ item: it, active, selected, onSelect, busy, correcting, draft, note, onDraft, onNote, onStartCorrect, onCancelCorrect, onApprove, onReject, onKeepPartner, onCorrect, onSendBack, onUnmerge }: {
  item: QueueItem;
  active: boolean;
  selected: boolean;
  onSelect: (v: boolean) => void;
  busy: boolean;
  correcting: boolean;
  draft: string;
  note: string;
  onDraft: (s: string) => void;
  onNote: (s: string) => void;
  onStartCorrect: () => void;
  onCancelCorrect: () => void;
  onApprove: () => void;
  onReject: () => void;
  onKeepPartner: () => void;
  onCorrect: (text: string) => void;
  onSendBack: (note: string) => void;
  onUnmerge: (alias: string) => void;
}) {
  const k = KIND[it.kind];
  return (
    <article className={cn("rounded-lg border bg-white transition-shadow", active && "ring-2 ring-primary/30 shadow-sm", selected && "border-primary/50")}>
      <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
        <div className="p-4 flex flex-col gap-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input type="checkbox" className="size-3.5" checked={selected} onChange={(e) => onSelect(e.target.checked)} onClick={(e) => e.stopPropagation()} aria-label="Select" />
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 ring-inset", k.tone)}>{k.icon} {k.label}</span>
            {it.autoReason && (
              <span
                className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 ring-inset", it.autoSuggestion === "approve" ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : it.autoSuggestion === "reject" ? "bg-rose-50 text-rose-700 ring-rose-600/20" : "bg-slate-50 text-slate-500 ring-slate-300/40")}
                title={`Auto-review: ${AUTO_REASON[it.autoReason] ?? it.autoReason}${it.autoConfidence ? ` (${Math.round(it.autoConfidence * 100)}%)` : ""}`}
              >
                <Sparkles className="size-3" /> {it.autoSuggestion === "approve" ? "suggests approve" : it.autoSuggestion === "reject" ? "suggests reject" : "unsure"}
              </span>
            )}
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
          {it.reason && <p className="text-xs text-muted-foreground">{REASON[it.reason] ?? REASON[it.reason.split(":")[0]] ?? it.reason}</p>}
          {it.partner && (
            <div className="rounded-md border border-rose-100 bg-rose-50/50 p-2 text-sm flex flex-col gap-2">
              <p className="text-[11px] uppercase tracking-wide text-rose-700">Two readings of the same passage</p>
              <ConflictReading label={`Reading ${it.slot.toUpperCase() || "A"}`} text={it.text} quote={it.quote} paperTitle={it.paperTitle} year={it.year} page={it.chunkPage || it.page} section={it.chunkSection || it.section} confidence={it.confidence} current />
              <ConflictReading label={`Reading ${it.partner.slot.toUpperCase() || "B"}`} text={it.partner.text} quote={it.partner.quote} paperTitle={it.partner.paperTitle} year={it.partner.year} page={it.partner.page} section={it.partner.section} confidence={it.partner.confidence} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={(e) => { e.stopPropagation(); onApprove(); }}>Keep reading {it.slot.toUpperCase() || "A"}</Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={(e) => { e.stopPropagation(); onKeepPartner(); }}>Keep reading {it.partner.slot.toUpperCase() || "B"}</Button>
                <span className="text-[11px] text-muted-foreground self-center">Keeping one retracts the other. Correct rewrites reading {it.slot.toUpperCase() || "A"} in your words.</span>
              </div>
            </div>
          )}
          {it.aliases.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Merged names:{" "}
              {it.aliases.map((a) => (
                <button key={a} className="underline decoration-dotted mr-2 hover:text-foreground" onClick={(e) => { e.stopPropagation(); onUnmerge(a); }} disabled={busy} title="Split this name into its own node">{a}</button>
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
              <a href={`/dashboard/graph?paperId=${it.paperId}`} className="ml-auto hover:text-foreground" title="Open in the research graph" onClick={(e) => e.stopPropagation()}><ExternalLink className="size-3.5" /></a>
            )}
          </p>
          {it.chunkText ? (
            <div className="max-h-56 overflow-y-auto text-[13px] text-slate-700"><Marked text={it.chunkText} quote={it.quote} /></div>
          ) : (
            <p className="text-muted-foreground italic">No passage available for this paper.</p>
          )}
          {it.kind === "unsourced" && it.quote && <p className="mt-2 text-xs text-amber-800">Quoted: <span className="italic">“{it.quote}”</span></p>}
        </div>
      </div>
      <footer className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
        {correcting ? (
          <>
            <Button size="sm" disabled={busy || draft.trim().length < 3} onClick={(e) => { e.stopPropagation(); onCorrect(draft); }}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}<span className="ml-1.5">Save correction</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onCancelCorrect(); }}>Cancel</Button>
          </>
        ) : (
          <>
            <Button size="sm" disabled={busy} onClick={(e) => { e.stopPropagation(); onApprove(); }}><Check className="size-3.5" /><span className="ml-1.5">Approve</span></Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={(e) => { e.stopPropagation(); onStartCorrect(); }}>Correct</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={(e) => { e.stopPropagation(); onReject(); }}><X className="size-3.5" /><span className="ml-1.5">Reject</span></Button>
            {it.paperId && (
              <div className="ml-auto flex items-center gap-1">
                <input value={note} onChange={(e) => onNote(e.target.value)} placeholder="Note for the Extractor…" className="rounded-md border px-2 py-1 text-xs w-56" onClick={(e) => e.stopPropagation()} />
                <Button size="sm" variant="ghost" disabled={busy || note.trim().length < 3} onClick={(e) => { e.stopPropagation(); onSendBack(note); }} title="Re-extract this paper with your note">
                  <RotateCw className="size-3.5" /><span className="ml-1.5">Send back</span>
                </Button>
              </div>
            )}
          </>
        )}
      </footer>
    </article>
  );
}

/** One side of a conflict: the reading, the source it came from, and the quote it rests on. */
function ConflictReading({ label, text, quote, paperTitle, year, page, section, confidence, current }: { label: string; text: string; quote: string; paperTitle: string; year: number | null; page: number; section: string; confidence: number; current?: boolean }) {
  return (
    <div className={cn("rounded border bg-white p-2", current ? "border-rose-200" : "border-slate-200")}>
      <p className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2">
        <span className={cn("font-medium", current ? "text-rose-700" : "text-slate-700")}>{label}</span>
        <span className="truncate max-w-[22rem]" title={paperTitle}>{paperTitle || "No paper"}</span>
        {year && <span>({year})</span>}
        {page > 0 && <span>· p.{page}</span>}
        {section && <span>· {section}</span>}
        <span className="ml-auto tabular-nums">confidence {Math.round(confidence * 100)}%</span>
      </p>
      <p className="leading-relaxed mt-1">{text}</p>
      {quote && <p className="mt-1 text-xs text-muted-foreground border-l-2 border-slate-200 pl-2 italic">“{quote.length > 280 ? `${quote.slice(0, 280)}…` : quote}”</p>}
    </div>
  );
}
