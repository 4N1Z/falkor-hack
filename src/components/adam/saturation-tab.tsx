"use client";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ClusterStat } from "@/lib/adam/saturation";
import type { ProjectStatus } from "@/lib/adam/status";
import { refreshAdam } from "@/lib/hooks/use-adam";
import { cn } from "@/lib/utils";
import { FileText, Loader2, RotateCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";

const key = (workspaceId: string, projectId: string) => `/api/adam/${projectId}/saturation?workspaceId=${workspaceId}`;
const fetcher = async (url: string) => {
  const r = await fetch(url);
  const b = await r.json();
  if (!r.ok) throw new Error(b.error ?? "Couldn't load saturation");
  return b as { clusters: ClusterStat[] };
};

/**
 * Phase bar · Saturation. One bar per cluster: how far the new-node rate has fallen toward
 * zero, with the new-nodes-per-paper series beside it. The bar measures whether the system
 * has stopped learning from the literature, not whether the literature is right.
 */
export function SaturationTab({ workspaceId, status }: { workspaceId: string; status: ProjectStatus }) {
  const projectId = status.project.id;
  const { data, error } = useSWR(key(workspaceId, projectId), fetcher, { refreshInterval: status.project.status === "running" ? 8000 : 0, keepPreviousData: true });
  const [busy, setBusy] = useState<string | null>(null);

  const post = async (body: Record<string, unknown>, label: string, done: string) => {
    setBusy(label);
    try {
      const r = await fetch(`/api/adam/${projectId}/saturation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, ...body }) });
      if (!r.ok) throw new Error((await r.json()).error ?? "Request failed");
      toast(done);
      await Promise.all([mutate(key(workspaceId, projectId)), refreshAdam(workspaceId, projectId)]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(null);
    }
  };

  const writeUp = async () => {
    setBusy("paper");
    try {
      const r = await fetch(`/api/adam/${projectId}/paper`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Couldn't write the paper");
      toast.success("Write-up saved", { description: `${b.title} is in the Adam folder, ${b.sections} sections, ${b.references} references.` });
      await refreshAdam(workspaceId, projectId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't write the paper");
    } finally {
      setBusy(null);
    }
  };

  if (error) return <p className="text-sm text-red-700">{error.message}</p>;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-2">
        <div>
          <h2 className="text-sm font-medium">Saturation by cluster</h2>
          <p className="text-xs text-muted-foreground">A cluster is saturated when its last ten papers added fewer than two new nodes between them. Methods can saturate while contradictions keep growing.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => post({ recompute: true }, "recompute", "Recomputing the bar")}>
            {busy === "recompute" ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
            <span className="ml-1.5">Recompute</span>
          </Button>
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => post({ resweep: true }, "resweep", "Re-sweep queued: papers that cited the core recently")}>
            Re-sweep recent citations
          </Button>
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={writeUp} title="Assemble this pass into a document in the workspace's Adam folder: introduction, related work, methods, hypotheses, plans, discussion, references">
            {busy === "paper" ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
            <span className="ml-1.5">Write up pass {status.project.pass}</span>
          </Button>
          <Button size="sm" disabled={busy !== null || status.project.status === "running"} onClick={() => post({ nextPass: true }, "next", `Pass ${status.project.pass + 1} started: back to the question with sharper sub-questions`)}>
            Start pass {status.project.pass + 1}
          </Button>
        </div>
      </header>

      {status.project.papers.length > 0 && (
        <section className="rounded-lg border bg-white px-4 py-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Write-ups</p>
          <ul className="flex flex-col gap-1">
            {status.project.papers.map((pp) => (
              <li key={pp.fileId} className="flex items-center gap-2">
                <FileText className="size-3.5 text-muted-foreground" />
                <a href={`/dashboard/${workspaceId}/${pp.fileId}`} className="hover:underline decoration-dotted">{pp.title}</a>
                <span className="text-xs text-muted-foreground">{new Date(pp.at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center"><Loader2 className="size-4 animate-spin" /> Loading…</div>
      ) : data.clusters.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-10 text-center text-sm text-muted-foreground">No clusters yet. The bar fills as the Extractor reads papers.</div>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.clusters.map((c) => (
            <li key={c.clusterId} className="rounded-lg border bg-white p-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_260px] items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <p className="text-sm font-medium truncate" title={c.label}>{c.label}</p>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] shrink-0", c.saturated ? "bg-emerald-50 text-emerald-700" : c.papers < 5 ? "bg-amber-50 text-amber-800" : "bg-sky-50 text-sky-700")}>
                    {c.saturated ? "saturated" : c.papers < 5 ? "thin" : "still learning"}
                  </span>
                </div>
                <Progress value={Math.round(c.fill * 100)} className="h-2" aria-label={`${c.label}: ${Math.round(c.fill * 100)}% saturated`} />
                <p className="text-xs text-muted-foreground mt-1.5 tabular-nums">
                  {c.papers} paper{c.papers === 1 ? "" : "s"} read · last {c.window} added {c.newNodesLast} new node{c.newNodesLast === 1 ? "" : "s"}
                </p>
              </div>
              <Sparkline series={c.series} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** New nodes per paper in reading order: one series, one hue, thin line, hover shows the paper. */
function Sparkline({ series }: { series: ClusterStat["series"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 260;
  const h = 56;
  const pad = 6;
  if (series.length === 0) return <div className="h-14 flex items-center text-xs text-muted-foreground">No papers yet</div>;
  const max = Math.max(1, ...series.map((s) => s.nodesNew));
  const x = (i: number) => (series.length === 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (series.length - 1));
  const y = (v: number) => h - pad - (v / max) * (h - 2 * pad);
  const path = series.map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(s.nodesNew).toFixed(1)}`).join(" ");
  const cur = hover !== null ? series[hover] : null;
  return (
    <div className="relative">
      <svg width={w} height={h} role="img" aria-label="New nodes per paper, in reading order" className="overflow-visible" onMouseLeave={() => setHover(null)}>
        <line x1={pad} x2={w - pad} y1={h - pad} y2={h - pad} stroke="currentColor" className="text-slate-200" strokeWidth={1} />
        <path d={path} fill="none" stroke="#0369a1" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {series.map((s, i) => (
          <g key={s.paperId + i}>
            <rect x={x(i) - Math.max(6, (w - 2 * pad) / series.length / 2)} y={0} width={Math.max(12, (w - 2 * pad) / series.length)} height={h} fill="transparent" onMouseEnter={() => setHover(i)} />
            <circle cx={x(i)} cy={y(s.nodesNew)} r={hover === i ? 5 : 3.5} fill={hover === i ? "#0369a1" : "#fff"} stroke="#0369a1" strokeWidth={2} />
          </g>
        ))}
      </svg>
      {cur && (
        <div className="absolute -top-1 left-0 -translate-y-full rounded-md border bg-white px-2 py-1 text-xs shadow-sm max-w-[260px]">
          <p className="font-medium truncate">{cur.title}</p>
          <p className="text-muted-foreground tabular-nums">{cur.nodesNew} new · {cur.nodesReused} reused</p>
        </div>
      )}
    </div>
  );
}
