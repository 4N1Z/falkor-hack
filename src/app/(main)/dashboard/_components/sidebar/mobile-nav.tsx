"use client";
import { Home, Menu } from "lucide-react";
import React, { useState } from "react";

import clsx from "clsx";
import { ssw_logo } from "@/lib/logos";

interface MobileSidebarProps {
  children: React.ReactNode;
}

export const nativeNavigations = [
  {
    title: "Sidebar",
    id: "sidebar",
    customIcon: Menu,
  },
  {
    title: "Pages",
    id: "pages",
    customIcon: Home,
  },
] as const;

const MobileSidebar: React.FC<MobileSidebarProps> = ({ children }) => {
  const [selectedNav, setSelectedNav] = useState("");
  return (
    <>
      {selectedNav === "sidebar" && (
        <div className="animate-fadeIn">{children}</div>
      )}
      <nav
        className="bg-black/10
      backdrop-blur-lg
      sm:hidden 
      fixed 
      z-50 
      bottom-0 
      right-0 
      left-0
      "
      >
        <ul
          className="flex 
        justify-between 
        items-center 
        p-4"
        >
          {nativeNavigations.map((item) => (
            <li key={item.id}>
            <button
              type="button"
              className="flex items-center flex-col justify-center transition-transform duration-150 ease-out active:scale-95"
              onClick={() => {
                setSelectedNav(item.id);
              }}
            >
              <item.customIcon></item.customIcon>
              <small
                className={clsx("transition-colors duration-150", {
                  "text-muted-foreground": selectedNav !== item.id,
                })}
              >
                {item.title}
              </small>
            </button>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
};

export default MobileSidebar;
