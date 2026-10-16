import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Sparkles } from "lucide-react";

// TODO : add the logic to take all the details from the workspace and then vectoirise.
// TODO : add the logic for mindMap here
// Until that lands the toggle is disabled and clearly marked, instead of a live-looking switch that does nothing.
export default function EnableAIWorkspace({
  myWorkspaceId,
}: {
  myWorkspaceId: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 my-2 w-full rounded-md border border-sky-100 bg-white px-2 py-2">
      <Label
        htmlFor={`workspace-ai-${myWorkspaceId}`}
        className="flex items-center gap-2 text-sm text-neura-dashboardGray"
      >
        <Sparkles size={16} className="text-primary" />
        Workspace AI chat
        <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
          Soon
        </span>
      </Label>
      <Switch id={`workspace-ai-${myWorkspaceId}`} disabled />
    </div>
  );
}
