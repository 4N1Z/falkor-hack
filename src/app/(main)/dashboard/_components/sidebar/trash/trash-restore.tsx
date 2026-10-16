'use client';

import { updateFile, updateFolder } from '@/db/actions/action-workspace';
import { File } from '@/db/database.types';
import { appFoldersType, useAppState } from '@/lib/providers/state-providers';
import { ArchiveIcon, ArchiveRestore, FileIcon, FolderIcon, Loader2 } from 'lucide-react';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';

const rowStyle =
  'group flex items-center gap-2 rounded-md p-2 text-sm text-neura-dashboardGray ' +
  'border border-transparent transition-[background-color,border-color] duration-150 ease-out ' +
  'hover:bg-muted hover:border-sky-100 animate-fadeIn opacity-0';

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
    {children}
  </h3>
);

// Short, capped stagger so long lists never feel slow (30ms steps, max 150ms)
const stagger = (i: number) => ({ animationDelay: `${Math.min(i, 5) * 30}ms` });

function RestoreButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary transition-[background-color,transform,opacity] duration-150 ease-out hover:bg-sky-50 active:scale-[0.97] disabled:opacity-60"
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : <ArchiveRestore size={12} />}
      Restore
    </button>
  );
}

type ArchivedFile = File & { folderArchived: boolean };

const TrashRestore = () => {
  const { state, dispatch, workspaceId } = useAppState();
  const [folders, setFolders] = useState<appFoldersType[] | []>([]);
  const [files, setFiles] = useState<ArchivedFile[] | []>([]);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    const workspaceFolders =
      state.workspaces.find((workspace) => workspace.id === workspaceId)?.folders || [];

    setFolders(workspaceFolders.filter((folder) => folder.inTrash));

    const stateFiles: ArchivedFile[] = [];
    workspaceFolders.forEach((folder) => {
      folder.files.forEach((file) => {
        if (file.inTrash) {
          stateFiles.push({ ...(file as File), folderArchived: !!folder.inTrash });
        }
      });
    });
    setFiles(stateFiles);
  }, [state, workspaceId]);

  const restoreFolder = async (folder: appFoldersType) => {
    if (!workspaceId) return;
    setRestoring(folder.id);
    dispatch({
      type: 'UPDATE_FOLDER',
      payload: { folder: { inTrash: null }, folderId: folder.id, workspaceId },
    });
    const { error } = await updateFolder({ inTrash: null }, folder.id);
    setRestoring(null);
    if (error) {
      dispatch({
        type: 'UPDATE_FOLDER',
        payload: { folder: { inTrash: folder.inTrash }, folderId: folder.id, workspaceId },
      });
      toast.error('Could not restore the folder');
      return;
    }
    toast(`Restored “${folder.title}”`);
  };

  const restoreFile = async (file: ArchivedFile) => {
    if (!workspaceId) return;
    setRestoring(file.id);
    dispatch({
      type: 'UPDATE_FILE',
      payload: { file: { inTrash: null }, folderId: file.folderId, workspaceId, fileId: file.id },
    });
    const { error } = await updateFile({ inTrash: null }, file.id);
    setRestoring(null);
    if (error) {
      dispatch({
        type: 'UPDATE_FILE',
        payload: { file: { inTrash: file.inTrash }, folderId: file.folderId, workspaceId, fileId: file.id },
      });
      toast.error('Could not restore the file');
      return;
    }
    toast(`Restored “${file.title}”`, {
      description: file.folderArchived
        ? 'Its folder is still archived. Restore the folder to see it in the sidebar.'
        : undefined,
    });
  };

  if (!files.length && !folders.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground animate-fadeIn opacity-0">
        <ArchiveIcon size={28} strokeWidth={1.5} />
        <p className="text-sm">Nothing in the archive</p>
        <p className="text-xs">Archived folders and files show up here.</p>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-1">
      {!!folders.length && (
        <>
          <SectionTitle>Folders</SectionTitle>
          {folders.map((folder, i) => (
            <div key={folder.id} className={rowStyle} style={stagger(i)}>
              <FolderIcon size={16} className="shrink-0" />
              <span className="truncate">{folder.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {folder.files.length} {folder.files.length === 1 ? 'file' : 'files'}
              </span>
              <RestoreButton
                busy={restoring === folder.id}
                onClick={() => restoreFolder(folder)}
              />
            </div>
          ))}
        </>
      )}
      {!!files.length && (
        <>
          <SectionTitle>Files</SectionTitle>
          {files.map((file, i) => (
            <div key={file.id} className={rowStyle} style={stagger(i + folders.length)}>
              <FileIcon size={16} className="shrink-0" />
              <Link
                href={`/dashboard/${file.workspaceId}/${file.id}`}
                className="truncate hover:text-foreground hover:underline underline-offset-2"
              >
                {file.title}
              </Link>
              <RestoreButton
                busy={restoring === file.id}
                onClick={() => restoreFile(file)}
              />
            </div>
          ))}
        </>
      )}
    </section>
  );
};

export default TrashRestore;
