"use client";

import { AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AccordionContent } from "@/components/ui/accordion";
import { useAppState } from "@/lib/providers/state-providers";
import { useRouter } from "next/navigation";
import { useMemo, useState, useEffect, useRef } from "react";
import EmojiPicker from "@/components/emoji-picker";
import TooltipComponent from "@/components/tooltip-component";
import clsx from "clsx";
import {
  createFile,
  updateFile,
  updateFolder,
} from "@/db/actions/action-workspace";
import { toast } from "sonner";
import { PlusIcon, Trash } from "lucide-react";
import { cn } from "@/lib/utils";
import { v4 } from "uuid";
import { File } from "@/db/database.types";
import { useUser } from "@/lib/providers/user-provider";
import { getFiles } from "@/db/actions/get-files";
import { dashboardCardStyle, navBtnstyle } from "@/lib/styles";

interface DropdownProps {
  title: string;
  id: string;
  listType: "folder" | "file";
  iconId: string;
  children?: React.ReactNode;
  disabled?: boolean;
  customIcon?: React.ReactNode;
}

export default function DropDown({
  title,
  id,
  listType,
  iconId,
  children,
  disabled,
  customIcon,
  ...props
}: DropdownProps) {
  const { state, dispatch, workspaceId, folderId } = useAppState();
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const router = useRouter();
  const { session } = useUser();
  const inputRef = useRef<HTMLInputElement>(null);
  const [originalTitle, setOriginalTitle] = useState<string>(title);

  // Fetch files from the database on initial load
  useEffect(() => {
    if (listType === "folder" && id) {
      const fetchFiles = async () => {
        const { data, error } = await getFiles(id);
        // console.log("Files in Folder :: Data ::: ", data)
        if (error) {
          console.error("Error fetching files:", error);
        } else if (data) {
          dispatch({
            type: "SET_FILE",
            payload: { workspaceId: workspaceId as string, files: data as File[], folderId: id },
          });
        }
      };
      fetchFiles();
    }
  }, [id, listType, dispatch, workspaceId]);

  //TODO : Ned to check the double click and edit funcionality
  // TODO : 19-11-24, RESTRUCTURE WORKSPACE




  //Folder title to be synced with local data and folder data
  // console.log("File  Title :::   " , folderId, title)
  // console.log("Folder Id::: " , id) 

  // const folderTitle
  const folderTitle: string | undefined = useMemo(() => {
    if (listType === "folder") {
      const stateTitle = state.workspaces
        .find((workspace) => workspace.id === workspaceId)
        ?.folders.find((folder) => folder.id === id)?.title;

      if (title === stateTitle || !stateTitle) return title;
      // console.log("State Title in dropdown ::: " , stateTitle)
      return stateTitle;
    }
  }, [state, listType, workspaceId, id, title]);
  
  // File TItle
  
  const fileTitle: string | undefined = useMemo(() => {
    if (listType === "file") {
      const fileAndFolderId = id.split("folder");
      const stateTitle = state.workspaces
      .find((workspace) => workspace.id === workspaceId)
      ?.folders.find((folder) => folder.id === fileAndFolderId[0])
      ?.files.find((file) => file.id === fileAndFolderId[1])?.title;
      if (title === stateTitle || !stateTitle) return title;
      // console.log("State Title files :: in dropdown ::: " , stateTitle)
      return stateTitle;
    }
  }, [state, listType, workspaceId, id, title]);

  // Navigate the user to a different page
  const navigatePage = (accordionId: string, type: string) => {
    // if (type === "folder") {
    //   router.push(`/dashboard/${workspaceId}/${accordionId}`);
    // }
    if (type === "file") {
      router.push(
        `/dashboard/${workspaceId}/${
          accordionId.split("folder")[1]
        }`
      );
    }
  };
  //Add a file

  //DpubleCLick to edit
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOriginalTitle(listType === "folder" ? folderTitle! : fileTitle!);
    setIsEditing(true);
  };

  // Blur
  const handleBlur = async (e: React.FocusEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    if (!isEditing) return;
    
    setIsEditing(false);
    const FID = id.split("folder");
    
    try {
      if (FID.length === 1) {
        if (!folderTitle?.trim()) return;
        
        if (originalTitle.trim() === folderTitle.trim()) {
          // console.log("Skipping folder update - no changes");
          return;
        }

        // console.log("Proceeding with folder update");
        await updateFolder({ title: folderTitle }, FID[0]);
        toast.success("Success", {
          description: "Folder name updated",
        });
      } else if (FID.length === 2 && FID[1]) {
        if (!fileTitle?.trim()) return;
        
        if (originalTitle.trim() === fileTitle.trim()) {
          // console.log("Skipping file update - no changes");
          return;
        }

        // console.log("Proceeding with file update");
        const { error } = await updateFile({ title: fileTitle }, FID[1]);
        
        if (error) throw error;
        toast.success("Success", {
          description: "File name updated",
        });
      }
    } catch (error) {
      console.error("Update error:", error);
      toast.error("Error", {
        description: "Could not update the name",
      });
    }
  };

  // onChnages, emeoji change,
  const onChangeEmoji = async (selectedEmoji: string) => {
    // TODO : Maybe not be Optimiistic!!
    if (!workspaceId) return;

    if (listType === "folder") {
      dispatch({
        type: "UPDATE_FOLDER",
        payload: {
          workspaceId,
          folderId: id,
          folder: { iconId: selectedEmoji },
        },
      });
      const { error: updateEmojiError } = await updateFolder(
        { iconId: selectedEmoji },
        id
      );

      if (updateEmojiError) {
        toast.error("Error while updating Emoji");
      } else {
        toast.success("Successfully updated !");
      }
    }
  };

  const folderTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!workspaceId) return;
    const FID = id.split("folder");

    if (FID.length === 1 && isEditing) {
      dispatch({
        type: "UPDATE_FOLDER",
        payload: {
          folder: { title: e.target.value },
          folderId: FID[0],
          workspaceId: workspaceId,
        },
      });
    }
  };

  const fileTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!workspaceId) return;
    const FID = id.split("folder");
    
    if (FID.length === 2 && FID[1] && isEditing) {
      dispatch({
        type: "UPDATE_FILE",
        payload: {
          file: { title: e.target.value },
          folderId: FID[0],
          workspaceId,
          fileId: FID[1],
        },
      });
    }
  };

  // move-to-trash

  const moveToTrash = async () => {

    // TODO : Maybe not be Optimiistic!!
    if (!session?.user?.email || !workspaceId) return;
    const pathId = id.split("folder");

    if (listType === "folder") {
      dispatch({
        type: "UPDATE_FOLDER",
        payload: {
          folder: { inTrash: `Deleted by ${session?.user?.email}` },
          folderId: pathId[0],
          workspaceId,
        },
      });
      const { data, error } = await updateFolder(
        { inTrash: `Deleted by ${session?.user?.email}` },
        pathId[0]
      );
      if (error) {
        toast.error("Error", {
          description: "Could not move the folder to archive",
        });
      } else {
        toast.warning("Success", {
          description: "Moved folder to archive",
        });
      }
    }

    if (listType === "file") {
      dispatch({
        type: "UPDATE_FILE",
        payload: {
          file: { inTrash: `Deleted by ${session?.user?.email}` },
          folderId: pathId[0],
          workspaceId,
          fileId: pathId[1],
        },
      });
      const { data, error } = await updateFile(
        { inTrash: `Deleted by ${session?.user?.email}` },
        pathId[1]
      );
      if (error) {
        toast.error("Error", {
            description: "Could not move the file to archive",
        });
      } else {
        toast.warning("Success", { description: "Moved file to archive" });
      }
    }
  };

  const addNewFile = async () => {
    if (!workspaceId) return;
    const newFile: File = {
      folderId: id,
      data: null,
      createdAt: new Date().toISOString(),
      inTrash: null,
      title: "double click to rename!",
      iconId: "🎀",
      id: v4(),
      workspaceId,
      bannerUrl: "",
      updatedAt:new Date().toISOString()
    };

    // Optimistically update the local state
    dispatch({
      type: "ADD_FILE",
      payload: { file: newFile, folderId: id, workspaceId },
    });

    const { error } = await createFile(newFile);

    if (error) {
      // Rollback the optimistic update if there's an error
      dispatch({
        type: "DELETE_FILE",
        payload: { workspaceId, folderId: id, fileId: newFile.id },
      });
      toast.error("Error", { description: "Could not create a file" });
    } else {
      toast.success("Success", { description: "File created." });
    }
  };

  const isFolder = listType === "folder";

  const listStyles = useMemo(
    () =>
      clsx("relative", {
        "border-none text-md": isFolder,
        "border-none ml-6 text-[16px] py-1": !isFolder,
      }),
    [isFolder]
  );

  const groupIdentifies = useMemo(
    () =>
      clsx(
        "whitespace-nowrap flex justify-between items-center w-full relative",
        {
          "group/folder": isFolder,
          "group/file": !isFolder,
        }
      ),
    [isFolder]
  );

  const hoverStyles = useMemo(
    () =>
      clsx(
        "h-full rounded-sm absolute right-0 space-x-2 flex items-center justify-center opacity-0 pointer-events-none transition-opacity duration-150 ease-out focus-within:opacity-100 focus-within:pointer-events-auto",
        {
          "group-hover/file:opacity-100 group-hover/file:pointer-events-auto": listType === "file",
          "group-hover/folder:opacity-100 group-hover/folder:pointer-events-auto": listType === "folder",
        }
      ),
    [isFolder]
  );

  // console.log("FILES GIONT TO BE PRINTED :: g",  state.workspaces[0].foldersfiles)

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
    }
  }, [isEditing]);

  return (
    <>
      <AccordionItem
        value={id}
        className={cn(
          `p-1`,
         "font-medium transition-colors duration-150 gap-2 rounded-md border border-transparent",
          listStyles,
          'bg-white data-[state=open]:bg-white hover:border-primary',
          listType === 'file' && 'hover:bg-neura-dashboardBG'
        )}
        onDoubleClick={handleDoubleClick}
        onBlur={handleBlur}
        onClick={(e) => {
          e.stopPropagation();
          // Only navigate if we're not in editing mode and it's a file
          if (listType === "file" && !isEditing) {
            navigatePage(id, listType);
          }
        }}
      >
        <AccordionTrigger
          id={listType}
          className={cn(
            "hover:no-underline p-2 text-md font-regular",
            'data-[state=open]:opacity-85',
            listType === 'folder' ? 'text-muted-foreground/90' : 'text-muted-foreground'
          )}
          disabled={listType === "file"}
        >
          <div className={groupIdentifies}>
            <div className="flex gap-4 items-center justify-center overflow-hidden">
              <div className="relative bg-slate-200 rounded-sm p-0.5">
                <EmojiPicker getValue={onChangeEmoji}>{iconId}</EmojiPicker>
              </div>

              <input
                ref={inputRef}
                type="text"
                value={listType === "folder" ? folderTitle : fileTitle}
                className={clsx(
                  "outline-none overflow-hidden w-[140px]",
                  {
                    "bg-muted cursor-text": isEditing,
                    "bg-transparent cursor-pointer": !isEditing,
                  },
                  listType === 'folder' 
                    ? 'text-neura-dashboardGray group-hover/folder:text-foreground data-[state=open]:opacity-60' 
                    : 'text-neura-dashboardGray group-hover/file:text-foreground'
                )}
                readOnly={!isEditing}
                onChange={listType === "folder" ? folderTitleChange : fileTitleChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                  if (e.key === 'Escape') {
                    setIsEditing(false);
                  }
                }}
              />
            </div>
            <div className={hoverStyles}>
              <TooltipComponent message={listType === "file" ? "Delete File" : "Delete Folder"}>
                <Trash
                  onClick={moveToTrash}
                  size={16}
                  className="hover:text-red-600 rounded-sm text-slate-400 transition-[color,transform] duration-150 active:scale-90"
                />
              </TooltipComponent>

              {listType === "folder" && !isEditing && (
                <TooltipComponent message="Add File">
                  <PlusIcon
                    onClick={addNewFile}
                    size={15}
                    className="hover:text-primary text-slate-400 transition-[color,transform] duration-150 active:scale-90"
                  />
                </TooltipComponent>
              )}
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          {state.workspaces
            .find((workspace) => workspace.id === workspaceId)
            ?.folders.find((folder) => folder.id === id)
            ?.files.filter((file) => !file.inTrash)
            .map((file) => {
              const customFileId = `${id}folder${file.id}`;
              // console.log("In the accordian content :: ,", file.title);
              return (
                <DropDown
                  key={file.id}
                  title={file.title}
                  listType="file"
                  id={customFileId}
                  iconId={file.iconId}
                />
              );
            })}
        </AccordionContent>
      </AccordionItem>
    </>
  );
}
