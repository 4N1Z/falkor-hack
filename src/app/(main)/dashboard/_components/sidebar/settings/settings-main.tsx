import CustomDialogTrigger from "@/components/custom-dialog";
import React from "react";
import SettingsForm from "./settings-form";

interface SettingsProps {
  children: React.ReactNode;
}

export default function SettingsMenu({ children }: SettingsProps) {
  return (
    <CustomDialogTrigger
      header="Settings"
      description="Your Settings companio"
      content={<SettingsForm />}
      className="w-full"
    >
      {children}
    </CustomDialogTrigger>
  );
}
