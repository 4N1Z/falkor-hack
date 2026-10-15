"use client";

import { AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AccordionContent } from "@/components/ui/accordion";
import { useAppState } from "@/lib/providers/state-providers";
import { usePathname, useRouter } from "next/navigation";
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
import { Archive, FilePlus, Pencil } from "lucide-react";
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
  autoEdit?: boolean;
  onToggle?: (folderId: string) => void;
  onExpand?: (folderId: string) => void;
}

// Hover action on a row. Stops the click from toggling or opening the row itself.
function RowAction({
  label,
  onAction,
  className,
  children,
}: {
  label: string;
  onAction: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <TooltipComponent message={label}>
      <span
        role="button"
        tabIndex={0}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          onAction();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            onAction();
          }
        }}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-sm text-slate-400",
          "transition-[color,background-color,transform] duration-150 ease-out hover:bg-accent active:scale-90",
          className
        )}
      >
        {children}
      </span>
    </TooltipComponent>
  );
}

export default function DropDown({
  title,
  id,
  listType,
  iconId,
  children,
  disabled,
  customIcon,
  autoEdit,
  onToggle,
  onExpand,
  ...props
}: DropdownProps) {
  const { state, dispatch, workspaceId, folderId } = useAppState();
  // Freshly created items mount straight into rename mode
  const [isEditing, setIsEditing] = useState<boolean>(!!autoEdit);
  const router = useRouter();
  const { session } = useUser();
  const inputRef = useRef<HTMLInputElement>(null);
  const [originalTitle, setOriginalTitle] = useState<string>(title);
  const [newFileId, setNewFileId] = useState<string | null>(null);
  const pathname = usePathname();
  const isFolder = listType === "folder";
  const isActive =
    !isFolder && pathname?.split("/").filter(Boolean)[2] === id.split("folder")[1];

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
  const startEditing = () => {
    setOriginalTitle(listType === "folder" ? folderTitle! : fileTitle!);
    setIsEditing(true);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    startEditing();
  };

  // Focus and select the name as soon as editing starts
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const setLocalTitle = (value: string) => {
    if (!workspaceId) return;
    const FID = id.split("folder");
    if (listType === "folder") {
      dispatch({
        type: "UPDATE_FOLDER",
        payload: { folder: { title: value }, folderId: FID[0], workspaceId },
      });
    } else {
      dispatch({
        type: "UPDATE_FILE",
        payload: { file: { title: value }, folderId: FID[0], workspaceId, fileId: FID[1] },
      });
    }
  };

  // Blur
  const handleBlur = async (e: React.FocusEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    if (!isEditing) return;
    
    setIsEditing(false);
    const FID = id.split("folder");
    
    try {
      if (FID.length === 1) {
        if (!folderTitle?.trim()) {
          setLocalTitle(originalTitle);
          return;
        }
        
        if (originalTitle.trim() === folderTitle.trim()) {
          // console.log("Skipping folder update - no changes");
          return;
        }

        // console.log("Proceeding with folder update");
        await updateFolder({ title: folderTitle }, FID[0]);
      } else if (FID.length === 2 && FID[1]) {
        if (!fileTitle?.trim()) {
          setLocalTitle(originalTitle);
          return;
        }
        
        if (originalTitle.trim() === fileTitle.trim()) {
          // console.log("Skipping file update - no changes");
          return;
        }

        // console.log("Proceeding with file update");
        const { error } = await updateFile({ title: fileTitle }, FID[1]);
        
        if (error) throw error;
      }
    } catch (error) {
      console.error("Update error:", error);
      toast.error("Could not rename. Please try again.");
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

      if (updateEmojiError) toast.error("Could not update the icon");
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

  // Undo for archive
  const restoreFromArchive = async () => {
    if (!workspaceId) return;
    const pathId = id.split("folder");

    if (listType === "folder") {
      dispatch({
        type: "UPDATE_FOLDER",
        payload: { folder: { inTrash: null }, folderId: pathId[0], workspaceId },
      });
      const { error } = await updateFolder({ inTrash: null }, pathId[0]);
      if (error) toast.error("Could not restore the folder");
    } else {
      dispatch({
        type: "UPDATE_FILE",
        payload: { file: { inTrash: null }, folderId: pathId[0], workspaceId, fileId: pathId[1] },
      });
      const { error } = await updateFile({ inTrash: null }, pathId[1]);
      if (error) toast.error("Could not restore the file");
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
        toast.error("Could not archive the folder");
      } else {
        toast("Folder archived", {
          description: "Find it under Archive in the sidebar.",
          action: { label: "Undo", onClick: restoreFromArchive },
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
        toast.error("Could not archive the file");
      } else {
        toast("File archived", {
          description: "Find it under Archive in the sidebar.",
          action: { label: "Undo", onClick: restoreFromArchive },
        });
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
      title: "Untitled",
      iconId: "📄",
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
    setNewFileId(newFile.id);
    onExpand?.(id);

    const { error } = await createFile(newFile);

    if (error) {
      // Rollback the optimistic update if there's an error
      dispatch({
        type: "DELETE_FILE",
        payload: { workspaceId, folderId: id, fileId: newFile.id },
      });
      toast.error("Could not create the file");
    }
  };

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
        "shrink-0 flex items-center gap-0.5 opacity-0 pointer-events-none transition-opacity duration-150 ease-out focus-within:opacity-100 focus-within:pointer-events-auto",
        {
          "group-hover/file:opacity-100 group-hover/file:pointer-events-auto": listType === "file",
          "group-hover/folder:opacity-100 group-hover/folder:pointer-events-auto": listType === "folder",
        }
      ),
    [isFolder]
  );

  const folderFiles = isFolder
    ? state.workspaces
        .find((workspace) => workspace.id === workspaceId)
        ?.folders.find((folder) => folder.id === id)
        ?.files.filter((file) => !file.inTrash) ?? []
    : [];

  return (
    <AccordionItem
      value={id}
      className={cn(
        "p-1 font-medium transition-colors duration-150 gap-2 rounded-md border border-transparent animate-fadeIn",
        listStyles,
        "bg-white data-[state=open]:bg-white hover:border-sky-100",
        !isFolder && "hover:bg-neura-dashboardBG",
        isActive && "bg-neura-dashboardBG border-sky-100"
      )}
      onDoubleClick={handleDoubleClick}
      onBlur={handleBlur}
      onClick={(e) => {
        e.stopPropagation();
        if (isEditing) return;
        // The chevron is a real button and toggles itself
        if ((e.target as HTMLElement).closest("button")) return;
        if (isFolder) onToggle?.(id);
        else navigatePage(id, listType);
      }}
    >
      <AccordionTrigger
        id={listType}
        className={cn(
          "hover:no-underline p-2 text-md font-regular",
          isFolder ? "text-muted-foreground/90" : "text-muted-foreground"
        )}
        disabled={!isFolder}
      >
        <div className={groupIdentifies}>
          <div className="flex min-w-0 flex-1 items-center gap-3 cursor-pointer">
            <div
              className="relative shrink-0 bg-slate-200 rounded-sm p-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              <EmojiPicker getValue={onChangeEmoji}>{iconId}</EmojiPicker>
            </div>

            <input
              ref={inputRef}
              type="text"
              aria-label={isFolder ? "Folder name" : "File name"}
              title={isEditing ? undefined : "Double-click to rename"}
              value={isFolder ? folderTitle : fileTitle}
              className={clsx(
                "outline-none min-w-0 flex-1 truncate rounded-sm px-1 -mx-1 transition-[background-color,box-shadow] duration-150",
                isEditing
                  ? "bg-muted cursor-text ring-1 ring-sky-200"
                  : "bg-transparent cursor-pointer",
                isActive
                  ? "text-foreground"
                  : isFolder
                  ? "text-neura-dashboardGray group-hover/folder:text-foreground"
                  : "text-neura-dashboardGray group-hover/file:text-foreground"
              )}
              readOnly={!isEditing}
              onClick={(e) => {
                if (isEditing) e.stopPropagation();
              }}
              onChange={isFolder ? folderTitleChange : fileTitleChange}
              onKeyDown={(e) => {
                if (!isEditing) return;
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
                if (e.key === "Escape") {
                  setLocalTitle(originalTitle);
                  setIsEditing(false);
                }
              }}
            />
          </div>

          {!isEditing && (
            <div className={hoverStyles}>
              <RowAction label="Rename" onAction={startEditing} className="hover:text-primary">
                <Pencil size={14} />
              </RowAction>
              {isFolder && (
                <RowAction label="New file" onAction={addNewFile} className="hover:text-primary">
                  <FilePlus size={14} />
                </RowAction>
              )}
              <RowAction
                label={isFolder ? "Archive folder" : "Archive file"}
                onAction={moveToTrash}
                className="hover:text-red-600"
              >
                <Archive size={14} />
              </RowAction>
            </div>
          )}
        </div>
      </AccordionTrigger>

      {isFolder && (
        <AccordionContent className="space-y-1 pb-1">
          {folderFiles.length ? (
            folderFiles.map((file) => (
              <DropDown
                key={file.id}
                title={file.title}
                listType="file"
                id={`${id}folder${file.id}`}
                iconId={file.iconId}
                autoEdit={file.id === newFileId}
              />
            ))
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                addNewFile();
              }}
              className="ml-6 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-[background-color,color,transform] duration-150 ease-out hover:bg-accent hover:text-primary active:scale-[0.97]"
            >
              <FilePlus size={12} />
              Add a file
            </button>
          )}
        </AccordionContent>
      )}
    </AccordionItem>
  );
}
