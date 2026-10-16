"use client";

import { User } from "@/db/database.types";
import { useUser } from "@/lib/providers/user-provider";
import React, { useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getUsersFromSearch } from "@/db/actions/get-user-subscription";

interface CollaboratorSearchProps {
  existingCollaborators: User[] | [];
  getCollaborator: (collaborator: User) => void;
  children: React.ReactNode;
}

export default function CollaboratorSearch({
  children,
  getCollaborator,
  existingCollaborators,
}: CollaboratorSearchProps) {
  const { session } = useUser();
  const [searchResults, setSearchResults] = useState<Partial<User>[] | []>([
    // {
    //     email:"aniz@gmal.com"
    // },
    // {
    //     email:"aniz@gmal.com"
    // }
  ]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  console.log("session in collab creation:", session?.user)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const getUserData = () => {};

  const onChangeHandler = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (timerRef) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const res = await getUsersFromSearch(e.target.value);
      setSearchResults(res as Partial<User>[] );
    }, 450);
  };

  const addCollaborator = (user: User) => {
    if (user.id) { // Ensure 'id' is defined
      getCollaborator(user);
    } else {
      console.error("User ID is undefined");
    }
  };

  return (
    <Sheet>
      <SheetTrigger className="w-full">{children}</SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle>Search Collaborator</SheetTitle>
          <SheetDescription>
            <p className="text-sm text-muted-foreground">
              You can also remove collaborators after adding them from the
              settings tab.
            </p>
          </SheetDescription>
        </SheetHeader>
        <div
          className="flex justify-center
        items-center
        gap-2
        mt-2
      "
        >
          <Search />
          <Input
            name="name"
            className=""
            placeholder="Email"
            onChange={onChangeHandler}
          />
        </div>
        <ScrollArea
          className="mt-6
        overflow-y-scroll
        w-full
        rounded-md
      "
        >
          {searchResults
            .filter(
              (result) =>
                !existingCollaborators.some(
                  (existing) => existing.id === result.id
                )
            )
            .filter((result) => result.id !== session?.user?.id)
            .map((user) => (
              <div
                key={user.id}
                className=" p-4 flex justify-between items-center"
              >
                <div className="flex gap-4 items-center">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={user.image ||"https://avatar.iran.liara.run/public"} />
                    <AvatarFallback>nq</AvatarFallback>
                  </Avatar>
                  <div
                    className="text-sm 
                        gap-2 
                        overflow-hidden 
                        overflow-ellipsis 
                        w-[180px] 
                        text-muted-foreground
                "
                  >
                    {user.email}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => addCollaborator(user as User)}
                >
                  Add
                </Button>
              </div>
            ))}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
