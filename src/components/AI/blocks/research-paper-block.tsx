import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Bookmark } from "lucide-react";



interface ResearchPaperProps {
  aiContent?: string;
  title: string;
  abstract?: string;
  authors?: { name: string }[];
  year?: number;
  citationCount?: number;
  externalIds?: {
    DOI?: string;
    CorpusId?: number;
    PubMed?: string;
    [key: string]: string | number | undefined; // Allow for other potential ID types
  };
}

export function ResearchPaper({
  aiContent,
  title,
  abstract,
  authors,
  year,
  citationCount,
  externalIds,
}: ResearchPaperProps) {
  return (
    <div className="mt-2 p-3 rounded-lg border  space-y-2">
      <a
        href={`https://doi.org/${externalIds?.DOI}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-semibold hover:underline text-primary text-ellipsis line-clamp-2 "
      >
        {title}
      </a>

      <div className="text-xs space-x-2">
        {authors?.slice(0, 3).map((author, i) => (
          <span key={i} className="text-gray-400">
            {author.name}
            {i < Math.min(2, (authors?.length || 1) - 1) && ", "}
          </span>
        ))}
        {authors && authors.length > 3 && (
          <span className="text-gray-400">et al.</span>
        )}
        {year && <span className="text-gray-400">• {year}</span>}
        {citationCount !== undefined && (
          <span className="text-gray-400">• {citationCount} citations</span>
        )}
      </div>
      <div></div>
      {abstract && (
        <p className="text-xs text-gray-300 line-clamp-2">{abstract}</p>
      )}
    </div>
  );
}


export function ResearchPaperLink({
  aiContent,
  title,
  externalIds,
  authors,
  year,
  citationCount,
}: ResearchPaperProps) {
  return (
    <div className="flex items-start gap-2">
      <p>{aiContent}</p>
    
      <span className="text-primary ">•</span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={`https://doi.org/${externalIds?.DOI}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-primary hover:underline line-clamp-1 text-ellipsis"
            >
              {title}
            </a>
          </TooltipTrigger>
          <TooltipContent side="right" className="w-80 bg-none  p-0">
            <div className="p-2 rounded-lg border space-y-2">
              <h3 className="text-xs text-primaryfont-semibold">{title}</h3>
              <div className="text-xs space-x-2">
                {authors && authors?.slice(0, 3).map((author, i) => (
                  <span key={i} className="text-gray-400">
                    {author.name}
                    {i < Math.min(2, authors.length - 1) && ", "}
                  </span>
                ))}
                {authors && authors.length > 3 && (
                  <span className="text-primary">et al.</span>
                )}

                <div>
                  {year && (
                    <span className="text-primary text-xs">• {year}</span>
                  )}
                  {citationCount !== undefined && (
                    <span className="text-primary">
                      • {citationCount} citations
                    </span>
                  )}
                </div>
              </div>
              <div className="flex w-full justify-between items-center gap-2">
                <a href={`https://doi.org/${externalIds?.DOI}`} target="_blank" rel="noopener noreferrer">
                  <span className="text-primary text-xs">Read more →</span>
                </a>
                <button className="p-1 rounded-lg border bg-primary">
                  <Bookmark size={14} className="text-white" />
                </button>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
