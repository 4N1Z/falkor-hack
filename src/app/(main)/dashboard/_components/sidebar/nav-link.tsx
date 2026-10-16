"use client";

import { cn } from "@/lib/utils";
import { navBtnstyle, navBtnActiveStyle } from "@/lib/styles";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

/**
 * Sidebar link that highlights itself on the matching route.
 * `exact` matches only that URL (Dashboard), otherwise any sub-route counts.
 */
export default function NavLink({
  href,
  exact,
  className,
  activeClassName = navBtnActiveStyle,
  children,
}: {
  href: string;
  exact?: boolean;
  className?: string;
  activeClassName?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      data-active={active || undefined}
      className={cn(className ?? navBtnstyle, active && activeClassName)}
    >
      {children}
    </Link>
  );
}
