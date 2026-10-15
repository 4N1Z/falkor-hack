"use client";

import TooltipComponent from "@/components/tooltip-component";
import { Accordion } from "@/components/ui/accordion";
import { createFolder, createFile } from "@/db/actions/action-workspace";
import { Folder, File } from "@/db/database.types";
import { useAppState } from "@/lib/providers/state-providers";
import { PlusIcon } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { v4 } from "uuid";
import DropDown from "./drop-down-folder";
import useSupabaseRealtime from "@/lib/hooks/use-supabase.realtime";

interface FoldersDropdownListProps {
  workspaceFolders: Folder[];
  workspaceId: string;
}

export default function FoldersDropdownList({
  workspaceFolders,
  workspaceId,
}: FoldersDropdownListProps) {

  // TODO local state folders
  // TODO set real-time updates
  useSupabaseRealtime()

  // NOTE: the route is /dashboard/[workspaceId]/[fileId], so this segment is the open file
  const { state, dispatch, folderId: activeFileId } = useAppState();
  const [folders, setFolders] = useState(workspaceFolders);
  const [openFolders, setOpenFolders] = useState<string[]>([]);
  const [newFolderId, setNewFolderId] = useState<string | null>(null);
  const autoOpenedFor = useRef<string | null>(null);

  const toggleFolder = (id: string) =>
    setOpenFolders((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  const expandFolder = (id: string) =>
    setOpenFolders((prev) => (prev.includes(id) ? prev : [...prev, id]));

  // Reveal the open file: expand its folder once, without fighting manual collapses
  useEffect(() => {
    if (!activeFileId || autoOpenedFor.current === activeFileId) return;
    const parent = state.workspaces
      .find((workspace) => workspace.id === workspaceId)
      ?.folders.find((folder) =>
        folder.files.some((file) => file.id === activeFileId)
      );
    if (parent) {
      expandFolder(parent.id);
      autoOpenedFor.current = activeFileId;
    }
  }, [state, workspaceId, activeFileId]);

  // console.log("Workspace Folders :::  " , workspaceFolders.map((index)=>(index.title)))

  // Effect to set initial state, based on server data inside the AppState
  // TODO :: REMoVED 19-11 /check

  useEffect(() => {
    if (workspaceFolders.length > 0) {
      dispatch({
        type: "SET_FOLDERS",
        payload: {
          workspaceId,
          folders: workspaceFolders.map((folder) => ({
            ...folder,
            files:
              state.workspaces
                .find((workspace) => workspace.id === workspaceId)
                ?.folders.find((f) => f.id === folder.id)?.files || [],
          })),
        },
      });
    }
  }, [workspaceFolders, workspaceId]);

  // state
  useEffect(() => {
    setFolders(
      state.workspaces.find((workspace) => workspace.id === workspaceId)
        ?.folders || []
    );
  }, [state, workspaceId]);

  // add Folder
  const addFolderHandler = async () => {
    // TODO : Subscription Check
    // if (folders.length >= 3 && !subscription) {
    //   setOpen(true);
    //   return;
    // }

    const newFolder: Folder = {
      id: v4(),
      createdAt: new Date().toISOString(),
      title: "Untitled folder",
      iconId: "📁",
      inTrash: null,
      workspaceId,
      bannerUrl: "",
      updatedAt:new Date().toISOString(),
    };

    dispatch({
      type: "ADD_FOLDER",
      payload: { workspaceId, folder: { ...newFolder, files: [] } },
    });
    setNewFolderId(newFolder.id);
    expandFolder(newFolder.id);

    const { data: folderData, error: folderError } = await createFolder(newFolder);

    if (folderError) {
      dispatch({
        type: "DELETE_FOLDER",
        payload: { workspaceId, folderId: newFolder.id },
      });
      toast.error("Could not create the folder");
      return;
    }

    const newFile: File = {
      id: v4(),
      folderId: newFolder.id,
      workspaceId,
      data: null,
      createdAt: new Date().toISOString(),
      inTrash: null,
      title: "Untitled",
      iconId: "📄",
      bannerUrl: "",
      updatedAt:new Date().toISOString(),
    };

    const { error: fileError } = await createFile(newFile);

    if (fileError) {
      toast.error("Could not create the first file in this folder");
    } else {
      dispatch({
        type: "UPDATE_FOLDER",
        payload: { workspaceId, folderId: newFolder.id, folder: { files: [newFile] } },
      });
    }
  };

  // Show empty state if no folders exist
  if (folders.filter(folder => !folder.inTrash).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-4 space-y-4 mt-8 animate-fadeIn opacity-0">
        <div className="text-muted-foreground text-sm text-center">
          No folders yet. Create your first folder to get started.
        </div>
        <button
          onClick={addFolderHandler}
          className="flex items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-primary/10 rounded-md transition-[background-color,transform] duration-150 active:scale-[0.97]">
          <PlusIcon size={16} />
          Create Folder
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex bg-card-foreground sticky z-10 top-0 my-2 border-b w-full h-10 group/title justify-between items-center">
        <span className="text-slate-400 font-medium text-xs uppercase tracking-wide">
          Workspace folders
        </span>
        <TooltipComponent message="New folder">
          <button
            type="button"
            aria-label="New folder"
            onClick={addFolderHandler}
            className="flex items-center justify-center h-6 w-6 rounded-sm m-2 text-slate-500 transition-[color,background-color,transform] duration-150 ease-out hover:text-primary hover:bg-accent active:scale-90"
          >
            <PlusIcon size={16} />
          </button>
        </TooltipComponent>
      </div>
      <Accordion
        type="multiple"
        value={openFolders}
        onValueChange={setOpenFolders}
        className="space-y-2"
      >
        {folders
          .filter((folder) => !folder.inTrash)
          .map((folder) => (
            <Suspense key={folder.id} fallback={<div className="h-10 rounded-md bg-muted/60 animate-pulse" />}>
              <DropDown
                title={folder.title}
                listType="folder"
                id={folder.id}
                iconId={folder.iconId}
                autoEdit={folder.id === newFolderId}
                onToggle={toggleFolder}
                onExpand={expandFolder}
              />
            </Suspense>
          ))}
      </Accordion>
    </>
  );
}

// 56879732-70ea-4cbc-a502-c676e14a81f1
// 