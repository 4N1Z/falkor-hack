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

interface ResearchPaperProps {
  myWorkspaceId: string;
}

export default function ResearchPaperMain({ myWorkspaceId }: ResearchPaperProps) {
  return (
    <Dialog>
      <DialogTrigger className="w-full">
        <div
          className={cn(
            "flex gap-2 justify-start items-center p-1.5 border border-accent bg-white",
            "transition-[background-color,transform] duration-150 ease-out hover:bg-accent active:scale-[0.98] rounded-md"
          )}
        >
          <div className="bg-black p-2 text-amber-500 rounded-sm">{researchPaperLogo}</div>
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
