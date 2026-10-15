import { EditorBubble, useEditor } from "novel";
import React, { Fragment, useEffect, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { AISelector } from "./ai-selector";
import { SparklesIcon } from "lucide-react";
import {} from "../plugins";
import { removeAIHighlight } from "../extensions/ai-highlight";
import { cn } from "@/lib/utils";
import { AIStars, neuraQueryLogo } from "@/lib/logos";

interface GenerativeMenuSwitchProps {
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
const GenerativeMenuSwitch = ({
  children,
  open,
  onOpenChange,
}: GenerativeMenuSwitchProps) => {
  const { editor } = useEditor();

  useEffect(() => {
    if (!open) removeAIHighlight(editor!);
  }, [open, editor]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <EditorBubble
      tippyOptions={{
        placement: open ? "bottom-start" : "top",
        onHidden: () => {
          onOpenChange(false);
          editor?.chain().unsetHighlight().run();
        },
      }}
      className="flex flex-col w-fit max-w-[90vw] font-sans p-2 overflow-hidden rounded-md border bg-background shadow-md shadow-sky-100 "
    >
      {open && <AISelector open={open} onOpenChange={onOpenChange} />}
      {!open && (
        <Fragment>
          <Button
            className="gap-1 p-2 rounded-sm text-sm justify-start  "
            variant="ghost"
            onClick={() => onOpenChange(true)}
            size="sm"
          >
            <div
              className={`${cn(
                "p-1.5 rounded-sm",
                `  bg-[linear-gradient(115deg,#BCE5FF_12.84%,#DCECFE_93.66%)] 
           [&_svg]:w-4 [&_svg]:h-4`
              )}`}
            >
              {neuraQueryLogo}
            </div>
            Ask AI
            <span className="ml-1 px-1 py-[1px] rounded bg-muted text-[0.65rem] text-muted-foreground ">
              ⌘J
            </span>
          </Button>
          {children}
        </Fragment>
      )}
    </EditorBubble>
  );
};

export default GenerativeMenuSwitch;
