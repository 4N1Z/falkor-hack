import { searchTeamLibrary } from "@/lib/graph/team-search";
import { NextResponse } from "next/server";
import { requireWorkspaceMember } from "../_access";

export const runtime = "nodejs";

/** GET /api/papers/team-search?workspaceId=&q= — search the team library in FalkorDB. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const access = await requireWorkspaceMember(params.get("workspaceId"));
  if ("error" in access) return access.error;
  try {
    const results = await searchTeamLibrary(access.workspaceId, params.get("q") ?? "");
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[papers] team search failed", err);
    return NextResponse.json({ error: "Team library search is unavailable right now." }, { status: 503 });
  }
}
