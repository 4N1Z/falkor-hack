"use client";
import { User, workspace } from "@/db/database.types";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Loader2, Lock, Plus, Share } from "lucide-react";
import { Button } from "./ui/button";
import { v4 } from "uuid";
import { toast } from "sonner";
import {
  addCollaborators,
  createWorkspace,
} from "@/db/actions/action-workspace";
import CollaboratorSearch from "@/app/(main)/dashboard/_components/sidebar/collaborator-search";
import { ScrollArea } from "./ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

interface WorkspaceCreatorProps {
  userId: string;
  currentWorkspaceCount: number;
}

export default function WorkspaceCreator({
  userId,
  currentWorkspaceCount,
}: WorkspaceCreatorProps) {
  // export default function WorkspaceCreator({sessions}:{sessions:Session}) {

  const [permission, setPermission] = useState<string>("private");
  const [title, setTitle] = useState<string>("");
  const [collaborator, setCollborator] = useState<User[]>([]);
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const MAX_WORKSPACES = 5;

  //   const { data: user } = await supabaseClient.auth.getUser();

  const addCollaborator = (user: User) => {
    setCollborator([...collaborator, user]);
  };

  const removeCollaborator = (user: User) => {
    setCollborator(collaborator.filter((c) => c.id !== user.id));
  };

  const createItem = async () => {
    setIsLoading(true);
    const loadingToast = toast.loading("Checking workspace limit...");

    if (currentWorkspaceCount >= MAX_WORKSPACES) {
      toast.error("Workspace limit reached", {
        description: `You can only create up to ${MAX_WORKSPACES} workspaces`,
      });
      return;
    }

    // Continue with workspace creation if under limit
    toast.dismiss(loadingToast);
    const uuid = v4();

    // console.log("In create Item of Workspace Creator");

    if (userId) {
      // if (session?.user?.id) {

      // console.log("In create Item of Workspace Creator", userId);
      const newWorkspace: workspace = {
        createdAt: new Date().toISOString(),
        iconId: "🎀",
        id: uuid,
        inTrash: "",
        title,
        workspaceOwner: userId,
        logo: null,
        bannerUrl: "",
        updatedAt: new Date().toISOString(),
      };
      // Show loading toast while creating
      const loadingToast = toast.loading("Creating your workspace...");

      try {
        if (permission === "private") {
          const { data, error } = await createWorkspace(newWorkspace);
          if (error) throw new Error("Failed to create workspace");

          toast.dismiss(loadingToast);
          toast.success("Success", {
            description: "Created the Private workspace",
          });

          router.refresh();
          router.push(`/dashboard/${uuid}`);
        }

        if (permission === "shared") {
          const { data, error } = await createWorkspace(newWorkspace);
          if (error) throw new Error("Failed to create workspace");

          await addCollaborators(collaborator, uuid);

          toast.dismiss(loadingToast);
          toast.success("Success", {
            description: "Created the Shared workspace",
          });

          router.refresh();
          router.push(`/dashboard/${uuid}`);
        }
      } catch (error) {
        toast.dismiss(loadingToast);
        toast.error("Failed to create workspace");
      }
    } else {
      // console.log("User Not logged in");
      router.push("/login");
    }
    setIsLoading(false);
  };

  return (
    <div className="w-full flex gap-4 flex-col">
      <div>
        <Label htmlFor="name" className="text-sm text-muted-foreground">
          Name
        </Label>
        <div className="flex justify-center items-center gap-2">
          <Input
            name="name"
            value={title}
            placeholder="Workspace Name"
            onChange={(e) => {
              e.preventDefault();
              setTitle(e.target.value);
            }}
          />
        </div>
      </div>
      <>
        <div>
          <Label
            htmlFor="permsissions"
            className="text-sm text-muted-foreground"
          >
            Permission
          </Label>
          <Select
            onValueChange={(value) => {
              setPermission(value);
            }}
            defaultValue={permission}
          >
            <SelectTrigger className="w-full h-20 mt-3">
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              <SelectGroup>
                <SelectItem value="private" className="font-sans">
                  <div className="p-2 flex gap-4 justify-center items-center">
                    <Lock />
                    <article className="text-left flex flex-col">
                      <span>private</span>
                      <p>
                        this is the private workspacee and cannot be shared!
                      </p>
                    </article>
                  </div>
                </SelectItem>
                <SelectItem value="shared">
                  <div className="p-2 flex gap-4 justify-center items-center">
                    <Share />
                    <article className="text-left flex flex-col">
                      <span>Shared</span>
                      <p>Workspace which can be shared with others</p>
                    </article>
                  </div>
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </>
      {permission === "shared" && (
        <div>
          <CollaboratorSearch
            existingCollaborators={collaborator}
            getCollaborator={(user) => {
              addCollaborator(user);
            }}
          >
            <Button type="button" className="text-sm mt-4">
              <Plus />
              Add Collaborators
            </Button>
          </CollaboratorSearch>
          <div className="mt-4">
            <span className="text-sm text-muted-foreground">
              Collaborators {collaborator.length || ""}
            </span>
            <ScrollArea className="h-[120px] overflow-y-scroll w-full rounded-md border border-muted-foreground/20">
              {collaborator.length ? (
                collaborator.map((c) => (
                  <div
                    className="p-4 flex justify-between items-center w-full"
                    key={c.id}
                  >
                    <div className="flex justify-between items-center gap-2">
                      <Avatar className="w-8 h-8">
                        <AvatarImage
                          src={"https://avatar.iran.liara.run/public"}
                        />
                        <AvatarFallback>nq</AvatarFallback>
                      </Avatar>
                      <div
                        className="text-sm 
                        overflow-hidden 
                        overflow-ellipsis 
                        text-muted-foreground"
                      >
                        {c.email}
                      </div>
                    </div>

                    <Button
                      variant={"destructive"}
                      onClick={() => removeCollaborator(c)}
                    >
                      Remove
                    </Button>
                  </div>
                ))
              ) : (
                <div className="absolute right-0 left-0 top-0 bottom-0 flex justify-center items-center">
                  <span className="text-muted-foreground text-sm">
                    You have no collaborator
                  </span>
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center w-full p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Creating your workspace...
          </div>
        </div>
      ) : (
        <Button
          type="button"
          disabled={
            !title ||
            (permission === "shared" && collaborator.length === 0) ||
            isLoading
          }
          onClick={createItem}
          className="w-full"
        >
          Create Workspace
        </Button>
      )}
    </div>
  );
}
