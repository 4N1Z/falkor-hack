import { sidebarCardActiveStyle, sidebarCardIconStyle, sidebarCardStyle } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { FlaskConical } from "lucide-react";
import NavLink from "./nav-link";

/** Sidebar card for Adam, the research-agent workbench. Same design as the graph card. */
export default function AdamCard({ myWorkspaceId }: { myWorkspaceId: string }) {
  return (
    <NavLink href={`/dashboard/${myWorkspaceId}/adam`} className={sidebarCardStyle} activeClassName={sidebarCardActiveStyle}>
      <div className={cn(sidebarCardIconStyle, "text-amber-300")}>
        <FlaskConical size={13} strokeWidth={2.25} />
      </div>
      <p className="text-md font-medium">Adam</p>
    </NavLink>
  );
}
