import { Author, CitationFormat, Paper } from "@/lib/types";

 export const getPaperUrl = (paper: Paper): string => {
    if (paper.externalIds.DOI) {
      return `https://doi.org/${paper.externalIds.DOI}`;
    }
    if (paper.externalIds.ArXiv) {
      return `https://arxiv.org/abs/${paper.externalIds.ArXiv}`;
    }
    return `https://www.semanticscholar.org/paper/${paper.paperId}`;
  };

export const formatAuthors = (authors: Author[]): string => {
    if (authors.length === 0) return "Unknown Author";
    if (authors.length === 1) return authors[0].name;
    if (authors.length === 2)
      return `${authors[0].name} and ${authors[1].name}`;
    return `${authors[0].name} et al.`;
  };

export const formatCitation = (paper: Paper, format: CitationFormat): string => {
    const url = getPaperUrl(paper);

    switch (format) {
      case "APA":
        return `${formatAuthors(paper.authors)} (${paper.year}). ${
          paper.title
        }. ${url}`;
      case "MLA":
        return `${formatAuthors(paper.authors)}. "${paper.title}." ${
          paper.year
        }. ${url}`;
      case "IEEE":
        return `[${paper.year}] ${formatAuthors(paper.authors)}, "${
          paper.title
        }." ${url}`;
      default:
        return `${formatAuthors(paper.authors)} (${paper.year})`;
    }
  };


  interface SearchState {
    type: 'NO_SELECTION' | 'NO_RESULTS' | 'ERROR' | 'EMPTY';
    message: string;
    suggestion: string;
  }
  
  export const getSearchState = (error?: any, isSearchMode = false): SearchState => {
    if (error) {
      return {
        type: 'ERROR',
        message: "Hmm, that didn't work as expected",
        suggestion: isSearchMode 
          ? "Try searching with different keywords or a shorter phrase"
          : "Try selecting a different paragraph or a shorter piece of text"
      };
    }
  
    if (isSearchMode) {
      return {
        type: 'EMPTY',
        message: "Ready to explore research papers?",
        suggestion: "Type keywords or paste a research question"
      };
    }
  
    return {
      type: 'NO_SELECTION',
      message: "Looking for relevant research papers?",
      suggestion: "Select a paragraph or key sentence from your text"
    };
  };
  