"use client";

import { workspace } from "@/db/database.types";
import { privateLogo, publicLogo, shareLogo } from "@/lib/dashboard-logos";
import { cn } from "@/lib/utils";
import { Check, CheckCheck, ChevronsUpDown } from "lucide-react";
import Link from "next/link";

interface WorkspaceSelectedProps {
  workspace: workspace;
  onClick?: (option: workspace) => void;
  enableRedirection: boolean;
  variant?: "default" | "dropdown";
  type?: "private" | "shared" | "collaborative";
  isSelected?: boolean;
}

const workspaceStyles = {
  private: {
    container:
      "hover:border hover:border-amber-700 hover:ring-2 hover:ring-amber-600",
    iconBg: "bg-amber-100",
    icon: privateLogo,
    label: "Private",
    textColor: "text-amber-700",
  },
  shared: {
    container:
      "hover:border hover:border-green-200 hover:ring-2 hover:ring-green-50",
    iconBg: "bg-green-100",
    icon: shareLogo,
    label: "Shared",
    textColor: "text-green-700",
  },
  collaborative: {
    container:
      "hover:border hover:border-purple-200 hover:ring-2 hover:ring-purple-50",
    iconBg: "bg-cyan-100",
    icon: publicLogo,
    label: "Collaborative",
    textColor: "text-cyan-700",
  },
};

export default function WorkspaceSelected({
  workspace,
  onClick,
  enableRedirection = true,
  variant = "default",
  type = "private",
  isSelected = false,
}: WorkspaceSelectedProps) {
  const styles = workspaceStyles[type];

  return (
    <Link
      href={enableRedirection ? `/dashboard/${workspace.id}` : ""}
      onClick={() => {
        if (onClick) onClick(workspace);
      }}
      className={cn(
        `w-full flex flex-row gap-2
      justify-center
      cursor-pointer 
      items-center 
      bg-white
      rounded-lg
      transition-colors duration-150 
      p-1
      border-transparent
      ${
        variant === "dropdown"
          ? "hover:bg-accent hover:text-accent-foreground my-2 "
          : "my-0 border border-accent"
      }`,
        isSelected && "bg-neura-dashboardBG"
      )}
    >
      <div
        className={cn(
          "p-1.5 rounded-lg flex justify-center items-center",
          styles.iconBg,
          styles.textColor
        )}
      >
        {styles.icon}
      </div>
      <div className="w-full flex items-center gap-2 justify-start">
        <div className="flex flex-col gap-0.5">
          <p className="text-md capitalize leading-none font-medium max-w-[180px] overflow-hidden overflow-ellipsis whitespace-nowrap">
            {workspace.title}
          </p>
          <p
            className={cn(
              "text-xs text-muted-foreground",
              isSelected && "text-foreground",
              styles.textColor
            )}
          >
            {styles.label}
          </p>
        </div>
      </div>
      <div className="flex justify-center items-center">
        {variant === "default" ? (
          <ChevronsUpDown size={20} className="text-muted-foreground w-fit" />
        ) : (
          isSelected && <Check size={18} className="text-foreground w-fit" />
        )}
      </div>
    </Link>
  );
}
