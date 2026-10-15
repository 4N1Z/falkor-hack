"use client";

import { getResearchPaperSummary } from "../action/get-summary";
import { useAppState } from "../providers/state-providers";

export function useResearchSummary() {

  const { state, dispatch } = useAppState();
  const getCachedSummary = async (keywords: string) => {
    // First check memory state
    const cached = state.researchSummaries[keywords];
    const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;

    // If not in memory, check localStorage
    if (!cached) {
      const storedData = localStorage.getItem(`research_summary_${keywords}`);
      if (storedData) {
        const parsed = JSON.parse(storedData);
        if (Date.now() - parsed.timestamp < TWO_DAYS) {
          // Restore to state
          dispatch({
            type: "SET_RESEARCH_SUMMARY",
            payload: {
              keywords,
              summary: parsed.summary,
              timestamp: parsed.timestamp,
            },
          });
          return { data: parsed.summary };
        }
      }
    }

    // Use memory cache if valid
    if (cached && Date.now() - cached.timestamp < TWO_DAYS) {
      return { data: cached.summary };
    }

    // If no cache or cache is invalid, get fresh data
    const { data: newSummary, error } = await getResearchPaperSummary();

    // Show the message, but don't cache a failure for two days
    if (error) return { data: newSummary };

    // Update both state and localStorage
    const newData = {
      keywords,
      summary: newSummary,
      timestamp: Date.now(),
    };

    dispatch({
      type: "SET_RESEARCH_SUMMARY",
      payload: newData,
    });

    localStorage.setItem(
      `research_summary_${keywords}`,
      JSON.stringify({
        summary: newSummary,
        timestamp: Date.now(),
      })
    );

    return { data: newSummary };
  };

  return { getCachedSummary };
}
