"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setWorkspaceChatVisible, useWorkspaceChatVisible } from "@/lib/chat/visibility";
import { Sparkles } from "lucide-react";

/**
 * Shows or hides the Workspace AI chat card on the dashboard. Remembered per browser. The chat
 * tab in the editor's research rail is always available regardless of this switch.
 */
export default function EnableAIWorkspace({ myWorkspaceId }: { myWorkspaceId: string }) {
  const visible = useWorkspaceChatVisible();
  const id = `workspace-ai-${myWorkspaceId}`;
  return (
    <div className="my-2 flex w-full items-center justify-between gap-2 rounded-md border border-sky-100 bg-white px-2 py-2">
      <Label htmlFor={id} className="flex items-center gap-2 text-sm text-neura-dashboardGray">
        <Sparkles size={16} className="text-primary" />
        Workspace AI chat
      </Label>
      <Switch id={id} checked={visible} onCheckedChange={setWorkspaceChatVisible} title="Show the team chat on the workspace dashboard" />
    </div>
  );
}
