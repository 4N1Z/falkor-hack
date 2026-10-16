"use client";

import { Button } from "@/components/ui/button";
import { useCurrentEditor } from "@tiptap/react";
import { Search } from "lucide-react";
import { FIND_PAPERS_EVENT, type FindPapersDetail } from "../find-papers-dialog";

/**
 * Bubble-menu "Search papers": opens the Find papers dialog with the selected text as the
 * query, so the search runs over the team's graph (FalkorDB) first and OpenAlex second, and
 * the citation it inserts is a link the graph can resolve. This replaced a popover that
 * called Semantic Scholar from the browser without a key (rate-limited, often empty) and
 * inserted semanticscholar.org links no agent could trace back to a paper.
 */
export function FindPapersButton() {
  const { editor } = useCurrentEditor();
  if (!editor) return null;
  return (
    <Button
      size="sm"
      variant="ghost"
      className="gap-2 rounded-sm transition-transform duration-150 ease-out active:scale-[0.97]"
      onClick={() => {
        const { from, to } = editor.state.selection;
        const query = editor.state.doc
          .textBetween(from, to, " ")
          .replace(/\[[^\]]*\]/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 300);
        window.dispatchEvent(new CustomEvent<FindPapersDetail>(FIND_PAPERS_EVENT, { detail: { query, pos: to } }));
      }}
    >
      <Search size={14} className="text-amber-500" />
      <span className="text-sm">Search papers</span>
    </Button>
  );
}
