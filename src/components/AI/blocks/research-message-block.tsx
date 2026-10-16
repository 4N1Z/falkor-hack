import React from "react";
import { Message } from "ai";
import Markdown from "react-markdown";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface ResearchPaper {
  paperId: string;
  title: string;
  authors: Array<{ name: string }>;
  year: number | null;
  externalIds?: {
    DOI?: string;
  };
  /** "team" = a collaborator's library (FalkorDB), "openalex" = wider literature */
  source?: "team" | "openalex";
  owners?: string[];
  passage?: string;
}

interface ResearchToolResponse {
  status: "SUCCESS" | "NO_RESULTS" | "RATE_LIMITED" | "ERROR";
  papers?: ResearchPaper[];
  message?: string;
}

const PaperCard = ({ paper, onCite }: { paper: ResearchPaper; onCite?: (paper: ResearchPaper) => void }) => {
  return (
    <div className="flex items-center gap-2">
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="text-primary block w-fit text-xs hover:underline hover:bg-sky-100 cursor-pointer">
            {paper.externalIds?.DOI ? (
              <a
                href={`https://doi.org/${paper.externalIds.DOI}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                {paper.authors[0]?.name.split(" ").pop() ?? paper.title.split(" ").slice(0, 3).join(" ")}…{paper.year ? `, ${paper.year}` : ""}
              </a>
            ) : (
              paper.title
            )}
            {paper.source === "team" && paper.owners?.length ? (
              <span className="ml-1.5 text-muted-foreground no-underline">· {paper.owners.join(" & ")}&apos;s library</span>
            ) : null}
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          className={`max-w-[380px] p-4   
          backdrop-blur-sm
          bg-card   
          shadow-[inset_2.471px_2.471px_10.941px_rgba(238,244,251,0.30),0px_8.206px_13.677px_rgba(109,205,247,0.30)]
          ring-2 ring-white/40 
          border border-sky-100
            `}
        >
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-foreground">
              {paper.title}
            </h4>
            <div className="text-xs space-y-2">
              <div>
                {/* <span className="font-medium text-xs text-muted-foreground ">Authors:</span>{" "} */}
                <span className="font-regular text-xs text-foreground opacity-50 ">
                  {paper.authors.map((a) => a.name).join(", ")}
                </span>
              </div>
              {paper.passage && <p className="text-xs italic text-muted-foreground line-clamp-3">“{paper.passage}”</p>}
              <div className="flex gap-2 ">
                <span>
                  <span className="font-medium text-xs">Year:</span>{" "}
                  {paper.year ?? "n.d."}
                </span>
                {paper.externalIds?.DOI && (
                  <a
                    href={`https://doi.org/${paper.externalIds.DOI}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline ml-auto text-sm"
                  >
                    View Paper
                  </a>
                )}
              </div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
    {onCite && (
      <button
        type="button"
        onClick={() => onCite(paper)}
        className="rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground transition-transform duration-150 ease-out hover:bg-primary/90 active:scale-[0.97]"
        title="Insert a citation at the cursor"
      >
        Cite
      </button>
    )}
    </div>
  );
};

const ResearchMessage = ({ message, onCite }: { message: Message; onCite?: (paper: ResearchPaper) => void }) => {
  const hasToolInvocation = (message.toolInvocations?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      {/* Always show the main message content */}
      <div className="message-content text-sm whitespace-pre-wrap">
        <Markdown>{message.content}</Markdown>
      </div>

      {/* Show papers if there are tool invocations */}
      {/* Every completed paper search (a reply can make several tool calls, not just one) */}
      {message.toolInvocations
        ?.filter((inv) => inv.toolName === "getResearchPaper" && inv.state === "result")
        .map((inv) => (
        <div key={inv.toolCallId} className="mt-4">
          {(() => {
            const result = (inv as { result: unknown }).result as ResearchToolResponse;

            if (result.status === "SUCCESS" && result.papers?.length) {
              return (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground mb-2">
                    Research Papers (hover for details):
                  </div>
                  {result.papers.map((paper) => (
                    <PaperCard key={paper.paperId} paper={paper} onCite={onCite} />
                  ))}
                </div>
              );
            }

            if (result.status === "NO_RESULTS") {
                return (
                  <div className="flex items-center gap-2 p-3 bg-yellow-50/50 border border-yellow-200 rounded-md text-yellow-700">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {result.message ?? "No papers found. Try a shorter phrase or a different term."}
                  </div>
                );
              }
              
              if (result.status === "ERROR") {
                return (
                  <div className="flex items-center gap-2 p-3 bg-red-50/50 border border-red-200 rounded-md text-red-700">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    I&apos;m having trouble accessing the research papers right now. Could you ask me again in a moment?
                  </div>
                );
              }
              
              if (result.status === "RATE_LIMITED") {
                return (
                  <div className="flex items-center gap-2 p-3 bg-orange-50/50 border border-orange-200 rounded-md text-orange-700">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    I think you have reached the limit of requests for the moment. DO try again later
                  </div>
                );
              }

            return null;
          })()}
        </div>
      ))}

      {/* Show loading state while any tool is still running */}
      {hasToolInvocation && message.toolInvocations?.some((inv) => inv.state !== "result") && (
        <div className="flex items-center gap-2 text-muted-foreground animate-pulse">
          <div className="h-4 w-4 rounded-full border-2 border-current border-r-transparent animate-spin" />
          Searching for papers...
        </div>
      )}
    </div>
  );
};

export default ResearchMessage;
