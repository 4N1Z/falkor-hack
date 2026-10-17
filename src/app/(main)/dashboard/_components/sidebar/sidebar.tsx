import {
  getCollaborativeWorkspaces,
  getFolders,
  getPrivateWorkspaces,
  getSharedWorkspaces,
} from "@/db/actions/action-workspace";
import { getUserSubscriptionUser } from "@/db/actions/get-user-subscription";
import { cn } from "@/lib/utils";
import WorkspaceDropdown from "./workspace-dropdown";
import NativeNavigation from "./native-navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import FoldersDropdownList from "./folders-list";
import EnableAIWorkspace from "./enable-ai-workspace";
import ResearchPaperMain from "./researchpaper/researchPaper-main";
import ResearchGraphCard from "./research-graph-card";
import AdamCard from "./adam-card";
import UserProfile from "./user-profile";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import TestBtn from "@/components/test-btn";
import { TooltipProvider } from "@/components/ui/tooltip";

interface SidebarProps {
  params: {
    workspaceId: string;
  };
  className?: string;
}

export default async function Sidebar({ params, className }: SidebarProps) {

  const session = await auth();
  if (!session?.user || session.user === null) redirect("/login");

  const userData = session.user;

  const { data: subscriptionData, error: subscriptionError } =
    await getUserSubscriptionUser(userData.id || "");

  const { data: folderData, error: folderError } = await getFolders(
    params.workspaceId
  );

  if (subscriptionError || folderError) redirect("/dashboard");

  const [sharedWorkspaces, privateWorkspaces, collaborativeWorkspaces] =
    await Promise.all([
      getSharedWorkspaces(userData.id!),
      getPrivateWorkspaces(userData.id!),
      getCollaborativeWorkspaces(userData.id!),
    ]);


  return (
    <TooltipProvider delayDuration={400} skipDelayDuration={300}>
    <aside
      className={cn(
        // A definite height (viewport minus the margins) is what lets the folder list scroll under the profile card
        "hidden sm:flex m-2 border rounded-sm border-sky-100 sm:flex-col w-[320px] shrink-0 p-2.5 gap-2 bg-card-foreground font-sans h-[calc(100vh-1rem)] max-h-[calc(100vh-1rem)] overflow-hidden",
        className
      )}
    >
      <div className="flex flex-col h-full min-h-0">
        {/* Top Section - Always Visible */}
        <div className="space-y-2 flex-shrink-0">

          <WorkspaceDropdown
            privateWorkspaces={privateWorkspaces}
            sharedWorkspaces={sharedWorkspaces}
            collaborativeWorkspaces={collaborativeWorkspaces}
            defaultValue=
            {[
              ...privateWorkspaces,
              ...collaborativeWorkspaces,
              ...sharedWorkspaces,
            ].find((workspace) => workspace.id === params.workspaceId)}
            userId={userData.id!}
          />
          <NativeNavigation myWorkspaceId={params.workspaceId} userId={userData.id!} />
          <EnableAIWorkspace myWorkspaceId={params.workspaceId} />

          {/* Research: library dialog + graph page, same card design */}
          <div className="space-y-1.5">
            <ResearchPaperMain myWorkspaceId={params.workspaceId} />
            <ResearchGraphCard myWorkspaceId={params.workspaceId} />
            <AdamCard myWorkspaceId={params.workspaceId} />
          </div>
        </div>

        {/* <TestBtn/> */}

        {/* Scrollable Content Area */}
        <div className="flex-1 min-h-0 mt-2">
          <ScrollArea className="h-full [&_[data-radix-scroll-area-viewport]>div]:!block [&_[data-radix-scroll-area-viewport]]:!overflow-x-hidden">
            {/* Folders Section */}
            <div className="space-y-2">
              <FoldersDropdownList
                workspaceFolders={folderData || []}
                workspaceId={params.workspaceId}
              />
            </div>

            <div
              className="pointer-events-none w-full absolute bottom-0 h-20 
                bg-gradient-to-t from-card-foreground to-transparent z-40"
              aria-hidden="true"
            />
          </ScrollArea>
        </div>

        {/* User Profile - Fixed at Bottom */}
        <div className="flex-shrink-0 mt-2">
          <UserProfile
            user={userData}
            subscription={subscriptionData!}
            foldersLength={folderData?.length || 0}
          />
        </div>
      </div>
    </aside>
    </TooltipProvider>
  );
}
