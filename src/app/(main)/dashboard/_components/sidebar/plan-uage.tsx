'use client';

import { Progress } from "@/components/ui/progress";
import { Subscription } from "@/db/database.types";
import { MAX_FOLDERS_FREE_PLAN } from "@/lib/constants";
import { useAppState } from "@/lib/providers/state-providers";
import { useEffect, useState } from "react";

interface PlanUsageProps {
  foldersLength: number;
  subscription: Subscription | null;
}

const PlanUsage: React.FC<PlanUsageProps> = ({
  foldersLength,
  subscription,
}) => {
  const { workspaceId, state } = useAppState();
  const [usagePercentage, setUsagePercentage] = useState(
    (foldersLength / MAX_FOLDERS_FREE_PLAN) * 100
  );

  useEffect(() => {
    const stateFoldersLength = state.workspaces.find(
      (workspace) => workspace.id === workspaceId
    )?.folders.length;

    if (stateFoldersLength === undefined) return;
    setUsagePercentage((stateFoldersLength / MAX_FOLDERS_FREE_PLAN) * 100);
  }, [state, workspaceId]);

  const currentFolders = state.workspaces.find(
    (workspace) => workspace.id === workspaceId
  )?.folders.length || 0;

  return (
    <>
      {subscription?.status !== 'active' && (
        <div className="flex flex-col w-full gap-2 items-center justify-end border-t pt-2">
          <div className="w-full space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{currentFolders} folders</span>
              <span>of {MAX_FOLDERS_FREE_PLAN}</span>
            </div>
            <Progress value={usagePercentage} className="h-2" />
          </div>
        </div>
      )}
    </>
  );
};

export default PlanUsage;