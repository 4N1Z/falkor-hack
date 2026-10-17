"use client";

import type { AgentResult } from "@/lib/agents/base";
import type { MemoryItem, MemoryKind } from "@/lib/agents/historian";
import type { Idea } from "@/lib/agents/next-steps";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppState } from "@/lib/providers/state-providers";
import { cn } from "@/lib/utils";
import { Check, CornerDownLeft, FileText, Lightbulb, Loader2, Target, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

/** Fired by the "/hypothesis" slash command to save the current sentence. */
export const REMEMBER_EVENT = "neura:remember";
export type RememberDetail = { text: string; kind?: MemoryKind };

// Press feedback on every pressable thing: fast, transform only, so it never drops frames.
const press = "transition-transform duration-150 ease-out active:scale-[0.97]";
// One-shot entrance for list rows: short, ease-out, staggered 30 ms, off when motion is reduced.
const enter = "animate-in fade-in-0 slide-in-from-bottom-1 duration-150 ease-out fill-mode-both motion-reduce:animate-none";
const stagger = (i: number) => ({ animationDelay: `${Math.min(i, 8) * 30}ms` });

const KIND: Record<MemoryKind, { label: string; dot: string; text: string }> = {
  hypothesis: { label: "Hypothesis", dot: "bg-violet-500", text: "text-violet-700 dark:text-violet-300" },
  finding: { label: "Finding", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300" },
  question: { label: "Question", dot: "bg-sky-500", text: "text-sky-700 dark:text-sky-300" },
};
const fmt = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** An idea as stored in the graph (GET /api/agents/next-steps). */
interface StoredIdea {
  id: string;
  title: string;
  text: string;
  action: string;
  kind: Idea["kind"];
  status: "suggested" | "accepted" | "rejected";
  novelty: number;
  feasibility: number;
  at: number;
  papers: string[];
  concepts: string[];
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Request failed");
  return body as T;
}

/**
 * Research notebook: the team's time-aware memory (Historian) and grounded next steps.
 * Opens on what already exists — notes, earlier suggestions, the plan — so nobody waits on an
 * empty panel, and the agents are asked for more only on request.
 */
export function NotebookPanel({ fileId, visible, onOpenCount }: { fileId: string; visible: boolean; onOpenCount: (n: number) => void }) {
  const { workspaceId } = useAppState();
  const [tab, setTab] = useState("memory");
  const [items, setItems] = useState<MemoryItem[] | null>(null);
  const [planCount, setPlanCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setItems((await api<{ items: MemoryItem[] }>(`/api/agents/memory?workspaceId=${workspaceId}`)).items);
    } catch {
      setItems([]);
    }
  }, [workspaceId]);

  const save = useCallback(
    async (text: string, kind?: MemoryKind) => {
      if (!workspaceId || text.trim().length < 8) return false;
      try {
        const r = await api<{ kind: MemoryKind; about: string[] }>("/api/agents/memory", {
          method: "POST",
          body: JSON.stringify({ workspaceId, text, kind, fileId }),
        });
        toast.success(`Saved as a ${r.kind}`, { description: r.about.length ? `Linked to “${r.about[0]}”` : undefined });
        load();
        return true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't save");
        return false;
      }
    },
    [workspaceId, fileId, load],
  );

  // "/hypothesis" from the editor
  useEffect(() => {
    const onRemember = (e: Event) => {
      const d = (e as CustomEvent<RememberDetail>).detail;
      save(d.text, d.kind);
    };
    window.addEventListener(REMEMBER_EVENT, onRemember);
    return () => window.removeEventListener(REMEMBER_EVENT, onRemember);
  }, [save]);

  const setStatus = async (m: MemoryItem, status: MemoryItem["status"], reason?: string) => {
    // Optimistic: the row changes as you click; the server catches up
    setItems(
      (list) =>
        list?.map((x) => (x.id === m.id ? { ...x, status, reason: reason ?? x.reason, validTo: status === "dropped" ? Date.now() : null } : x)) ?? null,
    );
    try {
      await api("/api/agents/memory", { method: "PATCH", body: JSON.stringify({ workspaceId, id: m.id, status, reason }) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update");
    } finally {
      load();
    }
  };

  // Fetch on mount (the panel stays mounted in the rail) and again each time it is shown.
  // A data fetch is the external system here; state is set when the response arrives.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load, visible]);

  const openCount = items?.filter((m) => m.status === "active").length ?? 0;
  const droppedCount = items?.filter((m) => m.status === "dropped").length ?? 0;
  useEffect(() => onOpenCount(openCount), [openCount, onOpenCount]);
  const summary = items
    ? [`${items.length} note${items.length === 1 ? "" : "s"}`, droppedCount ? `${droppedCount} dropped` : null, planCount ? `${planCount} in the plan` : null]
        .filter(Boolean)
        .join(" · ")
    : "Shared by the whole workspace";

  if (!visible) return null;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <TabsList className="h-8">
            <TabsTrigger value="memory" className="h-6 gap-1.5 text-xs">
              Memory {openCount > 0 && <Count n={openCount} />}
            </TabsTrigger>
            <TabsTrigger value="next" className="h-6 gap-1.5 text-xs">
              Next steps {planCount ? <Count n={planCount} /> : null}
            </TabsTrigger>
          </TabsList>
          <p className="truncate text-[11px] text-muted-foreground tabular-nums">{summary}</p>
        </div>

        <TabsContent value="memory" className="mt-0 flex min-h-0 flex-1 flex-col gap-3">
          <MemoryTimeline items={items} onStatus={setStatus} />
          <Compose onSave={save} />
        </TabsContent>

        <TabsContent value="next" className="mt-0 flex min-h-0 flex-1 flex-col">
          <NextSteps workspaceId={workspaceId} fileId={fileId} onPlanCount={setPlanCount} active={visible && tab === "next"} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Count({ n }: { n: number }) {
  return <span className="rounded-full bg-foreground/10 px-1.5 text-[11px] font-medium tabular-nums leading-4">{n}</span>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground tabular-nums">{children}</p>;
}

// ---------------------------------------------------------------- Memory

function MemoryTimeline({ items, onStatus }: { items: MemoryItem[] | null; onStatus: (m: MemoryItem, s: MemoryItem["status"], reason?: string) => void }) {
  const groups = useMemo(() => (items ? { open: items.filter((m) => m.status === "active"), settled: items.filter((m) => m.status !== "active") } : null), [items]);

  if (!groups) {
    return (
      <ul className="flex-1 space-y-3 pt-1" aria-busy="true" aria-label="Loading notes">
        {[72, 56, 64].map((w, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-muted" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-24 rounded bg-muted" />
              <div className="h-3.5 rounded bg-muted" style={{ width: `${w}%` }} />
            </div>
          </li>
        ))}
      </ul>
    );
  }
  if (!items?.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
        <p className="text-sm font-medium">Nothing recorded yet</p>
        <p className="max-w-[28ch] text-xs text-muted-foreground">
          Write one below, or type <code className="rounded bg-muted px-1">/hypothesis</code> after a sentence in the draft.
        </p>
      </div>
    );
  }

  let i = 0;
  return (
    <div className="-mx-2 min-h-0 flex-1 space-y-4 overflow-y-auto px-2">
      {groups.open.length > 0 && (
        <section>
          <SectionLabel>Open · {groups.open.length}</SectionLabel>
          <ul className="space-y-1">
            {groups.open.map((m) => (
              <MemoryRow key={m.id} m={m} onStatus={onStatus} index={i++} />
            ))}
          </ul>
        </section>
      )}
      {groups.settled.length > 0 && (
        <section>
          <SectionLabel>Settled · {groups.settled.length}</SectionLabel>
          <ul className="space-y-1">
            {groups.settled.map((m) => (
              <MemoryRow key={m.id} m={m} onStatus={onStatus} index={i++} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function MemoryRow({ m, onStatus, index }: { m: MemoryItem; onStatus: (m: MemoryItem, s: MemoryItem["status"], reason?: string) => void; index: number }) {
  const [dropping, setDropping] = useState(false);
  const [reason, setReason] = useState("");
  const k = KIND[m.kind];
  const dropped = m.status === "dropped";
  const confirmed = m.status === "confirmed";
  return (
    <li className={cn("group relative flex gap-3 rounded-md px-2 py-2 hover:bg-muted/40", enter)} style={stagger(index)}>
      <span className={cn("mt-[7px] size-2 shrink-0 rounded-full", dropped ? "bg-muted-foreground/40" : k.dot)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] leading-4 text-muted-foreground">
          <span className={cn("font-medium", dropped ? "" : k.text)}>{k.label}</span>
          <span>·</span>
          <span>{m.byName}</span>
          <span>·</span>
          <span className="tabular-nums">{fmt(m.validFrom)}</span>
          {confirmed && <span className="ml-1 rounded bg-emerald-50 px-1 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">confirmed</span>}
          {dropped && (
            <span className="ml-1 rounded bg-red-50 px-1 tabular-nums text-red-700 dark:bg-red-950 dark:text-red-300">
              dropped{m.validTo ? ` ${fmt(m.validTo)}` : ""}
            </span>
          )}
        </p>
        <p className={cn("mt-0.5 text-sm leading-snug", dropped && "text-muted-foreground")}>{m.text}</p>
        {dropped && m.reason && <p className="mt-0.5 text-xs text-muted-foreground">Because {m.reason.charAt(0).toLowerCase() + m.reason.slice(1)}</p>}
        {m.about.length > 0 && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={m.about.join(" · ")}>
            Linked to {m.about[0]}
            {m.about.length > 1 ? ` +${m.about.length - 1}` : ""}
          </p>
        )}

        {m.kind === "hypothesis" &&
          (dropping ? (
            <form
              className="mt-1.5 flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                onStatus(m, "dropped", reason);
                setDropping(false);
              }}
            >
              <input
                autoFocus
                id={`drop-reason-${m.id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why? Agents will warn before suggesting it again"
                className="h-7 min-w-0 flex-1 rounded border bg-transparent px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <Button type="submit" size="sm" variant="destructive" className={cn("h-7 px-2 text-xs", press)}>
                Drop
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setDropping(false)}>
                Cancel
              </Button>
            </form>
          ) : (
            <div className="mt-1 flex gap-0.5 sm:opacity-0 sm:transition-opacity sm:duration-150 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              {m.status === "active" ? (
                <>
                  <RowAction onClick={() => onStatus(m, "confirmed")}>
                    <Check className="size-3" /> Confirm
                  </RowAction>
                  <RowAction className="text-red-700 dark:text-red-300" onClick={() => setDropping(true)}>
                    <X className="size-3" /> Drop
                  </RowAction>
                </>
              ) : (
                <RowAction onClick={() => onStatus(m, "active")}>Reopen</RowAction>
              )}
            </div>
          ))}
      </div>
    </li>
  );
}

function RowAction({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:opacity-100",
        press,
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Compose box: one growing field, Enter saves, an optional kind so JEV isn't guessing when you already know. */
function Compose({ onSave }: { onSave: (text: string, kind?: MemoryKind) => Promise<boolean> }) {
  const [draft, setDraft] = useState("");
  const [kind, setKind] = useState<MemoryKind | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const ready = draft.trim().length >= 8;

  // Grow with the text, up to about five lines
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

  const submit = async () => {
    if (!ready || saving) return;
    setSaving(true);
    const ok = await onSave(draft.trim(), kind);
    setSaving(false);
    if (ok) {
      setDraft("");
      setKind(undefined);
    }
  };

  return (
    <div className="rounded-lg border bg-background focus-within:ring-1 focus-within:ring-ring">
      <textarea
        ref={ref}
        id="notebook-compose"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={1}
        placeholder="Record a hypothesis, finding or question…"
        className="block w-full resize-none bg-transparent px-3 pb-1 pt-2.5 text-sm outline-none placeholder:text-muted-foreground"
      />
      {/* Wraps instead of squeezing: on a narrow sheet the button drops to its own line, right-aligned */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-2 pb-2">
        <div className="flex min-w-0 flex-wrap items-center gap-0.5" role="radiogroup" aria-label="Kind of note">
          {(["hypothesis", "finding", "question"] as MemoryKind[]).map((k) => {
            const on = kind === k;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setKind(on ? undefined : k)}
                className={cn(
                  "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded px-1.5 text-[11px] transition-colors duration-150",
                  on ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
                  press,
                )}
              >
                <span className={cn("size-1.5 rounded-full", on ? "bg-background" : KIND[k].dot)} aria-hidden />
                {KIND[k].label}
              </button>
            );
          })}
          {!kind && <span className="ml-1 whitespace-nowrap text-[11px] text-muted-foreground">or let Neura decide</span>}
        </div>
        <Button size="sm" onClick={submit} disabled={!ready || saving} className={cn("ml-auto h-7 shrink-0 gap-1 px-2.5 text-xs", press)}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <CornerDownLeft className="size-3.5" />}
          Remember
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Next steps

/** What the agent is doing, in the order it does it (see next-steps.ts), so a 5 s wait reads as progress. */
const STAGES = [
  "Finding gaps in the team's reading",
  "Finding papers that bridge your libraries",
  "Ranking unread papers by PageRank",
  "Drafting ideas from that evidence",
  "Scoring novelty and feasibility",
];

function NextSteps({
  workspaceId,
  fileId,
  onPlanCount,
  active,
}: {
  workspaceId: string | undefined;
  fileId: string;
  onPlanCount: (n: number) => void;
  active: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [fresh, setFresh] = useState<Idea[] | null>(null);
  const [earlier, setEarlier] = useState<StoredIdea[] | null>(null);
  const [plan, setPlan] = useState<StoredIdea[]>([]);

  const loadStored = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const { ideas } = await api<{ ideas: StoredIdea[] }>(`/api/agents/next-steps?workspaceId=${workspaceId}&statuses=accepted,suggested`);
      const accepted = ideas.filter((i) => i.status === "accepted");
      setPlan(accepted);
      onPlanCount(accepted.length);
      setEarlier(ideas.filter((i) => i.status === "suggested").slice(0, 6));
    } catch {
      setEarlier([]);
    }
  }, [workspaceId, onPlanCount]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch; state is set on response
    if (active) loadStored();
  }, [active, loadStored]);

  // Cycle the stage line while the agent runs (reset to 0 happens where the run starts)
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 1100);
    return () => clearInterval(t);
  }, [loading]);

  const suggest = async () => {
    setStage(0);
    setLoading(true);
    try {
      const r = await api<AgentResult<Idea>>("/api/agents/next-steps", { method: "POST", body: JSON.stringify({ workspaceId, fileId }) });
      setFresh(r.items);
      // New proposals replace the earlier open ones in the list (they're still in the graph)
      setEarlier((list) => list?.filter((e) => !r.items.some((i) => i.id === e.id)) ?? null);
      if (!r.items.length) toast.message("Nothing new to suggest", { description: "The graph has no gaps, bridges or unread papers to build on yet." });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't suggest next steps");
    } finally {
      setLoading(false);
    }
  };

  const decide = async (id: string, status: "accepted" | "rejected") => {
    setFresh((list) => list?.filter((i) => i.id !== id) ?? null);
    setEarlier((list) => list?.filter((i) => i.id !== id) ?? null);
    try {
      await api("/api/agents/next-steps", { method: "PATCH", body: JSON.stringify({ workspaceId, id, status }) });
      if (status === "accepted") toast.success("Added to the research plan");
    } catch {
      toast.error("Couldn't save that decision");
    } finally {
      loadStored();
    }
  };

  const nothingYet = earlier !== null && !earlier.length && !plan.length && !fresh && !loading;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Grounded in the team&apos;s graph: gaps, bridge papers, PageRank and open notes.</p>
        <Button size="sm" onClick={suggest} disabled={loading || !workspaceId} className={cn("h-7 shrink-0 gap-1 px-2.5 text-xs", press)}>
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Lightbulb className="size-3.5" />}
          {fresh ? "Suggest again" : "Suggest"}
        </Button>
      </div>

      <div className="-mx-2 min-h-0 flex-1 space-y-4 overflow-y-auto px-2">
        {loading && (
          <section aria-busy="true">
            <p className="mb-1.5 px-1 text-xs text-muted-foreground" aria-live="polite">
              {STAGES[stage]}…
            </p>
            <ul className="space-y-2">
              {[0, 1, 2].map((i) => (
                <li key={i} className="rounded-md border p-3">
                  <div className="h-3 w-16 rounded bg-muted" />
                  <div className="mt-2 h-3.5 w-3/4 rounded bg-muted" />
                  <div className="mt-1.5 h-3 w-full rounded bg-muted" />
                  <div className="mt-1 h-3 w-5/6 rounded bg-muted" />
                </li>
              ))}
            </ul>
          </section>
        )}

        {fresh && fresh.length > 0 && (
          <section>
            <SectionLabel>New · {fresh.length}</SectionLabel>
            <ul className="space-y-2">
              {fresh.map((i, n) => (
                <IdeaCard key={i.id} idea={i} index={n} onDecide={decide} />
              ))}
            </ul>
          </section>
        )}

        {earlier === null && !loading && (
          <ul className="space-y-2 pt-1" aria-busy="true" aria-label="Loading ideas">
            {[0, 1].map((i) => (
              <li key={i} className="rounded-md border p-3">
                <div className="h-3.5 w-2/3 rounded bg-muted" />
                <div className="mt-1.5 h-3 w-full rounded bg-muted" />
              </li>
            ))}
          </ul>
        )}

        {earlier && earlier.length > 0 && (
          <section>
            <SectionLabel>Still open · {earlier.length}</SectionLabel>
            <ul className="space-y-2">
              {earlier.map((i, n) => (
                <IdeaCard key={i.id} idea={i} index={n} onDecide={decide} />
              ))}
            </ul>
          </section>
        )}

        {plan.length > 0 && (
          <section>
            <SectionLabel>Research plan · {plan.length}</SectionLabel>
            <ul className="space-y-1">
              {plan.map((p, n) => (
                <li key={p.id} className={cn("group flex gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40", enter)} style={stagger(n)}>
                  <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug">{p.title}</p>
                    <p className="text-xs text-muted-foreground">{p.action}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => decide(p.id, "rejected")}
                    aria-label="Remove from plan"
                    className={cn(
                      "h-6 shrink-0 self-start rounded px-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground sm:opacity-0 sm:transition-opacity sm:duration-150 sm:group-hover:opacity-100 sm:focus-visible:opacity-100",
                      press,
                    )}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {nothingYet && (
          <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
            <p className="text-sm font-medium">No next steps yet</p>
            <p className="max-w-[30ch] text-xs text-muted-foreground">
              Ask for suggestions and the agent reads the team&apos;s graph for gaps and bridges between your libraries.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const IDEA_KIND: Record<Idea["kind"], string> = { read: "Read", experiment: "Experiment", write: "Write", ask: "Ask" };

function IdeaCard({ idea, index, onDecide }: { idea: Idea | StoredIdea; index: number; onDecide: (id: string, s: "accepted" | "rejected") => void }) {
  const evidence: { icon: typeof FileText; label: string }[] =
    "evidence" in idea
      ? idea.evidence.map((e) => ({ icon: e.kind === "paper" ? FileText : e.kind === "gap" ? Target : Lightbulb, label: e.label }))
      : [...idea.papers.map((p) => ({ icon: FileText, label: p })), ...idea.concepts.map((c) => ({ icon: Target, label: c }))];
  const conflict = "conflictsWith" in idea ? idea.conflictsWith : null;
  return (
    <li className={cn("rounded-md border p-3", enter)} style={stagger(index)}>
      <div className="flex items-center justify-between gap-2">
        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium">{IDEA_KIND[idea.kind]}</span>
        <div className="flex items-center gap-3">
          <Meter label="novel" value={idea.novelty} />
          <Meter label="feasible" value={idea.feasibility} />
        </div>
      </div>
      <p className="mt-1.5 text-sm font-medium leading-snug">{idea.title}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{idea.text}</p>
      <p className="mt-1.5 text-xs">
        <span className="font-medium">First step</span> <span className="text-muted-foreground">{idea.action}</span>
      </p>
      {conflict && (
        <p className="mt-1.5 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Close to a hypothesis {conflict.byName} dropped on {fmt(conflict.validTo ?? conflict.validFrom)}
          {conflict.reason ? `: ${conflict.reason}` : "."}
        </p>
      )}
      {evidence.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {evidence.slice(0, 3).map((e, i) => (
            <li key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <e.icon className="size-3 shrink-0" />
              <span className="truncate">{e.label}</span>
            </li>
          ))}
          {evidence.length > 3 && <li className="text-[11px] text-muted-foreground">+{evidence.length - 3} more</li>}
        </ul>
      )}
      <div className="mt-2.5 flex gap-1.5">
        <Button size="sm" className={cn("h-7 flex-1 text-xs", press)} onClick={() => onDecide(idea.id, "accepted")}>
          <Check className="mr-1 size-3.5" /> Add to plan
        </Button>
        <Button size="sm" variant="ghost" className={cn("h-7 text-xs", press)} onClick={() => onDecide(idea.id, "rejected")}>
          Dismiss
        </Button>
      </div>
    </li>
  );
}

/** Novelty / feasibility as a short bar: the shape reads faster than a percentage. */
function Meter({ label, value }: { label: string; value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground" title={`${label} ${pct}%`}>
      <span>{label}</span>
      <span className="h-1 w-10 overflow-hidden rounded-full bg-muted" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <span className="block h-full rounded-full bg-foreground/60" style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}
