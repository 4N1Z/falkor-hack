import db from "@/db";
import { papers } from "@/db/schema";
import { searchWorks } from "@/lib/graph/openalex";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireWorkspaceMember } from "../_access";

export const runtime = "nodejs";

/** GET /api/papers/search?workspaceId=&q= — OpenAlex search, flagged with what's already in the library. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const access = await requireWorkspaceMember(params.get("workspaceId"));
  if ("error" in access) return access.error;

  const q = (params.get("q") ?? "").slice(0, 300);
  try {
    const [results, library] = await Promise.all([
      searchWorks(q),
      db
        .select({ doi: papers.doi, externalId: papers.externalId, title: papers.title })
        .from(papers)
        .where(eq(papers.workspaceId, access.workspaceId)),
    ]);
    const dois = new Set(library.map((p) => p.doi?.toLowerCase()).filter(Boolean));
    const ids = new Set(library.map((p) => p.externalId).filter(Boolean));
    const titles = new Set(library.map((p) => p.title.toLowerCase()));
    return NextResponse.json({
      results: results.map((r) => ({
        ...r,
        inLibrary: ids.has(r.openalexId) || (!!r.doi && dois.has(r.doi)) || titles.has(r.title.toLowerCase()),
      })),
    });
  } catch (err) {
    console.error("[papers] search failed", err);
    return NextResponse.json({ error: "Search is unavailable right now. Try again in a moment." }, { status: 502 });
  }
}
