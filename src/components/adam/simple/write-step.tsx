"use client";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ProjectStatus } from "@/lib/adam/status";
import { refreshAdam } from "@/lib/hooks/use-adam";
import { FileText, Loader2, RotateCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { post } from "./steps";

/** Step 5 · Write. One button writes the pass up as a document; one starts the next pass. */
export function WriteStep({ workspaceId, status, onRestart }: { workspaceId: string; status: ProjectStatus; onRestart: () => void }) {
  const project = status.project;
  const [busy, setBusy] = useState<string | null>(null);
  const papers = [...project.papers].sort((a, b) => b.at - a.at);

  const run = async (label: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(label);
    try {
      await fn();
      await refreshAdam(workspaceId, project.id);
      toast.success(msg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border bg-white p-5 flex flex-col gap-3">
        <div>
          <h3 className="font-medium">Write up pass {project.pass}</h3>
          <p className="text-sm text-muted-foreground">A document in the Adam folder of this workspace: the question, what was read, the hypotheses, the attacks, the experiment, your observations and verdict, with every claim linked to its paper and page. Share it with collaborators like any other document.</p>
        </div>
        <Button className="self-start" disabled={busy !== null} onClick={() => run("paper", () => post(`/api/adam/${project.id}/paper`, { workspaceId }), "Write-up saved to the Adam folder")}>
          {busy === "paper" ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}<span className="ml-1.5">Write it up</span>
        </Button>
        {papers.length > 0 && (
          <ul className="text-sm flex flex-col gap-1">
            {papers.map((p) => (
              <li key={p.fileId} className="flex items-center gap-2">
                <FileText className="size-3.5 text-muted-foreground" />
                <a href={`/dashboard/${workspaceId}/${p.fileId}`} className="hover:underline decoration-dotted">{p.title}</a>
                <span className="text-xs text-muted-foreground">pass {p.pass} · {new Date(p.at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border bg-white p-5 flex flex-col gap-3">
        <div>
          <h3 className="font-medium">Go again</h3>
          <p className="text-sm text-muted-foreground">The next pass starts from what this one left open: the attacks nobody answered, the gaps in the chain, and your verdict. Adam sharpens the questions, reads what is new, and the hypotheses update.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={busy !== null}><RotateCw className="size-3.5" /><span className="ml-1.5">Start pass {project.pass + 1}</span></Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Start pass {project.pass + 1}?</AlertDialogTitle>
                <AlertDialogDescription>Adam rewrites the question page from what is still open and asks you to approve it before reading again. Nothing from this pass is lost.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Not now</AlertDialogCancel>
                <AlertDialogAction onClick={() => run("next", () => post(`/api/adam/${project.id}/saturation`, { workspaceId, nextPass: true }).then(onRestart), `Pass ${project.pass + 1} started: approve the new scope in Ask`)}>Start</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="ghost" disabled={busy !== null} onClick={() => run("resweep", () => post(`/api/adam/${project.id}/saturation`, { workspaceId, resweep: true }), "Re-sweep queued: new papers citing the core will be read")}>
            Just check for new papers
          </Button>
        </div>
      </section>
    </div>
  );
}
