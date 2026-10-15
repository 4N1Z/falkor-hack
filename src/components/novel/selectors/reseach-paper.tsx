import { useEditor } from "novel";
import { Book, Loader2, Quote, Search, SearchIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSearchQuery } from "@/lib/action/get-search-query";
import {
  CitationFormat,
  Paper,
  SemanticScholarSelectorProps,
} from "@/lib/types";
import { PaperList } from "./research-paper-list";
import { PaperSearch } from "./research-paper-search";
import {
  formatCitation,
  getPaperUrl,
  getSearchState,
} from "@/utils/citation-utils";
import { AIStars } from "@/lib/logos";
interface SearchError {
  message: string;
  code?: string;
}

export const SemanticScholarSelector = ({
  open,
  onOpenChange,
}: SemanticScholarSelectorProps) => {
  const { editor } = useEditor();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [citationFormat, setCitationFormat] = useState<CitationFormat>("APA");
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [error, setError] = useState<SearchError | null>(null);

  useEffect(() => {
    if (open && editor && !isSearchMode) {
      const selection = editor.state.selection;
      const text = editor.state.doc.textBetween(
        selection.from,
        selection.to,
        " "
      );
      setSelectedText(text);
      if (text) {
        searchPapers(text);
      }
    }
  }, [open, editor, isSearchMode]);

  const searchPapers = useCallback(async (query: string) => {
    setLoading(true);
    setError(null); // Add error state
    try {
      // First check if we got a valid search query
      const searchQuery = await getSearchQuery(query);
      if (!searchQuery.data) {
        throw new Error("Could not generate search query");
      }

      const response = await fetch(
        `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(
          searchQuery.data
        )}&limit=3&sort=recency&fields=title,authors,year,externalIds`,
        {
          headers: {
            "Content-Type": "application/json",
          },
          next: { revalidate: 3600 },
        }
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      // Check if we have valid data
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error("Invalid response format");
      }

      if (data.data.length === 0) {
        setError({ message: "No papers found for this query" });
        setPapers([]);
        return;
      }

      setPapers(data.data);
    } catch (error) {
      console.error("Error searching papers:", error);
      setError({
        message: "Failed to search papers",
        code: error instanceof Error ? error.message : undefined,
      });
      setPapers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Add error state to component

  useEffect(() => {
    if (open && editor && !isSearchMode) {
      const selection = editor.state.selection;
      const text = editor.state.doc.textBetween(
        selection.from,
        selection.to,
        " "
      );
      setSelectedText(text);
      if (text) {
        searchPapers(text);
      }
    }
  }, [open, editor, isSearchMode, searchPapers]);

  const insertCitation = useCallback(
    (paper: Paper) => {
      if (!editor) return;

      // Get the current position and find the end of line
      const { from } = editor.state.selection;
      const pos = from;
      const resolvedPos = editor.state.doc.resolve(pos);
      const endOfLine = resolvedPos.end();

      editor
        .chain()
        .focus()
        .setTextSelection(endOfLine) // Move cursor to end of line
        .insertContent([
          { type: "text", text: " [" },
          {
            type: "text",
            marks: [{ type: "link", attrs: { href: getPaperUrl(paper) } }],
            text:
              paper.title.split(" ").slice(0, 10).join(" ") +
              (paper.title.split(" ").length > 10 ? "..." : ""),
          },
          { type: "text", text: "]" },
        ])
        .run();

      onOpenChange(false);
    },
    [editor, onOpenChange]
  );

  const insertAllCitations = useCallback(() => {
    if (!editor) return;

    // Get the current position and find the end of line
    const { from } = editor.state.selection;
    const pos = from;
    const resolvedPos = editor.state.doc.resolve(pos);
    const endOfLine = resolvedPos.end();

    const citations = papers.flatMap((paper, index) => [
      {
        type: "text",
        marks: [{ type: "link", attrs: { href: getPaperUrl(paper) } }],
        text: paper.title,
      },
      ...(index < papers.length - 1 ? [{ type: "text", text: ", " }] : []),
    ]);

    editor
      .chain()
      .focus()
      .setTextSelection(endOfLine) // Move cursor to end of line
      .insertContent([
        { type: "text", text: " (" },
        ...citations,
        { type: "text", text: ")" },
      ])
      .run();

    onOpenChange(false);
  }, [editor, papers, onOpenChange]);

  const toggleSearch = useCallback((mode: boolean) => {
    setIsSearchMode(mode);
    if (!mode) setPapers([]); // Clear results when switching to AI mode
  }, []);

  if (!editor) return null;

  return (
    <Popover modal={true} open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="gap-2 rounded-sm hover:bg-card hover:border hover:border-sky-100 focus:ring-0"
        >
        <span className="p-1.5 bg-amber-50 border border-amber-500 rounded-sm">

          <Search className="text-amber-500 " size={14}/>
        </span>
          <p className="text-sm">Search Papers</p>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-96 p-2 z-[9999] font-sans overflow-y-scroll h-full max-h-[55vh]"
        sideOffset={10}
      >
        <div className="mb-2 space-y-2">
          <div className="flex justify-between items-center mb-4">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={!isSearchMode ? "neuraShadow" : "ghost"}
                onClick={() => setIsSearchMode(false)}
              >
                <span className="flex items-center gap-1">
                  <span className="[&_svg]:w-5 [&_svg]:h-5">{AIStars}</span>
                  AI Results
                </span>
              </Button>

              <Button
                size="sm"
                variant={isSearchMode ? "neuraShadow" : "ghost"}
                onClick={() => setIsSearchMode(true)}
              >
                <span className="flex items-center gap-1">
                  <Search size={14} />
                  Search
                </span>
              </Button>
            </div>
            {papers.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={insertAllCitations}
                className="shrink-0"
              >
                <Quote size={14} />
                Cite All ({papers.length})
              </Button>
            )}
          </div>

          {isSearchMode ? (
            <PaperSearch
              onSearchResults={setPapers}
              isLoading={loading}
              setIsLoading={setLoading}
            />
          ) : (
            <>
              <h3 className="text-sm font-medium">AI Results for:</h3>
              <p className="text-xs text-muted-foreground">{selectedText}</p>
            </>
          )}

          <Tabs defaultValue="APA" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="APA" onClick={() => setCitationFormat("APA")}>
                APA
              </TabsTrigger>
              <TabsTrigger value="MLA" onClick={() => setCitationFormat("MLA")}>
                MLA
              </TabsTrigger>
              <TabsTrigger
                value="IEEE"
                onClick={() => setCitationFormat("IEEE")}
              >
                IEEE
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span className="text-sm text-muted-foreground">
              Finding relevant papers...
            </span>
          </div>
        ) : papers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            {error || !selectedText ? (
              <>
                <div className="text-lg mb-2">
                  {getSearchState(error, isSearchMode).message}
                </div>
                <div className="text-sm text-muted-foreground">
                  {getSearchState(error, isSearchMode).suggestion}
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">
                Analyzing your text to find relevant papers...
              </div>
            )}
          </div>
        ) : (
          <PaperList
            papers={papers}
            citationFormat={citationFormat}
            onCite={insertCitation}
            formatCitation={formatCitation}
            getPaperUrl={getPaperUrl}
          />
        )}
      </PopoverContent>
    </Popover>
  );
};
