// Saturation (spec, "Saturation bar and stopping rules"). "I've read enough" is not a stopping
// rule; the system stops a cluster when new papers stop adding new nodes. For each paper the
// Extractor records how many nodes it added versus reused (entity resolution makes "reused"
// meaningful); per cluster the bar is the inverse of the new-node rate over the last papers.
// Shown per cluster, so methods may saturate while contradictions keep growing. The bar
// measures whether the system has stopped learning from the literature, not whether the
// literature is right: the Falsifier is for that.

import type { Graph } from "falkordb";
import { BRIEF_CLUSTERS, CLUSTER_STATS, PAPER_NODE_SERIES, SET_BRIEF_THIN, UPSERT_CLUSTER_STAT } from "./queries-saturation";
import type { QuestionPage } from "./question-page";
import { parseJson } from "./types";

/** The last N core papers must add fewer than THRESHOLD new nodes between them for a cluster to count as saturated. */
export const SATURATION_WINDOW = 10;
export const SATURATION_THRESHOLD = 2;
/** With fewer papers than this, a cluster is never called saturated: too little has been read. */
export const MIN_PAPERS = 5;

export interface ClusterStat {
  clusterId: string;
  label: string;
  papers: number;
  newNodesLast: number;
  window: number;
  /** New nodes per paper, in reading order */
  series: { paperId: string; title: string; nodesNew: number; nodesReused: number; at: number }[];
  saturated: boolean;
  /** 0..1 for the bar: how far the new-node rate has fallen toward zero */
  fill: number;
  updatedAt: number | null;
  pass: number;
}

const params = <T>(p: T) => ({ params: p as never });

export async function computeSaturation(graph: Graph, projectId: string, pass: number, page: QuestionPage | null): Promise<ClusterStat[]> {
  const rows = (await graph.roQuery<{ clusterId: string; community: string; paperId: string; title: string; extractedAt: number; nodesNew: number; nodesReused: number; label: string }>(PAPER_NODE_SERIES, params({ projectId }))).data ?? [];
  const labelOf = new Map(page?.subquestions.map((q, i) => [q.id, `Q${i + 1} · ${q.text.slice(0, 70)}`]) ?? []);
  const byCluster = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.clusterId || "unassigned";
    byCluster.set(k, [...(byCluster.get(k) ?? []), r]);
  }
  const stats: ClusterStat[] = [];
  for (const [clusterId, papers] of byCluster) {
    const window = papers.slice(-SATURATION_WINDOW);
    const newNodesLast = window.reduce((s, p) => s + p.nodesNew, 0);
    const earlyRate = papers.slice(0, Math.max(1, Math.min(SATURATION_WINDOW, Math.ceil(papers.length / 2)))).reduce((s, p) => s + p.nodesNew, 0) / Math.max(1, Math.min(SATURATION_WINDOW, Math.ceil(papers.length / 2)));
    const lateRate = newNodesLast / Math.max(1, window.length);
    const fill = papers.length < MIN_PAPERS ? Math.min(0.3, papers.length / MIN_PAPERS) : earlyRate <= 0 ? 1 : Math.max(0, Math.min(1, 1 - lateRate / earlyRate));
    stats.push({
      clusterId,
      label: labelOf.get(clusterId) ?? (clusterId === "unassigned" ? "Unassigned" : clusterId),
      papers: papers.length,
      newNodesLast,
      window: window.length,
      series: papers.map((p) => ({ paperId: p.paperId, title: p.title, nodesNew: p.nodesNew, nodesReused: p.nodesReused, at: p.extractedAt })),
      saturated: papers.length >= MIN_PAPERS && window.length >= Math.min(SATURATION_WINDOW, MIN_PAPERS) && newNodesLast < SATURATION_THRESHOLD,
      fill,
      updatedAt: Date.now(),
      pass,
    });
  }
  // Clusters with no extracted paper yet still show on the bar
  for (const q of page?.subquestions ?? []) {
    if (!byCluster.has(q.id)) stats.push({ clusterId: q.id, label: labelOf.get(q.id)!, papers: 0, newNodesLast: 0, window: 0, series: [], saturated: false, fill: 0, updatedAt: Date.now(), pass });
  }
  if (stats.length) {
    await graph.query(
      UPSERT_CLUSTER_STAT,
      params({ projectId, pass, at: Date.now(), rows: stats.map((s) => ({ clusterId: s.clusterId, label: s.label, papers: s.papers, newNodesLast: s.newNodesLast, window: s.window, series: JSON.stringify(s.series.slice(-40)), saturated: s.saturated, fill: s.fill })) }),
    );
  }
  // A brief that rests on a thin cluster is flagged
  const briefClusters = (await graph.roQuery<{ hypothesisId: string; clusterId: string; claims: number }>(BRIEF_CLUSTERS, params({ projectId }))).data ?? [];
  const thinByBrief = new Map<string, string[]>();
  for (const bc of briefClusters) {
    const st = stats.find((s) => s.clusterId === (bc.clusterId || "unassigned"));
    if (st && st.papers < MIN_PAPERS) thinByBrief.set(bc.hypothesisId, [...(thinByBrief.get(bc.hypothesisId) ?? []), st.label]);
  }
  const briefIds = [...new Set(briefClusters.map((b) => b.hypothesisId))];
  if (briefIds.length) await graph.query(SET_BRIEF_THIN, params({ at: Date.now(), rows: briefIds.map((id) => ({ id, thin: [...new Set(thinByBrief.get(id) ?? [])] })) }));
  return stats;
}

export async function clusterStats(graph: Graph, projectId: string): Promise<ClusterStat[]> {
  const rows = (await graph.roQuery<Omit<ClusterStat, "series"> & { series: string }>(CLUSTER_STATS, params({ projectId }))).data ?? [];
  return rows.map((r) => ({ ...r, series: parseJson(r.series, []) }));
}
