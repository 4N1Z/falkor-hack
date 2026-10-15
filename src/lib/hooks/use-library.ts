"use client";

import type { LibraryPaper } from "@/app/api/papers/route";
import useSWR, { mutate } from "swr";

/**
 * One cached copy of the workspace library, shared by every view that shows it (dashboard
 * card, Research library dialog). Any import/upload calls `refreshLibrary`, so all views
 * update together instead of each holding its own stale fetch.
 */
export const libraryKey = (workspaceId: string) => `/api/papers?workspaceId=${workspaceId}`;

const fetcher = async (url: string): Promise<{ papers: LibraryPaper[] }> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Library request failed (${res.status})`);
  return res.json();
};

/** Papers added in the last 10 minutes that the Librarian hasn't finished indexing. */
const isIndexing = (papers: LibraryPaper[] | undefined) =>
  !!papers?.some((p) => !p.graph && Date.now() - new Date(p.createdAt).getTime() < 10 * 60_000);

export function useLibrary(workspaceId: string) {
  const { data, error, isLoading } = useSWR(libraryKey(workspaceId), fetcher, {
    // Poll only while something is being indexed, so status badges update on their own
    refreshInterval: (latest) => (isIndexing(latest?.papers) ? 3000 : 0),
    keepPreviousData: true,
  });
  return { papers: data?.papers ?? null, error, isLoading };
}

/** Re-fetch the library everywhere it's shown. */
export const refreshLibrary = (workspaceId: string) => mutate(libraryKey(workspaceId));
