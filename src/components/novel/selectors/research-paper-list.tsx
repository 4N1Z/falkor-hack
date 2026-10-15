import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Quote } from "lucide-react";

import { CitationFormat, Paper } from "@/lib/types";

interface PaperListProps {
  papers: Paper[];
  citationFormat: CitationFormat;
  onCite: (paper: Paper) => void;
  formatCitation: (paper: Paper, format: CitationFormat) => string;
  getPaperUrl: (paper: Paper) => string;
}

export const PaperList = ({ 
  papers, 
  citationFormat, 
  onCite, 
  formatCitation,
  getPaperUrl 
}: PaperListProps) => {
  return (
    <ScrollArea className="h-[400px]">
      {papers.map((paper) => (
        <div
          key={paper.paperId}
          className="mb-3 rounded-lg border p-3 hover:bg-accent"
        >
          <div className="flex justify-between items-start gap-2">
            <div className="flex-1">
              <a
                href={getPaperUrl(paper)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium hover:underline"
              >
                {paper.title}
              </a>
              <p className="mt-1 text-xs text-muted-foreground">
                {paper.authors.map(a => a.name).join(", ")} ({paper.year})
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onCite(paper)}
              className="shrink-0"
            >
              <Quote className="h-4 w-4 mr-1" />
              Cite
            </Button>
          </div>
          <div className="mt-2 text-xs">
            <p className="text-muted-foreground">Citation Preview:</p>
            <p className="mt-1 text-xs">{formatCitation(paper, citationFormat)}</p>
          </div>
        </div>
      ))}
    </ScrollArea>
  );
};