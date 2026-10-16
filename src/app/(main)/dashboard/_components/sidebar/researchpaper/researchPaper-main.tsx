import ResearchLibrary from "@/components/library/research-library";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { researchPaperLogo } from "@/lib/dashboard-logos";
import { cn } from "@/lib/utils";
import { sidebarCardIconStyle, sidebarCardStyle } from "@/lib/styles";

interface ResearchPaperProps {
  myWorkspaceId: string;
}

export default function ResearchPaperMain({ myWorkspaceId }: ResearchPaperProps) {
  return (
    <Dialog>
      <DialogTrigger className="w-full">
        <div className={sidebarCardStyle}>
          <div className={cn(sidebarCardIconStyle, "text-amber-500")}>{researchPaperLogo}</div>
          <p className="text-md font-medium">Research papers</p>
        </div>
      </DialogTrigger>
      <DialogContent className="flex h-[85dvh] max-h-[640px] w-full flex-col font-sans sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Research library</DialogTitle>
          <DialogDescription>
            Papers shared by everyone in this workspace, indexed into your research graph.
          </DialogDescription>
        </DialogHeader>
        <ResearchLibrary workspaceId={myWorkspaceId} />
      </DialogContent>
    </Dialog>
  );
}
