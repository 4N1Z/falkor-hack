"use client";

import type { AgentResult } from "@/lib/agents/base";
import type { MemoryItem, MemoryKind } from "@/lib/agents/historian";
import type { Idea } from "@/lib/agents/next-steps";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppState } from "@/lib/providers/state-providers";
import { cn } from "@/lib/utils";
import { BookOpen, Check, Lightbulb, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

/** Fired by the "/hypothesis" slash command to save the current sentence. */
export const REMEMBER_EVENT = "neura:remember";
export type RememberDetail = { text: string; kind?: MemoryKind };

const press = "transition-transform duration-150 ease-out active:scale-[0.97]";
const KIND_TONE: Record<MemoryKind, string> = {
  hypothesis: "bg-violet-50 text-violet-800",
  finding: "bg-emerald-50 text-emerald-800",
  question: "bg-sky-50 text-sky-800",
};
const fmt = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Request failed");
  return body as T;
}

/** Research notebook: the team's time-aware memory (Historian) and grounded next steps. */
export function NotebookSheet({ fileId }: { fileId: string }) {
  const { workspaceId } = useAppState();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("memory");
  const [items, setItems] = useState<MemoryItem[] | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

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
      if (!workspaceId || text.trim().length < 8) return;
      setSaving(true);
      try {
        const r = await api<{ kind: MemoryKind; about: string[] }>("/api/agents/memory", {
          method: "POST",
          body: JSON.stringify({ workspaceId, text, kind, fileId }),
        });
        toast.success(`Saved as a ${r.kind}`, { description: r.about.length ? `Linked to “${r.about[0]}”` : undefined });
        setDraft("");
        load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't save");
      } finally {
        setSaving(false);
      }
    },
    [workspaceId, fileId, load],
  );

  // "/hypothesis" from the editor
  useEffect(() => {
    const onRemember = (e: Event) => save((e as CustomEvent<RememberDetail>).detail.text, (e as CustomEvent<RememberDetail>).detail.kind);
    window.addEventListener(REMEMBER_EVENT, onRemember);
    return () => window.removeEventListener(REMEMBER_EVENT, onRemember);
  }, [save]);

  const setStatus = async (m: MemoryItem, status: MemoryItem["status"], reason?: string) => {
    try {
      await api("/api/agents/memory", { method: "PATCH", body: JSON.stringify({ workspaceId, id: m.id, status, reason }) });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update");
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) load();
      }}
    >
      <SheetTrigger asChild>
        <Button size={null} className={cn("text-violet-800 text-sm bg-violet-100 rounded-lg px-2 p-1 hover:bg-violet-200 transition-colors", press)}>
          <BookOpen className="mr-1 size-3.5" /> Notebook
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-3 font-sans">
        <SheetHeader>
          <SheetTitle>Research notebook</SheetTitle>
          <SheetDescription>What your team believes, found and asked — and what to do next. Shared by everyone in the workspace.</SheetDescription>
        </SheetHeader>
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-3">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="memory">Memory</TabsTrigger>
            <TabsTrigger value="next">Next steps</TabsTrigger>
          </TabsList>

          <TabsContent value="memory" className="mt-0 flex min-h-0 flex-1 flex-col gap-3">
            <div className="space-y-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Record a hypothesis, finding or question…"
                rows={3}
                className="w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">JEV decides if it&apos;s a hypothesis, finding or question.</p>
                <Button size="sm" onClick={() => save(draft)} disabled={saving || draft.trim().length < 8} className={press}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : "Remember"}
                </Button>
              </div>
            </div>
            <ul className="-mx-2 flex-1 space-y-1 overflow-y-auto px-2">
              {items === null ? (
                <li className="h-16 rounded-md bg-muted/60 animate-pulse motion-reduce:animate-none" />
              ) : items.length === 0 ? (
                <li className="py-6 text-center text-sm text-muted-foreground">Nothing recorded yet. Try /hypothesis in the editor.</li>
              ) : (
                items.map((m) => <MemoryRow key={m.id} m={m} onStatus={setStatus} />)
              )}
            </ul>
          </TabsContent>

          <TabsContent value="next" className="mt-0 flex min-h-0 flex-1 flex-col gap-3">
            <NextSteps workspaceId={workspaceId} fileId={fileId} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function MemoryRow({ m, onStatus }: { m: MemoryItem; onStatus: (m: MemoryItem, s: MemoryItem["status"], reason?: string) => void }) {
  const [dropping, setDropping] = useState(false);
  const [reason, setReason] = useState("");
  const dropped = m.status === "dropped";
  return (
    <li className="rounded-md p-2 hover:bg-muted/40">
      <div className="flex items-center gap-1.5 text-xs">
        <span className={cn("rounded px-1.5 py-0.5 font-medium", KIND_TONE[m.kind])}>{m.kind}</span>
        {m.status !== "active" && (
          <span className={cn("rounded px-1.5 py-0.5", dropped ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700")}>{m.status}</span>
        )}
        <span className="text-muted-foreground">
          {m.byName} · {fmt(m.validFrom)}
          {m.validTo ? ` → ${fmt(m.validTo)}` : ""}
        </span>
      </div>
      <p className={cn("mt-1 text-sm leading-snug", dropped && "text-muted-foreground line-through decoration-muted-foreground/60")}>{m.text}</p>
      {dropped && m.reason && <p className="mt-0.5 text-xs text-muted-foreground">Dropped because: {m.reason}</p>}
      {m.about.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">About: {m.about.join(" · ")}</p>}
      {m.kind === "hypothesis" &&
        (dropping ? (
          <div className="mt-1.5 flex gap-1.5">
            <input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why drop it? (agents will remember)"
              className="h-7 flex-1 rounded border bg-transparent px-2 text-xs outline-none"
            />
            <Button size="sm" variant="destructive" className={cn("h-7 px-2 text-xs", press)} onClick={() => onStatus(m, "dropped", reason)}>
              Drop
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setDropping(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="mt-1 flex gap-1">
            {m.status === "active" ? (
              <>
                <Button size="sm" variant="ghost" className={cn("h-6 px-1.5 text-xs", press)} onClick={() => onStatus(m, "confirmed")}>
                  Confirm
                </Button>
                <Button size="sm" variant="ghost" className={cn("h-6 px-1.5 text-xs text-red-700", press)} onClick={() => setDropping(true)}>
                  Drop
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" className={cn("h-6 px-1.5 text-xs", press)} onClick={() => onStatus(m, "active")}>
                Reopen
              </Button>
            )}
          </div>
        ))}
    </li>
  );
}

function NextSteps({ workspaceId, fileId }: { workspaceId: string | undefined; fileId: string }) {
  const [loading, setLoading] = useState(false);
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [plan, setPlan] = useState<{ id: string; title: string; action: string }[]>([]);

  const loadPlan = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setPlan((await api<{ ideas: { id: string; title: string; action: string }[] }>(`/api/agents/next-steps?workspaceId=${workspaceId}`)).ideas);
    } catch {}
  }, [workspaceId]);
  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  const suggest = async () => {
    setLoading(true);
    try {
      const r = await api<AgentResult<Idea>>("/api/agents/next-steps", { method: "POST", body: JSON.stringify({ workspaceId, fileId }) });
      setIdeas(r.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't suggest next steps");
    } finally {
      setLoading(false);
    }
  };

  const decide = async (idea: Idea, status: "accepted" | "rejected") => {
    setIdeas((list) => list?.filter((i) => i.id !== idea.id) ?? null);
    await api("/api/agents/next-steps", { method: "PATCH", body: JSON.stringify({ workspaceId, id: idea.id, status }) }).catch(() => {});
    if (status === "accepted") {
      toast.success("Added to the research plan");
      loadPlan();
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Button onClick={suggest} disabled={loading} className={cn("w-full", press)}>
        {loading ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Lightbulb className="mr-1.5 size-4" />}
        {loading ? "Reading the research graph…" : ideas ? "Suggest again" : "Suggest next steps"}
      </Button>
      <div className="-mx-2 flex-1 space-y-2 overflow-y-auto px-2">
        {ideas?.map((i) => (
          <div key={i.id} className="rounded-md border p-2.5 animate-in fade-in-0 slide-in-from-bottom-1 duration-150 ease-out motion-reduce:animate-none">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">{i.kind}</span>
              <span className="tabular-nums">novelty {Math.round(i.novelty * 100)}%</span>·
              <span className="tabular-nums">feasibility {Math.round(i.feasibility * 100)}%</span>
            </div>
            <p className="mt-1 text-sm font-medium leading-snug">{i.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{i.text}</p>
            <p className="mt-1 text-xs">
              <span className="font-medium">First step:</span> {i.action}
            </p>
            {i.conflictsWith && (
              <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
                Similar to a hypothesis {i.conflictsWith.byName} dropped on {fmt(i.conflictsWith.validTo ?? i.conflictsWith.validFrom)}
                {i.conflictsWith.reason ? `: ${i.conflictsWith.reason}` : "."}
              </p>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">Grounded in: {i.evidence.map((e) => e.label).join(" · ")}</p>
            <div className="mt-2 flex gap-1.5">
              <Button size="sm" className={cn("h-7 flex-1 text-xs", press)} onClick={() => decide(i, "accepted")}>
                <Check className="mr-1 size-3.5" /> Add to plan
              </Button>
              <Button size="sm" variant="ghost" className={cn("h-7 text-xs", press)} onClick={() => decide(i, "rejected")}>
                <X className="mr-1 size-3.5" /> Dismiss
              </Button>
            </div>
          </div>
        ))}
        {plan.length > 0 && (
          <div className="pt-2">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Research plan</p>
            <ul className="space-y-1">
              {plan.map((p) => (
                <li key={p.id} className="text-sm">
                  <span className="mr-1 text-emerald-700">✓</span>
                  {p.title}
                  <span className="block text-xs text-muted-foreground">{p.action}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
