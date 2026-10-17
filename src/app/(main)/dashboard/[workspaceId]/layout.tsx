import React from "react";
import Sidebar from "../_components/sidebar/sidebar";
import { SidebarShell } from "../_components/sidebar/sidebar-shell";
import WorkspaceChatPopup from "../_components/workspace-chat-popup";
import "./prosemirror.css";
import { checkWorkspaceAccess } from "@/db/actions/authorization-check";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function WorkspaceLayout(
  props: {
    children: React.ReactNode;
    params: Promise<{ workspaceId: string }>;
  }
) {
  const params = await props.params;

  const {
    children
  } = props;

  const session = await auth();
  if (!session?.user || session === null) redirect("/login");

  // console.log("Workspace Params ::", params.workspaceId);
  // We'll always have workspaceId here because of the directory structure
  const hasAccess = await checkWorkspaceAccess(
    params.workspaceId,
    session.user.id!
  );

  if (!hasAccess) {
    redirect("/dashboard");
  }

  return (
    <main className="flex flex-col h-screen  w-screen ">
      {process.env.SHOW_OUTRAGEOUS_CONTENT?.toLowerCase() === "true" && (
        <div className="bg-red-50 p-1 py-1.5 flex justify-center items-center">
          <p className="text-sm text-red-600">
            We're investigating an outage with one of our core service
            providers. Some features might be unavailable
          </p>
        </div>
      )}

      <div className="flex overflow-hidden">
        {/* Inside a document the sidebar folds to a strip, so the page is the text plus the research rail */}
        <SidebarShell workspaceId={params.workspaceId}>
          <Sidebar params={params} />
        </SidebarShell>
        <div className={`border-neutral-700 w-full relative overflow-auto flex-1`}>
          {children}
        </div>
        {/* Team chat popup (dashboard and graph pages; documents have it in the research rail) */}
        <WorkspaceChatPopup workspaceId={params.workspaceId} />
      </div>
    </main>
  );
}
