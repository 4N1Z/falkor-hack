import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Paper } from "@/lib/types";
import { Loader2, Search } from "lucide-react";
import { useState } from "react";
import { PaperAutocomplete } from "./research-paper-autocomplete";

interface PaperSearchProps {
  onSearchResults: (papers: Paper[]) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export const PaperSearch = ({ onSearchResults, isLoading, setIsLoading }: PaperSearchProps) => {
  const [searchInput, setSearchInput] = useState("");

  const handleSearch = async () => {
    if (!searchInput.trim()) return;
    setIsLoading(true);
    try {
      const response = await fetch(
        `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(
          searchInput
        )}&limit=3&sort=recency&fields=title,authors,year,externalIds`,
        {
          headers: {
            "Content-Type": "application/json",
          },
          next: { revalidate: 3600 },
        }
      );
      
      const data = await response.json();
      onSearchResults(data.data);
    } catch (error) {
      console.error("Error searching papers:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaperSelect = async (paperId: string) => {
    setIsLoading(true);
    try {
      // Fetch full paper details when a suggestion is selected
      const response = await fetch(
        `https://api.semanticscholar.org/graph/v1/paper/${paperId}?fields=title,authors,year,externalIds`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      
      const paper = await response.json();
      // Convert to expected format and update results
      onSearchResults([{
        paperId: paper.paperId,
        title: paper.title,
        authors: paper.authors,
        year: paper.year,
        externalIds: paper.externalIds
      }]);
    } catch (error) {
      console.error("Error fetching paper details:", error);
    } finally {
      setIsLoading(false);
    }
  };


  return (
    // <div className="flex flex-col gap-2">
    //   <div className="flex gap-2">
    //     <Input
    //       type="text"
    //       value={searchInput}
    //       onChange={(e) => setSearchInput(e.target.value)}
    //       placeholder="Search for papers..."
    //       className="flex-1"
    //       onKeyDown={(e) => {
    //         if (e.key === 'Enter') {
    //           handleSearch();
    //         }
    //       }}
    //     />
    //     <Button 
    //       size="sm" 
    //       onClick={handleSearch}
    //       disabled={isLoading}
    //     >
    //       {isLoading ? (
    //         <Loader2 className="h-4 w-4 animate-spin" />
    //       ) : (
    //         <Search className="h-4 w-4" />
    //       )}
    //     </Button>
    //   </div>
    // </div>
    <div className="flex flex-col gap-2">
    <PaperAutocomplete
      onSelectPaper={handlePaperSelect}
      isLoading={isLoading}
      setIsLoading={setIsLoading}
    />
  </div>
  );
};