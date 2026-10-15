import CustomDialogTrigger from "@/components/custom-dialog";
import React from "react";
import SettingsForm from "./settings-form";

interface SettingsProps {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function SettingsMenu({ children, open, onOpenChange }: SettingsProps) {
  return (
    <CustomDialogTrigger
      header="Settings"
      description="Manage your workspace and account."
      content={<SettingsForm />}
      className="w-full"
      open={open}
      onOpenChange={onOpenChange}
    >
      {children}
    </CustomDialogTrigger>
  );
}
