"use client"

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { LogOutIcon, Settings, MoreVertical, User, Loader2 } from "lucide-react";
import Image from "next/image";
import { Subscription } from "@/db/database.types";
import PlanUsage from "./plan-uage";
import SettingsMenu from "./settings/settings-main";
import { User as ActiveUser } from "next-auth";
import { signOut } from "next-auth/react";
import { useAppState } from "@/lib/providers/state-providers";
import { useState } from "react";
import { toast } from "sonner";

interface UserProfileProps {
  user: ActiveUser;
  subscription?: Subscription;
  foldersLength: number;
}

export default function UserProfile({ user, subscription, foldersLength }: UserProfileProps) {
  const { dispatch } = useAppState();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      dispatch({ type: "SET_WORKSPACES", payload: { workspaces: [] } });
      await signOut({ callbackUrl: "/login" });
    } catch {
      setSigningOut(false);
      toast.error("Could not sign out. Please try again.");
    }
  };

  return (
    <div className="w-full h-fit bg-white rounded-md flex flex-col justify-start items-center p-2">
      <div className="flex w-full justify-between items-center my-1">
        <div className="flex gap-2 items-center">
          <div className="w-8 h-8 rounded-lg overflow-hidden bg-muted relative">
            {user?.image ? (
              <Image 
                fill
                src={user.image} 
                alt="user avatar"
                className="object-cover"
                sizes="32px"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-medium truncate max-w-[150px]">
              {user?.email}
            </p>
            <Badge variant="outline" className="mt-0.5">
              {subscription?.status === 'active' ? 'Pro' : 'Free'}
            </Badge>
          </div>    
        </div>
        
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Account menu"
              className="h-8 w-8 hover:bg-muted"
            >
              <MoreVertical size={14}/>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
              <Settings className="mr-2 h-4 w-4"/>
              Account settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              disabled={signingOut}
              onSelect={(e) => {
                // Keep the menu open so the spinner is visible until the redirect
                e.preventDefault();
                handleSignOut();
              }}
            >
              {signingOut ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogOutIcon className="mr-2 h-4 w-4"/>
              )}
              {signingOut ? "Signing out…" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Controlled so it survives the menu closing */}
        <SettingsMenu open={settingsOpen} onOpenChange={setSettingsOpen} />
      </div>

      <PlanUsage 
        foldersLength={foldersLength} 
        subscription={subscription || null} 
      />
    </div>
  );
}
