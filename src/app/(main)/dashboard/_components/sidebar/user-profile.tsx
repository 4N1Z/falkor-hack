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
import { AuthUser } from "@supabase/supabase-js";
import { LogOutIcon, Settings, MoreVertical, User } from "lucide-react";
import Image from "next/image";
import { Subscription } from "@/db/database.types";
import PlanUsage from "./plan-uage";
import { User as ActiveUser } from "next-auth";

interface UserProfileProps {
  user: ActiveUser;
  subscription?: Subscription;
  foldersLength: number;
}

export default function UserProfile({ user, subscription, foldersLength }: UserProfileProps) {
  return (
    <div className="w-full h-fit bg-white rounded-md flex flex-col justify-start items-center p-2">
      <div className="flex w-full justify-between items-center my-2">
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
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 hover:bg-muted"
            >
              <MoreVertical size={14}/>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4"/>
              Account Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive">
              <LogOutIcon className="mr-2 h-4 w-4"/>
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <PlanUsage 
        foldersLength={foldersLength} 
        subscription={subscription || null} 
      />
    </div>
  );
}
