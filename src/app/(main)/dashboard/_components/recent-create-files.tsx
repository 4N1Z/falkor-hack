"use client";

import { Card } from "@/components/ui/card";
import { useWorkspaceFiles } from "@/lib/hooks/state-management-hooks";
import { getLastUpdatedTime } from "@/lib/utils";
import { ArrowUpRight, Clock, FileText } from "lucide-react";
import Link from "next/link";

interface RecentCreateFilesProps {
  workspaceId: string;
}

/** The four most recently edited files, so you can jump straight back in. */
export default function RecentCreateFiles({ workspaceId }: RecentCreateFilesProps) {
  const recentFiles = useWorkspaceFiles(workspaceId);

  return (
    <div className="flex w-full flex-col gap-3">
      <h2 id="recent-heading" className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Clock size={14} />
        Recently edited
      </h2>

      {recentFiles.length > 0 ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {recentFiles.map((file, i) => (
            <li key={file.id} className="animate-fadeIn opacity-0" style={{ animationDelay: `${i * 40}ms` }}>
              <Link
                href={`/dashboard/${workspaceId}/${file.id}`}
                title={file.title}
                className="group block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
              >
                <Card
                  className="flex h-full flex-col gap-3 rounded-xl border border-sky-100 p-4
                    transition-[border-color,box-shadow,transform] duration-200 ease-out
                    group-hover:border-sky-200 group-hover:shadow-[0_4px_14px_rgba(109,205,247,0.18)]
                    group-active:scale-[0.98]"
                >
                  <div className="flex items-start justify-between">
                    <span className="text-xl leading-none">{file.iconId}</span>
                    <ArrowUpRight
                      size={14}
                      className="text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                    />
                  </div>
                  <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">{file.title}</p>
                  <p className="mt-auto text-xs text-muted-foreground">Edited {getLastUpdatedTime(file.updatedAt)}</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-sky-100 px-5 py-6 text-sm text-muted-foreground">
          <FileText size={18} strokeWidth={1.5} className="shrink-0" />
          No files yet. Create one from a folder in the sidebar and it will show up here.
        </div>
      )}
    </div>
  );
}
