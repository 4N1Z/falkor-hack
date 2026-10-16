"use client";

import { Command } from "cmdk";
import { cn } from "@/lib/utils";
import { EditorCommandItem } from "./headless/index";
import type { SuggestionItem } from "./extensions/slash-command";
import { suggestionItems } from "./slash-command";

// Icon tiles in the landing page's plugin style (see buttonVariants pluginNormal / pluginBlue / pluginYellow),
// scaled down for a 40px row. No hover motion: this menu is keyboard-driven and opened constantly.
const TILE: Record<NonNullable<SuggestionItem["tone"]>, string> = {
  normal: "bg-white border border-black/5 shadow-[0_1px_2px_rgba(0,30,51,0.06)] text-[#001E33]",
  blue:
    "border border-secondary-foreground bg-[linear-gradient(115deg,#BCE5FF_12.84%,#DCECFE_93.66%)] " +
    "shadow-[inset_-3px_-3px_6px_rgba(238,244,251,0.5),0_3px_6px_rgba(109,205,247,0.3)]",
  yellow:
    "border border-[#FCE1A1] bg-[linear-gradient(140deg,#FDE1BD_7.44%,#FCF0A9_92.29%)] " +
    "shadow-[0_3px_6px_rgba(250,208,106,0.45)]",
};

const GROUPS: { heading: string; match: (i: SuggestionItem) => boolean }[] = [
  { heading: "Research", match: (i) => i.group === "research" },
  { heading: "Basic blocks", match: (i) => i.group !== "research" },
];

const groupClass =
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 " +
  "[&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase " +
  "[&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground";

/** Slash menu rows, grouped: research tools first, then basic blocks. */
export function SlashMenuItems() {
  return (
    <>
      {GROUPS.map((group) => (
        <Command.Group key={group.heading} heading={group.heading} className={groupClass}>
          {suggestionItems.filter(group.match).map((item) => (
            <EditorCommandItem
              key={item.title}
              value={item.title}
              onCommand={(val) => item.command && item.command(val)}
              className="flex w-full items-center gap-3 rounded-md border border-transparent px-2 py-1.5 text-left font-sans text-sm aria-selected:border-sky-100 aria-selected:bg-card"
            >
              <div
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-md [&_svg]:size-5",
                  TILE[item.tone ?? "normal"]
                )}
              >
                {item.icon}
              </div>
              <div className="min-w-0">
                <p className="font-medium leading-tight">{item.title}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.description}</p>
              </div>
            </EditorCommandItem>
          ))}
        </Command.Group>
      ))}
    </>
  );
}
