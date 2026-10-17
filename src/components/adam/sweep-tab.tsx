"use client";

import type { SweepPaper } from "@/app/api/adam/[projectId]/sweep/route";
import { Button } from "@/components/ui/button";
import type { Ring, TriageLabel } from "@/lib/adam/agents/searcher";
import type { Coverage } from "@/lib/adam/coverage";
import type { ProjectStatus } from "@/lib/adam/status";
import { refreshAdam } from "@/lib/hooks/use-adam";
import { cn } from "@/lib/utils";
import { AlertTriangle, ExternalLink, FileText, Loader2, RotateCw, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";

interface SweepResponse {
  papers: SweepPaper[];
  coverage: Coverage | null;
  rings: { ring: Ring; status: string | null; round: number; result: Record<string, unknown> | null; error: string | null }[];
}

const sweepKey = (workspaceId: string, projectId: string) => `/api/adam/${projectId}/sweep?workspaceId=${workspaceId}`;
const fetcher = async (url: string) => {
  const r = await fetch(url);
  const b = await r.json();
  if (!r.ok) throw new Error(b.error ?? "Couldn't load the sweep");
  return b as SweepResponse;
};

const LABELS: { id: TriageLabel; label: string; tone: string }[] = [
  { id: "core", label: "Core", tone: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  { id: "contradicts", label: "Contradicts", tone: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  { id: "method_only", label: "Method", tone: "bg-violet-50 text-violet-700 ring-violet-600/20" },
  { id: "background", label: "Background", tone: "bg-slate-100 text-slate-600 ring-slate-500/20" },
  { id: "out_of_scope", label: "Out of scope", tone: "bg-slate-50 text-slate-400 ring-slate-400/20" },
];
const toneOf = (l: TriageLabel) => LABELS.find((x) => x.id === l)?.tone ?? "";

const RING_HELP: Record<Ring, string> = {
  seed: "Per sub-question: relevance, most-cited, most-recent, reviews; plus the field's vocabulary and your seeds",
  citation: "Backward through core papers' references, forward through the papers that cite them",
  adjacent: "The same problem under other names, and papers that share concepts with core papers but never cite them",
};

const ACCESS: Record<SweepPaper["accessStatus"], { label: string; tone: string }> = {
  full_text: { label: "Full text", tone: "text-emerald-700" },
  abstract_only: { label: "Abstract only", tone: "text-amber-700" },
  unavailable: { label: "No text", tone: "text-rose-700" },
  unknown: { label: "—", tone: "text-muted-foreground" },
};

/** Phase 1 · Sweep: the rings, what each found, coverage gaps, and the researcher's relabels and PDFs. */
export function SweepTab({ workspaceId, status }: { workspaceId: string; status: ProjectStatus }) {
  const projectId = status.project.id;
  const inFlight = status.project.status === "running" && status.project.phase === "sweep";
  const { data, error } = useSWR(sweepKey(workspaceId, projectId), fetcher, { refreshInterval: inFlight ? 4000 : 0, keepPreviousData: true });
  const [filter, setFilter] = useState<TriageLabel | "all">("all");
  const [ring, setRing] = useState<Ring | "all">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => Promise.all([mutate(sweepKey(workspaceId, projectId)), refreshAdam(workspaceId, projectId)]);

  const papers = useMemo(
    () => (data?.papers ?? []).filter((p) => (filter === "all" || p.label === filter) && (ring === "all" || p.ring === ring)),
    [data, filter, ring],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of data?.papers ?? []) c[p.label] = (c[p.label] ?? 0) + 1;
    return c;
  }, [data]);
  const subq = new Map(status.questionPage?.subquestions.map((q, i) => [q.id, `Q${i + 1}`]) ?? []);

  const relabel = async (p: SweepPaper, label: TriageLabel) => {
    setBusy(p.paperId);
    try {
      const r = await fetch(`/api/adam/${projectId}/sweep`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, paperId: p.paperId, label }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Couldn't relabel");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't relabel");
    } finally {
      setBusy(null);
    }
  };

  const rerun = async (r: Ring) => {
    setBusy(`ring:${r}`);
    try {
      const res = await fetch(`/api/adam/${projectId}/sweep`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, ring: r }) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't queue the ring");
      toast(`${r} ring queued`, { description: "Runs when the project is running." });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't queue the ring");
    } finally {
      setBusy(null);
    }
  };

  if (error) return <p className="text-sm text-red-700">{error.message}</p>;
  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
        <Loader2 className="size-4 animate-spin" /> Loading the sweep…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 md:grid-cols-3">
        {data.rings.map((r) => (
          <div key={r.ring} className="rounded-lg border bg-white p-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium capitalize">{r.ring} ring</h3>
              <RingBadge status={r.status} round={r.round} />
              <button
                className="ml-auto text-muted-foreground hover:text-foreground disabled:opacity-40"
                onClick={() => rerun(r.ring)}
                disabled={busy !== null || r.status === "running" || r.status === "queued" || !status.questionPage?.approvedAt}
                title="Run this ring again"
                aria-label={`Run the ${r.ring} ring again`}
              >
                {busy === `ring:${r.ring}` ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{RING_HELP[r.ring]}</p>
            {r.result && typeof r.result.candidates === "number" && (
              <p className="text-xs tabular-nums">
                {String(r.result.candidates)} candidates · {String(r.result.readFully)} read in full · {String(r.result.newPapers)} new in the library
              </p>
            )}
            {r.error && <p className="text-xs text-rose-700">{r.error}</p>}
          </div>
        ))}
      </section>

      {data.coverage && (data.coverage.gaps.length > 0 || data.coverage.adjacentMissing.length > 0) && (
        <section className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm flex flex-col gap-1.5">
          <p className="font-medium text-amber-800 flex items-center gap-1.5">
            <AlertTriangle className="size-4" /> Coverage check
          </p>
          {data.coverage.cores
            .filter((c) => data.coverage!.gaps.includes(c.paperId))
            .map((c) => (
              <p key={c.paperId} className="text-amber-800">
                Only {c.covered} of the {c.refs} most-cited references of “{c.title}” are in the sweep.
              </p>
            ))}
          {data.coverage.adjacentMissing.length > 0 && (
            <p className="text-amber-800">No papers found for the adjacent terms: {data.coverage.adjacentMissing.join(", ")}.</p>
          )}
        </section>
      )}

      <section className="rounded-lg border bg-white">
        <header className="px-3 py-2 border-b flex flex-wrap items-center gap-2 text-sm">
          <div className="flex items-center gap-1">
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
              All <span className="text-muted-foreground tabular-nums">{data.papers.length}</span>
            </FilterChip>
            {LABELS.filter((l) => l.id !== "out_of_scope").map((l) => (
              <FilterChip key={l.id} active={filter === l.id} onClick={() => setFilter(l.id)}>
                {l.label} <span className="text-muted-foreground tabular-nums">{counts[l.id] ?? 0}</span>
              </FilterChip>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1">
            {(["all", "seed", "citation", "adjacent"] as const).map((r) => (
              <FilterChip key={r} active={ring === r} onClick={() => setRing(r)}>
                {r === "all" ? "All rings" : r}
              </FilterChip>
            ))}
          </div>
        </header>
        {papers.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground text-center">
            {data.papers.length === 0 ? "Nothing swept yet. Approve the question page and press Run." : "No papers match these filters."}
          </p>
        ) : (
          <ul className="divide-y max-h-[65vh] overflow-y-auto">
            {papers.map((p) => (
              <PaperRow key={p.paperId} p={p} cluster={p.clusterId ? subq.get(p.clusterId) ?? p.clusterId : null} busy={busy === p.paperId} onRelabel={relabel} workspaceId={workspaceId} projectId={projectId} onChanged={refresh} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RingBadge({ status, round }: { status: string | null; round: number }) {
  if (!status) return <span className="text-[11px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">not run</span>;
  const tone = status === "done" ? "bg-emerald-50 text-emerald-700" : status === "failed" ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-700";
  return (
    <span className={cn("text-[11px] rounded-full px-2 py-0.5 flex items-center gap-1", tone)}>
      {(status === "running" || status === "queued") && <Loader2 className="size-3 animate-spin" />}
      {status}
      {round > 1 ? ` · round ${round}` : ""}
    </span>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn("rounded-full px-2.5 py-0.5 text-xs transition-colors", active ? "bg-foreground text-background" : "hover:bg-accent")}>
      {children}
    </button>
  );
}

function PaperRow({
  p,
  cluster,
  busy,
  onRelabel,
  workspaceId,
  projectId,
  onChanged,
}: {
  p: SweepPaper;
  cluster: string | null;
  busy: boolean;
  onRelabel: (p: SweepPaper, label: TriageLabel) => void;
  workspaceId: string;
  projectId: string;
  onChanged: () => Promise<unknown>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const href = p.doi ? `https://doi.org/${p.doi}` : p.arxivId ? `https://arxiv.org/abs/${p.arxivId}` : null;
  const needsPdf = p.pgPaperId && p.accessStatus !== "full_text" && (p.label === "core" || p.label === "contradicts" || p.label === "method_only");

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("workspaceId", workspaceId);
      form.set("pgPaperId", p.pgPaperId!);
      const r = await fetch(`/api/adam/${projectId}/pdf`, { method: "POST", body: form });
      if (!r.ok) throw new Error((await r.json()).error ?? "Upload failed");
      toast.success("PDF supplied", { description: "The Librarian is reading it in full." });
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <li className="px-3 py-2 text-sm flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="font-medium leading-snug truncate" title={p.title}>
            {p.title}
          </p>
          {href && (
            <a href={href} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5" aria-label="Open paper">
              <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
        <p className="text-xs text-muted-foreground flex flex-wrap gap-x-2 mt-0.5">
          {p.year && <span>{p.year}</span>}
          {p.venue && <span className="truncate max-w-[16rem]">{p.venue}</span>}
          <span>{p.citationCount} cites</span>
          <span className="capitalize">{p.ring} ring</span>
          {cluster && <span>{cluster}</span>}
          <span className={ACCESS[p.accessStatus]?.tone}>
            {ACCESS[p.accessStatus]?.label}
            {p.chunks ? ` · ${p.chunks} passages` : ""}
          </span>
          {p.ingestState === "indexing" && (
            <span className="text-sky-700 flex items-center gap-1"><Loader2 className="size-3 animate-spin" />indexing</span>
          )}
          {p.userLabel && <span className={p.userLabel === "trusted" ? "text-emerald-700" : "text-rose-700"}>{p.userLabel} seed</span>}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {needsPdf && (
          <>
            <input ref={fileRef} type="file" accept=".pdf,.docx,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => fileRef.current?.click()} disabled={uploading} title="Supply the PDF so it can be read in full">
              {uploading ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
              <span className="ml-1">PDF</span>
            </Button>
          </>
        )}
        <select
          value={p.label}
          onChange={(e) => onRelabel(p, e.target.value as TriageLabel)}
          disabled={busy}
          className={cn("rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset bg-white cursor-pointer", toneOf(p.label), p.decidedBy && "font-semibold")}
          title={p.decidedBy ? "Your label (outranks the agent's)" : `Agent label · confidence ${Math.round(p.confidence * 100)}%`}
        >
          {LABELS.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
        {p.chunks > 0 && <FileText className="size-3.5 text-muted-foreground" aria-label="Full text indexed" />}
      </div>
    </li>
  );
}
