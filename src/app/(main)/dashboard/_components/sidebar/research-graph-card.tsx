import { sidebarCardActiveStyle, sidebarCardIconStyle, sidebarCardStyle } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { Network } from "lucide-react";
import NavLink from "./nav-link";

/** Sidebar card for the workspace research graph. Same design as the Research papers card. */
export default function ResearchGraphCard({ myWorkspaceId }: { myWorkspaceId: string }) {
  return (
    <NavLink
      href={`/dashboard/${myWorkspaceId}/graph`}
      className={sidebarCardStyle}
      activeClassName={sidebarCardActiveStyle}
    >
      <div className={cn(sidebarCardIconStyle, "text-sky-400")}>
        <Network size={13} strokeWidth={2.25} />
      </div>
      <p className="text-md font-medium">Research graph</p>
    </NavLink>
  );
}
