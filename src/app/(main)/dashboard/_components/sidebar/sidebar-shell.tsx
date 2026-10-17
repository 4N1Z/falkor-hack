"use client";

import { cn } from "@/lib/utils";
import { LayoutDashboard, Network, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const press = "transition-transform duration-150 ease-out active:scale-[0.96]";

/**
 * Wraps the (server-rendered) workspace sidebar. Inside a document, the sidebar folds to a
 * 48px strip so the page is the text plus the research rail; the full sidebar is one click
 * away and stays mounted, so its state survives. Everywhere else it is shown as before.
 */
export function SidebarShell({ workspaceId, children }: { workspaceId: string; children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  // /dashboard/{ws}/{fileId}, but not /dashboard/{ws}/graph
  const inEditor = /^\/dashboard\/[^/]+\/(?!graph(?:\/|$))[^/]+/.test(pathname);
  return <Shell key={pathname} inEditor={inEditor} workspaceId={workspaceId}>{children}</Shell>;
}

function Shell({ inEditor, workspaceId, children }: { inEditor: boolean; workspaceId: string; children: React.ReactNode }) {
  // Manual override for this document only (remounts per route via the key above)
  const [expanded, setExpanded] = useState(false);
  const collapsed = inEditor && !expanded;

  return (
    <>
      {/* display: contents keeps the sidebar a direct flex child of the layout row */}
      <div className={collapsed ? "hidden" : "contents"}>{children}</div>
      {inEditor && !collapsed && (
        // The sidebar is 320px wide with an 8px margin, so this sits on its top-right corner
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-label="Hide sidebar"
          title="Hide sidebar"
          className={cn(
            "fixed left-[296px] top-4 z-20 flex size-7 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-sm hover:text-foreground",
            press,
          )}
        >
          <PanelLeftClose className="size-4" />
        </button>
      )}

      {collapsed && (
        <aside
          aria-label="Workspace"
          className="m-2 flex h-full max-h-[97vh] w-12 shrink-0 flex-col items-center gap-1 rounded-sm border border-sky-100 bg-card-foreground p-1.5 font-sans animate-in fade-in-0 duration-150 motion-reduce:animate-none"
        >
          <StripButton onClick={() => setExpanded(true)} label="Show sidebar">
            <PanelLeftOpen className="size-4" />
          </StripButton>
          <span aria-hidden className="my-1 h-px w-6 bg-border" />
          <StripLink href={`/dashboard/${workspaceId}`} label="Dashboard">
            <LayoutDashboard className="size-4" />
          </StripLink>
          <StripLink href={`/dashboard/${workspaceId}/graph`} label="Research graph">
            <Network className="size-4" />
          </StripLink>
        </aside>
      )}
    </>
  );
}

const stripItem = cn(
  "flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  press,
);

function StripButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={stripItem}>
      {children}
    </button>
  );
}

function StripLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <NextLink href={href} aria-label={label} title={label} className={stripItem}>
      {children}
    </NextLink>
  );
}
