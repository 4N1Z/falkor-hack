// Client-safe names for the chat router's intents. The router itself (src/lib/agents/router.ts)
// pulls in server-only graph code, so UI imports the names from here instead.

export const ROUTE_NAMES = {
  cite_scout: "Cite Scout",
  citation_checker: "Citation Checker",
  next_steps: "Next-Step",
  historian: "Historian",
  team_library: "Team library",
  synthesis: "Synthesis",
  scout_watcher: "Scout Watcher",
  general: "Neura AI",
} as const;

export type Route = keyof typeof ROUTE_NAMES;

export const isRoute = (s: unknown): s is Route => typeof s === "string" && s in ROUTE_NAMES;
