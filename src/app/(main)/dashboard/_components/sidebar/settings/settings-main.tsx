"use client";

import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import React from "react";
import SettingsForm from "./settings-form";

interface SettingsProps {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Settings dialog: a large two-pane panel (sections on the left, content on the right). */
export default function SettingsMenu({ children, open, onOpenChange }: SettingsProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children && <DialogTrigger className="w-full">{children}</DialogTrigger>}
      <DialogContent
        className="flex h-[min(680px,90dvh)] w-[calc(100vw-2rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 font-sans sm:rounded-xl"
      >
        <SettingsForm />
      </DialogContent>
    </Dialog>
  );
}
