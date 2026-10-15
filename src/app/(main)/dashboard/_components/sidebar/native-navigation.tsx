import { ArchiveIcon, Diamond, HomeIcon, Settings, Trash2 } from "lucide-react";
import Link from "next/link";
import React from "react";
import Trash from "./trash/trash-main";
import SettingsMenu from "./settings/settings-main";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { navBtnstyle } from "@/lib/styles";
import CustomDialogTrigger from "@/components/custom-dialog";
import WorkspaceCreator from "@/components/workspace-creator";

interface NativeNavigationProps {
  myWorkspaceId: string;
  userId: string

  className?: string;
}

const NavItem = ({
  link,
  title,
  logo,
}: {
  link: string;
  title: string;
  logo: React.ReactNode;
}) => {
  return (
    <Link
      className={cn(
        `group/native flex items-start justify-start w-full text-neura-dashboardGray gap-2`,
        buttonVariants({ variant: "ghost" })
      )}
      href={link}
    >
      {logo}
      <p className="text-neura-dashboardGray">{title}</p>
    </Link>
  );
};

export default function NativeNavigation({myWorkspaceId,userId,className}:NativeNavigationProps) {
  return (
    <nav className={cn("my-1", className)}>
      <ul className="flex flex-col w-[100%]  justify-start">
        <li>
          <Link
            className={cn(navBtnstyle)}
            href={`/dashboard/${myWorkspaceId}`}
          >
            <HomeIcon size={18} className="text-neura-dashboardGray" />
            <p className="text-neura-dashboardGray">Dashboard</p>
          </Link>

          {/* <NavItem link={`/dashboard/${myWorkspaceId}`} title="Dashboard" logo={<HomeIcon size={18} className="text-neura-dashboardGray" />} /> */}
        </li>

        <li>
          <SettingsMenu>
            <div className={navBtnstyle}>
              <Settings size={18} />
              <span>Settings</span>
            </div>
          </SettingsMenu>
        </li>

        <li>
          <Trash>
            <div className={navBtnstyle}>
              <ArchiveIcon size={18} />
              <span>Archive</span>
            </div>
          </Trash>
        </li>

        {/* <div className="sticky bottom-0 w-full border-t z-50 p-2">
          <CustomDialogTrigger
            header="Create A Workspace"
            content={<WorkspaceCreator userId={userId}/>}
            description="Workspaces give you the power to collaborate with others. You can change your workspace privacy settings after creating the workspace too.">
            <div
              className="flex 
                  transition-colors duration-150 
                  hover:bg-muted 
                  justify-center 
                  items-center 
                  gap-2  font-medium text-neura-dashboardGray
                  text-primary
                  p-2 
                  w-full
                  rounded-md"
            >
              New workspace <span className=" font-bold">+</span>
            </div>
          </CustomDialogTrigger>
        </div> */}
      </ul>
    </nav>
  );
};


