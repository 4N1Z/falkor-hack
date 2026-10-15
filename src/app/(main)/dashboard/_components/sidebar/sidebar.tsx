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
import UserProfile from "./user-profile";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import TestBtn from "@/components/test-btn";

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

  //   // Fetch all data in parallel for better performance
  //   const [
  //     subscriptionResponse,
  //     foldersResponse,
  //     sharedWorkspaces,
  //     privateWorkspaces,
  //     collaborativeWorkspaces,
  //   ] = await Promise.all([
  //     getUserSubscriptionUser(userData.user.id),
  //     getFolders(params.workspaceId),
  //     getSharedWorkspaces(userData.user.id),
  //     getPrivateWorkspaces(userData.user.id),
  //     getCollaborativeWorkspaces(userData.user.id),
  //   ]);

  //   if (subscriptionResponse.error || foldersResponse.error) {
  //     redirect("/dashboard");
  //   }

  // const allWorkspaces = [
  //   ...privateWorkspaces,
  //   ...collaborativeWorkspaces,
  //   ...sharedWorkspaces,
  // ];

  return (
    <aside
      className={cn(
        "hidden sm:flex m-2 border rounded-sm border-sky-100 sm:flex-col w-[320px] shrink-0 p-4 gap-4 bg-card-foreground font-sans h-full max-h-[97vh]",
        className
      )}
    >
      <div className="flex flex-col h-full">
        {/* Top Section - Always Visible */}
        <div className="space-y-2 flex-shrink-0">
          {/* <WorkspaceDropdown
              privateWorkspaces={privateWorkspaces}
              sharedWorkspaces={sharedWorkspaces}
              collaborativeWorkspaces={collaborativeWorkspaces}
              defaultValue={allWorkspaces.find(
                (workspace) => workspace.id === params.workspaceId
              )}
            /> */}
          <WorkspaceDropdown
            privateWorkspaces={privateWorkspaces}
            sharedWorkspaces={sharedWorkspaces}
            collaborativeWorkspaces={collaborativeWorkspaces}
            defaultValue={[
              ...privateWorkspaces,
              ...collaborativeWorkspaces,
              ...sharedWorkspaces,
            ].find((workspace) => workspace.id === params.workspaceId)}
            userId={userData.id!}
          />
          <NativeNavigation myWorkspaceId={params.workspaceId} userId={userData.id!} />
          <EnableAIWorkspace myWorkspaceId={params.workspaceId} />
        </div>

        {/* <TestBtn/> */}

        {/* Scrollable Content Area */}
        <div className="flex-1 min-h-0 mt-4">
          <ScrollArea className="h-full">
            {/* Folders Section */}
            <div className="space-y-4">
              <FoldersDropdownList
                workspaceFolders={folderData || []}
                workspaceId={params.workspaceId}
              />

              {/* Research Papers Section */}
              <div className="pt-4 border-t">
                <ResearchPaperMain myWorkspaceId={params.workspaceId} />
              </div>
            </div>

            <div
              className="pointer-events-none w-full absolute bottom-0 h-20 
                bg-gradient-to-t from-card-foreground to-transparent z-40"
              aria-hidden="true"
            />
          </ScrollArea>
        </div>
        {/* <NeuraAIBlock/> */}

        {/* User Profile - Fixed at Bottom */}
        <div className="flex-shrink-0 mt-4">
          <UserProfile
            user={userData}
            subscription={subscriptionData!}
            foldersLength={folderData?.length || 0}
          />
        </div>
      </div>
    </aside>
  );

  // redirect("/dashboard");
}
