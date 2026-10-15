"use client"

import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, UploadIcon, CheckCircle2, XCircle } from "lucide-react";
import ImportPaper from "@/components/zotero/components/dialog/ImportPaper";
import { useUser } from "@/lib/providers/user-provider";
import { toast } from "sonner";

interface UploadResearchPapersProps {
  workspaceId: string;
  workspaceName: string;
}

interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: 'queued' | 'uploading' | 'completed' | 'error';
  error?: string;
}

/** Dropzone + upload queue. Reused by the dashboard upload dialog and the Research Library. */
export function UploadPanel({ workspaceId, onUploaded }: { workspaceId: string; onUploaded?: () => void }) {
  const [uploadQueue, setUploadQueue] = useState<UploadingFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const { session } = useUser();

  // Process the upload queue
  useEffect(() => {
    const processUpload = async (fileInfo: UploadingFile) => {
      try {
        // Update status to uploading
        setUploadQueue(queue => 
          queue.map(item => 
            item.id === fileInfo.id 
              ? { ...item, status: 'uploading' as const, progress: 20 } 
              : item
          )
        );

        // Create FormData
        const formData = new FormData();
        formData.append('file', fileInfo.file);
        formData.append('workspaceId', workspaceId);
        formData.append('title', fileInfo.file.name.replace(/\.[^/.]+$/, ""));

        // console.log("Form Data:")
        // stop()

        // Upload file
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText);
        }

        const result = await response.json();
        // console.log("After uploading :", result)

        // Update status to completed
        setUploadQueue(queue => 
          queue.map(item => 
            item.id === fileInfo.id 
              ? { ...item, status: 'completed', progress: 100 } 
              : item
          )
        );

        toast.success(`Successfully uploaded ${fileInfo.file.name}`);
        onUploaded?.();

      } catch (error) {
        console.error(`Error uploading ${fileInfo.file.name}:`, error);
        setUploadQueue(queue => 
          queue.map(item => 
            item.id === fileInfo.id 
              ? { 
                  ...item, 
                  status: 'error', 
                  error: error instanceof Error ? error.message : 'Upload failed'
                } 
              : item
          )
        );
        toast.error(`Failed to upload ${fileInfo.file.name}`);
      }
    };

    const processQueue = async () => {
      const queuedFile = uploadQueue.find(f => f.status === 'queued');
      if (queuedFile && !isUploading) {
        setIsUploading(true);
        await processUpload(queuedFile);
        setIsUploading(false);
      }
    };

    processQueue();
  }, [uploadQueue, isUploading, workspaceId]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (!session?.user?.id) {
      toast.error('Please sign in to upload files');
      return;
    }

    // Add new files to queue
    const newFiles: UploadingFile[] = acceptedFiles.map(file => ({
      id: Math.random().toString(36).slice(2),
      file,
      progress: 0,
      status: 'queued'
    }));
    
    setUploadQueue(prev => [...prev, ...newFiles]);
  }, [session?.user?.id]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    },
    maxSize: 10 * 1024 * 1024 // 50MB
  });

  const FileList = () => uploadQueue.length > 0 && (
    <div className="mt-4 space-y-2">
      {uploadQueue.map((file) => (
        <div key={file.id} className="flex items-center justify-between p-2 bg-muted/30 rounded-md">
          <div className="flex items-center space-x-2 flex-1">
            <span className="text-sm truncate max-w-[200px]">{file.file.name}</span>
            {(file.status === 'uploading' || file.status === 'queued') && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {file.status === 'completed' && (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            )}
            {file.status === 'error' && (
              <div className="flex items-center space-x-1 text-red-500">
                <XCircle className="h-4 w-4" />
                {file.error && <span className="text-xs">{file.error}</span>}
              </div>
            )}
          </div>
          {(file.status === 'uploading' || file.status === 'queued') && (
            <div className="w-24">
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300" 
                  style={{ width: `${file.progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <>
      <div
        {...getRootProps()}
        className={`
          flex flex-col min-h-12 gap-2 items-center justify-center
          border-dashed border-2 border-sky-100 rounded-md p-5
          font-sans transition-colors duration-150
          ${isDragActive ? 'bg-sky-50/10 border-sky-500' : ''}
          ${isUploading ? 'opacity-50' : 'cursor-pointer hover:border-sky-300'}
        `}
      >
        <input {...getInputProps()} />
        {isDragActive ? (
          <p className="text-sky-500">Drop your papers here</p>
        ) : (
          <div className="text-center">
            <p className="text-sm mb-1">
              {isUploading ? 'Uploading...' : "Drag and drop your research papers here"}
            </p>
            <p className="text-xs text-muted-foreground">or click to browse</p>
          </div>
        )}
      </div>
      <FileList />
    </>
  );
}

export default function UploadResearchPapers({ workspaceId, workspaceName }: UploadResearchPapersProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" className="text-sm" variant="link">
          <UploadIcon size={16} className="mr-1" />
          Upload
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-sans">Upload Research Papers</DialogTitle>
          <DialogDescription className="font-sans">
            Upload your research papers to {workspaceName}
          </DialogDescription>
        </DialogHeader>

        <UploadPanel workspaceId={workspaceId} />

        <DialogFooter className="flex justify-between items-center font-sans">
          <div className="text-xs text-muted-foreground">
            Max size: 10MB • Supported: PDF, DOC, DOCX
          </div>
          <ImportPaper workspaceId={workspaceId} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
