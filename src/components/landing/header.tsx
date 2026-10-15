"use client";

import { ssw_logo } from "@/lib/logos";
import Link from "next/link";
import React, { useState } from "react";
import {
  NavigationMenuLink,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "../ui/button";


const routes = [
  {
    title: "Features",
    href: "#features",
  },
  { title: "dashboard", href: "#features" },
];

const components: { title: string; href: string; description: string }[] = [
  {
    title: "Alert Dialog",
    href: "#",
    description:
      "A modal dialog that interrupts the user with important content and expects a response.",
  },
  {
    title: "Hover Card",
    href: "#",
    description:
      "For sighted users to preview content available behind a link.",
  },
  {
    title: "Progress",
    href: "#",
    description:
      "Displays an indicator showing the completion progress of a task, typically displayed as a progress bar.",
  },
  {
    title: "Scroll-area",
    href: "#",
    description: "Visually or semantically separates content.",
  },
  {
    title: "Tabs",
    href: "#",
    description:
      "A set of layered sections of content—known as tab panels—that are displayed one at a time.",
  },
  {
    title: "Tooltip",
    href: "#",
    description:
      "A popup that displays information related to an element when the element receives keyboard focus or the mouse hovers over it.",
  },
];

export default async function Header() {
  const [path, setPath] = useState("#dashboard");


  return (
    <header className="flex justify-center items-center p-2 font-sans border-b">
      <Link href={"/"} className="flex flex-col md:flex-row gap-2 w-full">
        {/* <div className=" object-contain ">{ssw_logo}</div> */}
        <span className="leading-none"> neura query</span>
      </Link>

   
      <aside
        className="flex
        w-full
        gap-2
        justify-end
      "
      >
        <Link
          href={"/login"}
          className={buttonVariants({ variant: "default" })}
        >
          Login
        </Link>
        <Link
          href={"/signup"}
          className={buttonVariants({ variant: "outline" })}
        >
          Sign Up
        </Link>
      </aside>
    </header>
  );
}

const ListItem = React.forwardRef<
  React.ElementRef<"a">,
  React.ComponentPropsWithoutRef<"a">
>(({ className, title, children, ...props }, ref) => {
  return (
    <li>
      <NavigationMenuLink asChild>
        <a
          ref={ref}
          className={cn(
            "group block select-none space-y-1 font-medium leading-none"
          )}
          {...props}
        >
          <div className="text-black text-sm font-medium leading-none">
            {title}
          </div>
          <p
            className="group-hover:text-black/70
            line-clamp-2
            text-sm
            leading-snug
            text-black/40
          "
          >
            {children}
          </p>
        </a>
      </NavigationMenuLink>
    </li>
  );
});

ListItem.displayName = "ListItem";
