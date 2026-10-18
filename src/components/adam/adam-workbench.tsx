"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createAdamProject, useAdamProjects, useAdamStatus } from "@/lib/hooks/use-adam";
import { cn } from "@/lib/utils";
import { Loader2, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ActivityTab } from "./activity-tab";
import { AdamStatusBar } from "./adam-status-bar";
import { QuestionTab } from "./question-tab";
import { SweepTab } from "./sweep-tab";
import { QueueTab } from "./queue-tab";
import { KnowledgeTab } from "./knowledge-tab";
import { MethodsTab } from "./methods-tab";
import { HypothesesTab } from "./hypotheses-tab";
import { ExperimentsTab } from "./experiments-tab";
import { SaturationTab } from "./saturation-tab";

type Tab = "question" | "sweep" | "queue" | "knowledge" | "methods" | "hypotheses" | "experiments" | "saturation" | "activity";

const TABS: { id: Tab; label: string }[] = [
  { id: "question", label: "Question" },
  { id: "sweep", label: "Sweep" },
  { id: "queue", label: "Extraction queue" },
  { id: "knowledge", label: "Knowledge" },
  { id: "methods", label: "Methods" },
  { id: "hypotheses", label: "Hypotheses" },
  { id: "experiments", label: "Experiments" },
  { id: "saturation", label: "Saturation" },
  { id: "activity", label: "Activity" },
];

/**
 * Adam: the research-agent workbench for one project at a time. The status bar shows where
 * the loop is; each tab is one phase's surface. Tabs for later phases land with those phases.
 */
export default function AdamWorkbench({ workspaceId }: { workspaceId: string }) {
  const { projects, isLoading } = useAdamProjects(workspaceId);
  const [selected, setSelected] = useState<string | null>(null);
  const projectId = selected ?? projects?.[0]?.id ?? null;
  const { status, error } = useAdamStatus(workspaceId, projectId);
  const [tab, setTab] = useState<Tab>("question");

  // Keep a stable selection when the list refreshes
  useEffect(() => {
    if (selected && projects && !projects.some((p) => p.id === selected)) setSelected(null);
  }, [projects, selected]);

  const picker = useMemo(
    () =>
      projects && projects.length > 0 ? (
        <div className="flex items-center gap-1 overflow-x-auto">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-sm transition-colors whitespace-nowrap",
                p.id === projectId ? "bg-foreground text-background" : "hover:bg-accent text-muted-foreground",
              )}
            >
              {p.title}
            </button>
          ))}
        </div>
      ) : null,
    [projects, projectId],
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-6 pb-16 pt-8 lg:px-10 flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.02em]">Adam</h1>
          <p className="text-sm text-muted-foreground">A graph of known steps from the literature, and the chain that would test your hypothesis.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {picker}
          <NewProjectDialog workspaceId={workspaceId} onCreated={(id) => setSelected(id)} />
        </div>
      </header>

      {isLoading && !projects ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-16 justify-center">
          <Loader2 className="size-4 animate-spin" /> Loading projects…
        </div>
      ) : !projectId ? (
        <EmptyState workspaceId={workspaceId} onCreated={(id) => setSelected(id)} />
      ) : error ? (
        <p className="text-sm text-red-700">{error.message}</p>
      ) : !status ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-16 justify-center">
          <Loader2 className="size-4 animate-spin" /> Loading project…
        </div>
      ) : (
        <>
          <AdamStatusBar workspaceId={workspaceId} status={status} />
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex flex-col gap-3">
            <TabsList className="w-fit">
              {TABS.map((t) => (
                <TabsTrigger key={t.id} value={t.id}>
                  {t.label}
                  {t.id === "question" && status.project.status === "blocked_on_gate" && status.project.gate === "scope" && (
                    <span className="ml-1.5 inline-block size-1.5 rounded-full bg-amber-500" />
                  )}
                  {t.id === "hypotheses" && status.project.status === "blocked_on_gate" && (status.project.gate === "select" || status.project.gate === "kill") && (
                    <span className="ml-1.5 inline-block size-1.5 rounded-full bg-amber-500" />
                  )}
                  {t.id === "experiments" && status.project.status === "blocked_on_gate" && status.project.gate === "plan" && (
                    <span className="ml-1.5 inline-block size-1.5 rounded-full bg-amber-500" />
                  )}
                  {t.id === "queue" && status.queueOpen > 0 && (
                    <span className="ml-1.5 rounded-full bg-amber-100 text-amber-800 px-1.5 text-[10px] tabular-nums">{status.queueOpen}</span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="question" className="mt-0">
              <QuestionTab workspaceId={workspaceId} status={status} />
            </TabsContent>
            <TabsContent value="sweep" className="mt-0">
              <SweepTab workspaceId={workspaceId} status={status} />
            </TabsContent>
            <TabsContent value="queue" className="mt-0">
              <QueueTab workspaceId={workspaceId} status={status} />
            </TabsContent>
            <TabsContent value="knowledge" className="mt-0">
              <KnowledgeTab workspaceId={workspaceId} status={status} />
            </TabsContent>
            <TabsContent value="methods" className="mt-0">
              <MethodsTab workspaceId={workspaceId} status={status} />
            </TabsContent>
            <TabsContent value="hypotheses" className="mt-0">
              <HypothesesTab workspaceId={workspaceId} status={status} />
            </TabsContent>
            <TabsContent value="experiments" className="mt-0">
              <ExperimentsTab workspaceId={workspaceId} status={status} />
            </TabsContent>
            <TabsContent value="saturation" className="mt-0">
              <SaturationTab workspaceId={workspaceId} status={status} />
            </TabsContent>
            <TabsContent value="activity" className="mt-0">
              <ActivityTab status={status} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function EmptyState({ workspaceId, onCreated }: { workspaceId: string; onCreated: (id: string) => void }) {
  return (
    <div className="rounded-lg border border-dashed bg-white p-10 flex flex-col items-center gap-3 text-center">
      <h2 className="text-base font-medium">Start a research project</h2>
      <p className="text-sm text-muted-foreground max-w-md">
        Give Adam a topic, what you already believe, and what your lab can do. It turns the literature into a graph of known steps,
        shows you only what needs your judgment, and answers a hypothesis with the chain that could test it.
      </p>
      <NewProjectDialog workspaceId={workspaceId} onCreated={onCreated} primary />
    </div>
  );
}

function NewProjectDialog({ workspaceId, onCreated, primary }: { workspaceId: string; onCreated: (id: string) => void; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const p = await createAdamProject(workspaceId, { title, topic });
      setOpen(false);
      setTitle("");
      setTopic("");
      onCreated(p.id);
      toast.success("Project created", { description: "Fill in the brief, then write the question page." });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the project");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={primary ? "default" : "outline"}>
          <Plus className="size-3.5" />
          <span className="ml-1.5">New project</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New research project</DialogTitle>
          <DialogDescription>One project per research question. You can refine the brief afterwards.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title, e.g. Retrieval for long-context QA" autoFocus />
          <textarea
            className="w-full rounded-md border bg-white px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[6rem]"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="The topic, in a sentence or a paragraph (optional now)"
          />
        </div>
        <DialogFooter>
          <Button onClick={create} disabled={busy || title.trim().length < 3}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
            <span className={busy ? "ml-1.5" : ""}>Create</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
