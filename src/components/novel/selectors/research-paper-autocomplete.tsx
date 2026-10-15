import { useState, useEffect } from "react";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Loader2, Search } from "lucide-react";
import { useDebounce } from 'use-debounce';

interface AutocompleteMatch {
  id: string;
  title: string;
  year?: number;
  authors?: string[];
}

interface PaperAutocompleteProps {
  onSelectPaper: (paperId: string) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export const PaperAutocomplete = ({ 
  onSelectPaper, 
  isLoading, 
  setIsLoading 
}: PaperAutocompleteProps) => {
    const [query, setQuery] = useState("");
    const [matches, setMatches] = useState<AutocompleteMatch[]>([]);
    
    const [debouncedQuery] = useDebounce(query, 300);
  
    useEffect(() => {
      const fetchAutocomplete = async () => {
        if (debouncedQuery.length < 3) {
          setMatches([]);
          return;
        }
  
        setIsLoading(true);
        try {
          const response = await fetch(
            `https://api.semanticscholar.org/graph/v1/paper/autocomplete?query=${encodeURIComponent(debouncedQuery)}`,
            {
              headers: {
                "Content-Type": "application/json",
              },
            }
          );
          
          const data = await response.json();
          setMatches(data.matches);
        } catch (error) {
          console.error("Error fetching autocomplete:", error);
          setMatches([]);
        } finally {
          setIsLoading(false);
        }
      };
  
      fetchAutocomplete();
    }, [debouncedQuery, setIsLoading]);
  
  return (
    <Command className="rounded-lg border shadow-md">
      <div className="flex items-center border-b px-3">
        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search papers..."
          className="h-11 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      </div>
      <CommandList>
        <CommandEmpty className="py-6 text-center text-sm">
          {query.length < 3 ? 
            "Type at least 3 characters to search..." : 
            "No papers found."
          }
        </CommandEmpty>
        <CommandGroup heading="Suggestions">
          {matches.map((match) => (
            <CommandItem
              key={match.id}
              value={match.title}
              onSelect={() => onSelectPaper(match.id)}
              className="flex flex-col items-start py-2"
            >
              <span className="text-sm font-medium">{match.title}</span>
              {(match.authors || match.year) && (
                <span className="text-xs text-muted-foreground">
                  {match.authors?.join(", ")} {match.year && `(${match.year})`}
                </span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
};