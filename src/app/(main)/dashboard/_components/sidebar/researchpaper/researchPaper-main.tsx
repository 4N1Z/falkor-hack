import CustomDialogTrigger from "@/components/custom-dialog";
import ResearchPaperMenu from "./researchPaper-menu";
import { researchPaperLogo } from "@/lib/dashboard-logos";
import { cn } from "@/lib/utils";
import { dashboardCardStyle } from "@/lib/styles";
interface ResearchPaperProps {
  myWorkspaceId: string;
}

export default function ResearchPaperMain({
  myWorkspaceId,
}: ResearchPaperProps) {
  return (
    <CustomDialogTrigger
      header="Research Paper"
      content={<ResearchPaperMenu workspaceId={myWorkspaceId} />}
    >
      <div
        className={cn(
          " flex gap-2 justify-start items-center p-1.5  border border-accent bg-white ",
          "transition-all duration-500 hover:duration-500 gap-2 hover:bg-accent rounded-md"
        )}
      >
        <div className="bg-black p-2 text-amber-500 rounded-sm">
          {researchPaperLogo}
        </div>
        <p className="text-md font-medium">Research papers</p>
      </div>
    </CustomDialogTrigger>
  );
}
