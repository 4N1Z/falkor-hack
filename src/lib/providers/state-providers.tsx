"use client";

import React, {
  Dispatch,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";
// import { File, Folder, workspace } from ';
import { usePathname } from "next/navigation";
import { File, Folder, workspace } from "@/db/database.types";
import { getFiles } from "@/db/actions/get-files";
import { Message } from "ai";
import { LoadingKeys } from "../types";

export type appFoldersType = Folder & { files: File[] | [] };
export type appWorkspacesType = workspace & {
  folders: appFoldersType[] | [];
};

// Local State management.

// Sync the states across all the files. Optimistic updates and realtime local changes. Feels fast
// To change in DB need to call Server as usual
// useReducer is Scn 🔥🔥

// TODO need to do a addToTrash / change the logic for files and folders
// TODO Also a restore folder/file action.
// That is on adding folders to trasch it should add all the folders along with files into trash
// and onn restoring it shoould first restore all the files of that folder and then then the folders

function isValidWorkspace(workspace: unknown): workspace is appWorkspacesType {
  return (
    typeof workspace === "object" &&
    workspace !== null &&
    "id" in workspace &&
    "folders" in workspace
  );
}

interface AppState {
  workspaces: appWorkspacesType[] | [];
  chatSessions: Record<string, { messages: Message[] }>;
  researchSummaries: Record<string, { summary: string; timestamp: number }>;
  errors: Record<LoadingKeys, string | null>; // Makes it clearer what can be in error state
  loading: Record<LoadingKeys, boolean>;

  collaborationStatus: Record<
    string,
    {
      isEnabled: boolean;
      connectedUsers?: string[];
    }
  >;
}

type Action =
  | { type: "ADD_WORKSPACE"; payload: appWorkspacesType }
  | { type: "DELETE_WORKSPACE"; payload: string }
  | {
      type: "UPDATE_WORKSPACE";
      payload: { workspace: Partial<appWorkspacesType>; workspaceId: string };
    }
  | {
      type: "SET_WORKSPACES";
      payload: { workspaces: appWorkspacesType[] | [] };
    }
  | {
      type: "SET_FOLDERS";
      payload: { workspaceId: string; folders: [] | appFoldersType[] };
    }
  | {
      type: "ADD_FOLDER";
      payload: { workspaceId: string; folder: appFoldersType };
    }
  | {
      type: "ADD_FILE";
      payload: { workspaceId: string; file: File; folderId: string };
    }
  | {
      type: "DELETE_FILE";
      payload: { workspaceId: string; folderId: string; fileId: string };
    }
  | {
      type: "DELETE_FOLDER";
      payload: { workspaceId: string; folderId: string };
    }
  | {
      type: "SET_FILE";
      payload: { workspaceId: string; files: File[]; folderId: string };
    }
  | {
      type: "UPDATE_FOLDER";
      payload: {
        folder: Partial<appFoldersType>;
        workspaceId: string;
        folderId: string;
      };
    }
  | {
      type: "UPDATE_FILE";
      payload: {
        file: Partial<File>;
        folderId: string;
        workspaceId: string;
        fileId: string;
      };
    }
  | {
      type: "SET_CHAT_SESSION";
      payload: {
        chatId: string;
        messages: Message[];
      };
    }
  | {
      type: "DELETE_CHAT_SESSION";
      payload: {
        chatId: string;
      };
    }
  | {
      type: "SET_RESEARCH_SUMMARY";
      payload: {
        keywords: string;
        summary: string;
        timestamp: number;
      };
    }
  | { type: "SET_LOADING"; payload: { key: LoadingKeys; isLoading: boolean } }
  | { type: "SET_ERROR"; payload: { key: LoadingKeys; error: string | null } }
  | {
      type: "SET_COLLABORATION_STATUS";
      payload: { fileId: string; status: boolean };
    }
  | {
      type: "UPDATE_COLLABORATION_USERS";
      payload: {
        fileId: string;
        users: string[];
      };
    };

const initialState: AppState = {
  workspaces: [],
  chatSessions: {},
  researchSummaries: {},
  errors: {
    files: null,
    workspace: null,
    folders: null,
    collaboration: null,
  },
  loading: {
    files: false,
    workspace: false,
    folders: false,
    collaboration: false,
  },
  collaborationStatus: {},
};

const appReducer = (
  state: AppState = initialState,
  action: Action
): AppState => {
  switch (action.type) {
    case "ADD_WORKSPACE":
      if (!isValidWorkspace(action.payload)) {
        return state;
      }
      return {
        ...state,
        workspaces: [...state.workspaces, action.payload],
      };

    case "DELETE_WORKSPACE":
      return {
        ...state,
        workspaces: state.workspaces.filter(
          (workspace) => workspace.id !== action.payload
        ),
      };

    case "UPDATE_WORKSPACE":
      return {
        ...state,
        workspaces: state.workspaces.map((workspace) => {
          if (workspace.id === action.payload.workspaceId) {
            return {
              ...workspace,
              ...action.payload.workspace,
            };
          }
          return workspace;
        }),
      };
    case "SET_WORKSPACES":
      return {
        ...state,
        workspaces: action.payload.workspaces,
      };
    case "SET_FOLDERS":
      return {
        ...state,
        workspaces: state.workspaces.map((workspace) => {
          if (workspace.id === action.payload.workspaceId) {
            return {
              ...workspace,
              folders: action.payload.folders.sort(
                (a, b) =>
                  new Date(a.createdAt).getTime() -
                  new Date(b.createdAt).getTime()
              ),
            };
          }
          return workspace;
        }),
      };

    case "ADD_FOLDER":
      return {
        ...state,
        workspaces: state.workspaces.map((workspace) => {
          return {
            ...workspace,
            folders: [...workspace.folders, action.payload.folder].sort(
              (a, b) =>
                new Date(a.createdAt).getTime() -
                new Date(b.createdAt).getTime()
            ),
          };
        }),
      };

    case "UPDATE_FOLDER":
      return {
        ...state,
        workspaces: state.workspaces.map((workspace) => {
          if (workspace.id == action.payload.workspaceId) {
            return {
              ...workspace,
              folders: workspace.folders.map((folder) => {
                if (folder.id == action.payload.folderId) {
                  // update
                  return {
                    ...folder,
                    ...action.payload.folder,
                  };
                }
                return folder;
              }),
            };
          }
          return workspace;
        }),
      };
    case "DELETE_FOLDER":
      return {
        ...state,
        workspaces: state.workspaces.map((workspace) => {
          if (workspace.id === action.payload.workspaceId) {
            return {
              ...workspace,
              folders: workspace.folders.filter(
                (folder) => folder.id !== action.payload.folderId
              ),
            };
          }
          return workspace;
        }),
      };

    case "SET_FILE":
      return {
        ...state,
        workspaces: state.workspaces.map((workspace) => {
          if (workspace.id === action.payload.workspaceId) {
            return {
              ...workspace,
              folders: workspace.folders.map((folder) => {
                if (folder.id === action.payload.folderId) {
                  return {
                    ...folder,
                    files: action.payload.files,
                  };
                }
                return folder;
              }),
            };
          }
          return workspace;
        }),
      };

    case "ADD_FILE":
      return {
        ...state,
        workspaces: state.workspaces.map((workspace) => {
          if (workspace.id === action.payload.workspaceId) {
            return {
              ...workspace,
              folders: workspace.folders.map((folder) => {
                if (folder.id === action.payload.folderId) {
                  return {
                    ...folder,
                    files: [...folder.files, action.payload.file].sort(
                      (a, b) =>
                        new Date(a.createdAt).getTime() -
                        new Date(b.createdAt).getTime()
                    ),
                  };
                }
                return folder;
              }),
            };
          }
          return workspace;
        }),
      };

    case "DELETE_FILE":
      return {
        ...state,
        workspaces: state.workspaces.map((workspace) => {
          if (workspace.id === action.payload.workspaceId) {
            return {
              ...workspace,
              folder: workspace.folders.map((folder) => {
                if (folder.id === action.payload.folderId) {
                  return {
                    ...folder,
                    files: folder.files.filter(
                      (file) => file.id !== action.payload.fileId
                    ),
                  };
                }
                return folder;
              }),
            };
          }
          return workspace;
        }),
      };
    case "UPDATE_FILE":
      return {
        ...state,
        workspaces: state.workspaces.map((workspace) => {
          if (workspace.id === action.payload.workspaceId) {
            return {
              ...workspace,
              folders: workspace.folders.map((folder) => {
                if (folder.id === action.payload.folderId) {
                  return {
                    ...folder,
                    files: folder.files.map((file) => {
                      if (file.id === action.payload.fileId) {
                        return {
                          ...file,
                          ...action.payload.file,
                        };
                      }
                      return file;
                    }),
                  };
                }
                return folder;
              }),
            };
          }
          return workspace;
        }),
      };
    case "SET_CHAT_SESSION":
      return {
        ...state,
        chatSessions: {
          ...state.chatSessions,
          [action.payload.chatId]: {
            messages: action.payload.messages,
          },
        },
      };
    case "DELETE_CHAT_SESSION": {
      const { [action.payload.chatId]: _, ...remainingSessions } =
        state.chatSessions;
      return {
        ...state,
        chatSessions: remainingSessions, // Remove the session entirely
      };
    }
    case "SET_RESEARCH_SUMMARY":
      return {
        ...state,
        researchSummaries: {
          ...state.researchSummaries,
          [action.payload.keywords]: {
            summary: action.payload.summary,
            timestamp: action.payload.timestamp,
          },
        },
      };
    case "SET_LOADING":
      return {
        ...state,
        loading: {
          ...state.loading,
          [action.payload.key]: action.payload.isLoading,
        },
      };

    case "SET_COLLABORATION_STATUS":
      return {
        ...state,
        collaborationStatus: {
          ...state.collaborationStatus,
          [action.payload.fileId]: {
            ...state.collaborationStatus[action.payload.fileId],
            isEnabled: action.payload.status,
          },
        },
      };

    default:
      return state;
  }
};

const AppStateContext = createContext<
  | {
      state: AppState;
      dispatch: Dispatch<Action>;
      workspaceId: string | undefined;
      folderId: string | undefined;
      fileId: string | undefined;
    }
  | undefined
>(undefined);

interface AppStateProviderProps {
  children: React.ReactNode;
}

function AppStateProvider({ children }: AppStateProviderProps) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const pathname = usePathname();

  const workspaceId = useMemo(() => {
    const urlSegments = pathname?.split("/").filter(Boolean);
    if (urlSegments)
      if (urlSegments.length > 1) {
        return urlSegments[1];
      }
  }, [pathname]);

  const folderId = useMemo(() => {
    const urlSegments = pathname?.split("/").filter(Boolean);
    if (urlSegments)
      if (urlSegments?.length > 2) {
        return urlSegments[2];
      }
  }, [pathname]);

  const fileId = useMemo(() => {
    const urlSegments = pathname?.split("/").filter(Boolean);
    if (urlSegments)
      if (urlSegments?.length > 3) {
        return urlSegments[3];
      }
  }, [pathname]);

  useEffect(() => {
    if (!folderId || !workspaceId) return;

    let mounted = true;
    const fetchFiles = async () => {
      try {
        dispatch({
          type: "SET_LOADING",
          payload: { key: "files", isLoading: true },
        });
        const { error: filesError, data } = await getFiles(folderId);

        if (!mounted) return;

        if (filesError) {
          dispatch({
            type: "SET_ERROR",
            payload: {
              key: "files",
              error:
                typeof filesError === "string"
                  ? filesError
                  : (filesError as Error).message ||
                    "An error occurred while fetching files",
            },
          });
          return;
        }

        if (data) {
          dispatch({
            type: "SET_FILE",
            payload: { workspaceId, files: data as File[], folderId },
          });
        }
      } catch (error) {
        if (mounted) {
          dispatch({
            type: "SET_ERROR",
            payload: {
              key: "files",
              error:
                error instanceof Error
                  ? error.message
                  : "An unknown error occurred",
            },
          });
        }
      } finally {
        if (mounted) {
          dispatch({
            type: "SET_LOADING",
            payload: { key: "files", isLoading: false },
          });
        }
      }
    };

    fetchFiles();
    return () => {
      mounted = false;
    };
  }, [folderId, workspaceId]);

  useEffect(() => {
    // console.log("App State Changed", state);
  }, [state]);

  return (
    <AppStateContext.Provider
      value={{ state, dispatch, workspaceId, folderId, fileId }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export default AppStateProvider;

export const useAppState = () => {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used within an AppStateProvider");
  }
  return context;
};
