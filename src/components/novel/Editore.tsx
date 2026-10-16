"use client";
import Image from "next/image";
import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  EditorContent,
  EditorRoot,
  EditorCommand,
  EditorCommandItem,
  EditorCommandEmpty,
  EditorCommandList,
  type JSONContent,
} from "./headless/index";
import { defaultEditorContent } from "./content";
import { CitationCheckSheet } from "./citation-check-sheet";
import { NotebookSheet } from "./notebook-sheet";
import { SynthesisSheet } from "./synthesis-sheet";
import { EvidenceMapSheet } from "./evidence-map-sheet";
import { defaultExtensions } from "./extensions";
import { slashCommand, suggestionItems } from "./slash-command";
import {
  handleCommandNavigation,
  type SuggestionItem,
} from "./extensions/slash-command";
import * as extenders from "./extensions/index";

import { NodeSelector } from "./selectors/node-selector";
import { LinkSelector } from "./selectors/link-selector";
import { ColorSelector } from "./selectors/color-selector";
import { TextButtons } from "./selectors/text-buttons";
import GenerativeMenuSwitch from "./generative/generative-menu-switch";

import { handleImageDrop, handleImagePaste } from "./plugins";
import { uploadFn } from "./image-upload";

// import { useSession } from "next-auth/react"; // use server-side session instead

import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import { useAppState } from "@/lib/providers/state-providers";
import { createClient } from "@/utils/supabase/client";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/lib/providers/user-provider";
import {
  getFileDetails,
  getSharedWorkspaces,
  updateFile,
} from "@/db/actions/action-workspace";
import { deleteFile } from "@/db/actions/get-files";
import { File } from "@/db/database.types";
import { Badge } from "../ui/badge";
import EmojiPicker from "../emoji-picker";
import BannerUpload from "./banner-upload/banner-upload-main";
import { Button } from "../ui/button";
import { ChevronDown, Download, FileDown, FileText, FunctionSquare, ImageIcon, XIcon } from "lucide-react";
import { toolbarButton } from "./toolbar-button";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import { useSelectedFile } from "@/lib/hooks/state-management-hooks";
import { Separator } from "../ui/separator";
import { generateHTML } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Bold from '@tiptap/extension-bold'
import Heading from '@tiptap/extension-heading'
import Blockquote from '@tiptap/extension-blockquote'
import ListItem from '@tiptap/extension-list-item'
import OrderedList from '@tiptap/extension-ordered-list'
import BulletList from '@tiptap/extension-bullet-list'
import Italic from '@tiptap/extension-italic'
import Link from '@tiptap/extension-link'
import CodeBlock from '@tiptap/extension-code-block'
import Underline from '@tiptap/extension-underline'
import TextStyle from "@tiptap/extension-text-style";
import Strike from "@tiptap/extension-strike";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Color from "@tiptap/extension-color";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ImageResizer } from "./extensions/index";
import { useCurrentEditor } from "@tiptap/react";
import Editore from "./headless/Editore";


interface NovelEditorProps {
  dirDetails: File;
  fileId: string;
  dirType: "file";
  folderId: string;
}
const NovelTailwindEditore = ({
  dirDetails,
  fileId,
  dirType,
  folderId: folderIdProp,
}: NovelEditorProps) => {
  const [initialContent, setInitialContent] = useState<JSONContent | null>(
    null
  );
  let doc: Y.Doc = new Y.Doc();
  let providerA: HocuspocusProvider = new HocuspocusProvider({
    url: process.env.NODE_ENV === 'production'
    ? `${process.env.NEXT_PUBLIC_WS_URL || 'wss://neuraquery.com/ws'}`
    : 'ws://localhost:1414',
    name: fileId || 'default',
    document: doc,
    quiet: true,
  });
  const [saving, setSaving] = useState<boolean>(false);
  const [isCheckingShared, setIsCheckingShared] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingBanner, setDeletingBanner] = useState(false);
  const [sharedWorkspaces, setSharedWorkspaces] = useState<any[]>([]);

  const { state, workspaceId, dispatch, folderId } = useAppState();
  const router = useRouter();
  const supabase = createClient();

  const { session } = useUser();

  const pathname = usePathname();


  const file = useSelectedFile(fileId);
  // Initialize Y.doc and provider only on client-side
  const [isCollaborationEnabled, setIsCollaborationEnabled] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Query functions
  const details = useMemo(() => {
    let selectedDirectory;
    selectedDirectory = state.workspaces
      .find((workspace) => workspace.id === workspaceId)
      ?.folders.find((folder) => folder.id === folderId)
      ?.files.find((file) => file.id === fileId);

    if (selectedDirectory) return selectedDirectory;

    return {
      title: dirDetails.title,
      iconId: dirDetails.iconId,
      createdAt: dirDetails.createdAt,
      data: dirDetails.data,
      inTrash: dirDetails.inTrash,
      bannerUrl: dirDetails.bannerUrl,
      updatedAt: dirDetails.updatedAt,
    } as File;
  }, [state, workspaceId, folderId]);

  // console.log("Details EDITOR ::", details)

  const restoreFileHandler = async () => {
    if (dirType === "file") {
      if (!folderId || !workspaceId) return;
      dispatch({
        type: "UPDATE_FILE",
        payload: { file: { inTrash: "" }, fileId, folderId, workspaceId },
      });
      await updateFile({ inTrash: "" }, fileId);
    }
  };

  const deleteFileHandler = async () => {
    if (dirType === "file") {
      if (!folderId || !workspaceId) return;
      dispatch({
        type: "DELETE_FILE",
        payload: { fileId, folderId, workspaceId },
      });
      await deleteFile(fileId);
      router.replace(`/dashboard/${workspaceId}`);
    }
  };

  const deleteBanner = async () => {
    if (!fileId) return;
    setDeletingBanner(true);

    if (dirType === "file") {
      if (!folderId || !workspaceId) return;
      dispatch({
        type: "UPDATE_FILE",
        payload: { file: { bannerUrl: "" }, fileId, folderId, workspaceId },
      });
      await supabase.storage
        .from("workspaceBanner")
        .remove([`workspaceBanner-${fileId}`]);
      await updateFile({ bannerUrl: "" }, fileId);
    }

    setDeletingBanner(false);
  };

  const iconOnChange = async (icon: string) => {
    if (!fileId || !workspaceId || !folderId) return;

    dispatch({
      type: "UPDATE_FILE",
      payload: {
        file: { iconId: icon },
        workspaceId,
        folderId,
        fileId,
      },
    });
    await updateFile({ iconId: icon }, fileId);
  };

  const breadCrumbs = useMemo(() => {
    if (!pathname || !state.workspaces || !workspaceId) return;

    // Get workspace details
    const workspaceDetails = state.workspaces.find(
      (workspace) => workspace.id === workspaceId
    );

    const workspaceBreadCrumb = workspaceDetails
      ? `${workspaceDetails.iconId} ${workspaceDetails.title}`
      : "";

    // Get folder details using folderId from props
    const folderDetails = workspaceDetails?.folders.find(
      (folder) => folder.id === folderIdProp
    );

    const folderBreadcrumb = folderDetails
      ? `/ ${folderDetails.iconId} ${folderDetails.title}`
      : "";

    // Get file details
    const fileDetails = folderDetails?.files.find((file) => file.id === fileId);

    const fileBreadCrumb = fileDetails
      ? `/ ${fileDetails.iconId} ${fileDetails.title}`
      : "";

    // Return full path
    return `${workspaceBreadCrumb} ${folderBreadcrumb} ${fileBreadCrumb}`;
  }, [pathname, state, workspaceId, folderIdProp, fileId]);

  useEffect(() => {
    const initializeEditor = async () => {
      // First, fetch the information
      setIsLoading(true);
      const { data: selectedDir, error } = await getFileDetails(fileId);

      if (error || !selectedDir) {
        console.error("Error fetching file details:", error);
        router.replace(`/dashboard`);
        return;
      }

      if (!selectedDir[0]) {
        if (!workspaceId) return;
        router.replace(`/dashboard/${workspaceId}`);
        return;
      }

      if (!workspaceId) return;

      const fileData = selectedDir[0].data
        ? JSON.parse(selectedDir[0].data)
        : null;
      setInitialContent(fileData);
      
      dispatch({
        type: "UPDATE_FILE",
        payload: {
          file: {
            data: selectedDir[0].data,
            updatedAt: new Date().toISOString(),
          },
          fileId,
          folderId: selectedDir[0].folderId,
          workspaceId: workspaceId,
        },
      });

      setIsLoading(false);

      // After fetching information, initialize WebSocket
      if (typeof window !== "undefined") {
        try {
          const wsUrl = process.env.NODE_ENV === 'production'
            ? `${process.env.NEXT_PUBLIC_WS_URL || 'wss://neuraquery.com/ws'}`
            : 'ws://localhost:1414';
          
          console.log('Connecting to WebSocket at:', wsUrl);

          // Initialize Y.doc first
           doc = new Y.Doc();
          if (fileData) {
            const ymap = doc.getMap("content");
            if (!ymap.get("data")) {
              ymap.set("data", fileData);
            }
          }

          // Initialize provider directly without WebSocket check
          providerA = new HocuspocusProvider({
            url: wsUrl,
            name: fileId || 'default',
            document: doc,
            quiet: true,
            onConnect: () => {
              console.log('HocuspocusProvider connected successfully');
              setIsCollaborationEnabled(true);
              dispatch({
                type: "SET_COLLABORATION_STATUS",
                payload: { fileId, status: true },
              });
              const content = doc.getMap("content").get("data");
              if (content) {
                setInitialContent(content as JSONContent);
              }
            },
            onDisconnect: () => {
              console.log('HocuspocusProvider disconnected');
              setIsCollaborationEnabled(false);
              dispatch({
                type: "SET_COLLABORATION_STATUS",
                payload: { fileId, status: false },
              });
            },
            onAwarenessUpdate: ({ states }) => {
              // Dedupe by user id: one person can have several tabs open
              const byId = new Map<string, { id: string; name: string }>();
              for (const state of states) {
                const u = state.user as { id?: string; name?: string } | undefined;
                if (u?.id) byId.set(u.id, { id: u.id, name: u.name || "Collaborator" });
              }
              const connectedUsers = [...byId.values()];

              dispatch({
                type: "UPDATE_COLLABORATION_USERS",
                payload: {
                  fileId,
                  users: connectedUsers,
                },
              });
            },
          });

        } catch (error) {
          console.error("Failed to initialize collaboration:", error);
          setIsCollaborationEnabled(false);
        }
      }
    };

    initializeEditor();

    // Cleanup function
    return () => {
      providerA.destroy();
      doc.destroy();
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.id || isCheckingShared) return;

    const checkForShared = async () => {
      try {
        setIsCheckingShared(true);
        const sharedWorkspaces = await getSharedWorkspaces(session.user.id!);
        if (sharedWorkspaces.length > 0) {
          setSharedWorkspaces(sharedWorkspaces);
        }
      } catch (error) {
        console.error("Error checking shared workspaces:", error);
      } finally {
        setIsCheckingShared(false);
      }
    };

    checkForShared();
  }, [session?.user?.id]); // Only re-run when user ID changes


  if (isLoading) {
    return (
      <div className="w-full h-[95%] border shadow-sm shadow-sky-100 rounded-md p-8 flex flex-col gap-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  const handleExportAsPDF = async (content: JSONContent) => {
    try {
      // Generate HTML from the editor content
      const html = generateHTML(content || defaultEditorContent, [
       extenders.StarterKit,
       extenders.CodeBlockLowlight,
       extenders.TaskItem,
       extenders.TaskList,
       extenders.Placeholder,
       Link
      ]);

      // Add some basic styling to the HTML
      const styledHtml = `
        <html>
          <head>
            <style>
              body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                margin: 20px;
              }
              h1, h2, h3 { color: #333; }
              code { background: #f4f4f4; padding: 2px 4px; }
              blockquote { border-left: 4px solid #ddd; padding-left: 16px; }
            </style>
          </head>
          <body>${html}</body>
        </html>
      `;

      // Send HTML to server endpoint
      const response = await fetch('/api/export-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ html: styledHtml }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      // Get the PDF blob
      const pdfBlob = await response.blob();

      // Create download link
      const url = window.URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${details.title || 'document'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Failed to export PDF');
    }
  };

  return (
    <>
      <div className="relative border-b">
        {/* {JSON.stringify(details.inTrash)} */}
        {details.inTrash && (
          <article className="py-2 z-40 bg-[#EB5757] flex md:flex-row flex-col justify-center items-center gap-4 flex-wrap">
            <div className="flex flex-col md:flex-row gap-2 justify-center items-center">
              <span className="text-black">
                This {dirType} is in the archive.
              </span>
              <Button
                size="sm"
                variant="outline"
                className="bg-transparent border text-black hover:bg-slate-700 hover:text-[#EB5757]"
                onClick={restoreFileHandler}
              >
                Restore
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="bg-transparent border text-black hover:bg-slate-700 hover:text-[#EB5757]"
                onClick={deleteFileHandler}
              >
                Delete
              </Button>
            </div>
            <span className="text-sm text-white">{details.inTrash}</span>
          </article>
        )}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-between justify-center sm:items-center sm:p-2 p-8">
          <div>{breadCrumbs}</div>
          <div className="flex items-center gap-4">
            {/* collab */}
            {saving ? (
              <Badge
                variant="secondary"
                className="bg-orange-600 top-4 text-white right-4 z-50 "
              >
                Saving...
              </Badge>
            ) : (
              <Badge
                variant="secondary"
                className="bg-green-600  top-4 text-white right-4 z-50"
              >
                Saved
              </Badge>
            )}
          </div>
        </div>
      </div>
      {details.bannerUrl && (
        <div className="relative w-full h-[200px]">
          <Image
            src={
              supabase.storage
                .from("workspaceBanner")
                .getPublicUrl(details.bannerUrl).data.publicUrl
            }
            fill
            className="w-full md:h-48 h-20 object-cover"
            alt="Banner Image"
          />
        </div>
      )}

      {/* xl:pr reserves room for the Cite Scout panel (fixed, right, xl+ only) so it never covers text */}
      <div className="flex justify-center items-center flex-col mt-2 relative xl:pr-[324px]">
        {" "}
        {/* Need to chnage it to a different component */}
        <div className="w-full max-w-[800px] flex flex-col gap-3 px-7 lg:my-8">
          <div className="flex items-center gap-3">
            <EmojiPicker getValue={iconOnChange}>
              <div
                aria-label="Change icon"
                className="flex size-14 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[40px] leading-none transition-colors duration-150 hover:bg-muted"
              >
                {details.iconId}
              </div>
            </EmojiPicker>
            <h1 className="min-w-0 flex-1 text-2xl font-semibold leading-tight tracking-[-0.02em] text-foreground line-clamp-2">
              {details.title}
            </h1>
          </div>

          <div
            role="toolbar"
            aria-label="Document tools"
            className="-ml-2.5 flex flex-wrap items-center gap-0.5 border-b border-border/70 pb-3"
          >
            <NotebookSheet fileId={fileId} />
            <SynthesisSheet fileId={fileId} />
            <EvidenceMapSheet fileId={fileId} />
            <CitationCheckSheet fileId={fileId} />

            <span aria-hidden className="mx-1.5 h-4 w-px bg-border" />

            <BannerUpload id={fileId} dirType={dirType} className="w-auto">
              <span className={toolbarButton}>
                <ImageIcon />
                {details.bannerUrl ? "Change banner" : "Add banner"}
              </span>
            </BannerUpload>
            {details.bannerUrl && (
              <Button
                disabled={deletingBanner}
                onClick={deleteBanner}
                size={null}
                variant="none"
                className={toolbarButton}
              >
                <XIcon />
                Remove banner
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size={null} variant="none" className={toolbarButton}>
                  <Download />
                  Export
                  <ChevronDown className="opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[160px]">
                <DropdownMenuItem onClick={() => handleExportAsPDF(initialContent as JSONContent)}>
                  <FileDown className="mr-2 h-4 w-4" />
                  <span>PDF</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="text-muted-foreground" disabled>
                  <FunctionSquare className="mr-2 h-4 w-4" />
                  <span>LaTeX</span>
                  <span className="ml-auto text-[10px] uppercase tracking-wide">Soon</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="text-muted-foreground" disabled>
                  <FileText className="mr-2 h-4 w-4" />
                  <span>Word</span>
                  <span className="ml-auto text-[10px] uppercase tracking-wide">Soon</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <Editore ydoc={doc}  provider={providerA} fileId={fileId} data={initialContent as JSONContent || defaultEditorContent} session={session} 
        collabEnabled={isCollaborationEnabled}
          onUpdate={({ editor }: any) => {
            if (
              !editor ||
              !fileId ||
              !session?.user ||
              !workspaceId ||
              !folderId
            )
              return;
            const content = editor.getJSON();
            const contentLength = content
              ? JSON.stringify(content).length
              : 0;
  
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            setSaving(true);
  
            saveTimerRef.current = setTimeout(async () => {
              if (content && contentLength !== 0) {
                dispatch({
                  type: "UPDATE_FILE",
                  payload: {
                    file: {
                      data: JSON.stringify(content),
                      updatedAt: new Date().toISOString(),
                    },
                    workspaceId,
                    folderId,
                    fileId,
                  },
                });
                await updateFile({ data: JSON.stringify(content) }, fileId);
              }
              setSaving(false);
            }, 850);
          }}
          
        />
      </div>
    </>
  );
};
export default NovelTailwindEditore;
