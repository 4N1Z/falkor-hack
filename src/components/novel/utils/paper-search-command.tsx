import React, { useState } from 'react';
import { Command } from "@/components/ui/command";

import { Paper } from "@/lib/types";
import { PaperAutocomplete } from '../selectors/research-paper-autocomplete';

interface PaperSearchCommandProps {
  editor: any;
  range: any;
}

export const PaperSearchCommand = ({ editor, range }: PaperSearchCommandProps) => {
  const [isLoading, setIsLoading] = useState(false);

  const handlePaperSelect = async (paperId: string) => {
    try {
      // Fetch full paper details
      const response = await fetch(
        `https://api.semanticscholar.org/graph/v1/paper/${paperId}?fields=title,authors,year,externalIds`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      
      const paper = await response.json();
      
      // Insert the citation into the editor
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent([
          { type: "text", text: " [" },
          {
            type: "text",
            marks: [
              { 
                type: "link", 
                attrs: { 
                  href: `https://www.semanticscholar.org/paper/${paper.paperId}` 
                } 
              }
            ],
            text: `${paper.authors[0]?.name || 'Unknown'} et al., ${paper.year}`
          },
          { type: "text", text: "]" },
        ])
        .run();

    } catch (error) {
      console.error("Error fetching paper details:", error);
    }
  };

  return (
    <div className="relative">
      <Command className="rounded-lg border shadow-md">
        <PaperAutocomplete
          onSelectPaper={handlePaperSelect}
          isLoading={isLoading}
          setIsLoading={setIsLoading}
        />
      </Command>
    </div>
  );
};