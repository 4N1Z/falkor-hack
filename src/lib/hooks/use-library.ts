"use client";

import type { GraphIndexPaper, GraphIndexTotals } from "@/app/api/papers/graph-index/route";
import type { LibraryPaper } from "@/app/api/papers/route";
import useSWR, { mutate } from "swr";

/**
 * One cached copy of the workspace library, shared by every view that shows it (dashboard
 * card, Research library dialog). Any import/upload calls `refreshLibrary`, so all views
 * update together instead of each holding its own stale fetch.
 */
export const libraryKey = (workspaceId: string) => `/api/papers?workspaceId=${workspaceId}`;
export const graphIndexKey = (workspaceId: string) => `/api/papers/graph-index?workspaceId=${workspaceId}`;

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
};

const isIndexing = (papers: LibraryPaper[] | undefined) => !!papers?.some((p) => p.index.state === "indexing");

export function useLibrary(workspaceId: string) {
  const { data, error } = useSWR(libraryKey(workspaceId), fetcher<{ papers: LibraryPaper[]; graphReachable: boolean }>, {
    // Poll only while something is being indexed, so status badges update on their own
    refreshInterval: (latest) => (isIndexing(latest?.papers) ? 3000 : 0),
    keepPreviousData: true,
  });
  return { papers: data?.papers ?? null, graphReachable: data?.graphReachable ?? true, error };
}

/** What FalkorDB holds for this workspace (all collaborators, totals). */
export function useGraphIndex(workspaceId: string, poll: boolean) {
  const { data, error } = useSWR(
    graphIndexKey(workspaceId),
    fetcher<{ papers: GraphIndexPaper[]; totals: GraphIndexTotals | null }>,
    { refreshInterval: poll ? 4000 : 0, keepPreviousData: true },
  );
  return { papers: data?.papers ?? null, totals: data?.totals ?? null, error };
}

/** Re-fetch the library (and the graph index) everywhere they're shown. */
export const refreshLibrary = (workspaceId: string) =>
  Promise.all([mutate(libraryKey(workspaceId)), mutate(graphIndexKey(workspaceId))]);

/** Re-run indexing for some papers, or the whole library when `paperIds` is omitted. */
export async function reindexPapers(workspaceId: string, paperIds?: string[]): Promise<number> {
  const res = await fetch("/api/papers/reindex", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, paperIds }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Couldn't start re-indexing");
  await refreshLibrary(workspaceId);
  return body.queued as number;
}
