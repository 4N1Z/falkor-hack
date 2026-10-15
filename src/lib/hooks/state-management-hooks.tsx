"use client";

import { useMemo } from "react";
import { useAppState } from "../providers/state-providers";
import { LoadingKeys } from "../types";

export const useSelectedFile = (fileId: string) => {
  const { state, workspaceId, folderId } = useAppState();

  return useMemo(() => {
    return state.workspaces
      .find((w) => w.id === workspaceId)
      ?.folders.find((f) => f.id === folderId)
      ?.files.find((f) => f.id === fileId);
  }, [state.workspaces, workspaceId, folderId, fileId]);
};

export function useWorkspaceFiles(workspaceId: string) {
  // console.log("I am selecting workspace hook :: ", workspaceId);
  const { state } = useAppState();

  return useMemo(() => {
    const workspace = state.workspaces.find((w) => w.id === workspaceId);

    // Sort files by `updatedAt` and take the top 4
    return (
      workspace?.folders
        .flatMap((f) => f.files)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 4) || []
    );
  }, [state.workspaces, workspaceId]);
}

export const useLoadingStatus = (key: LoadingKeys) => {
    const { state } = useAppState();
    return {
      isLoading: state.loading[key] || false,
      error: state.errors[key]
    };
  };