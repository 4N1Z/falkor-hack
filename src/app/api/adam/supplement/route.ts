// POST /api/adam/supplement — attach supplementary material to a paper in the graph.
// Supplements are where the actual parameters, extra experiments and failed conditions live
// (docs/adam-spec-creation.md, "Full-text indexing requirements"), so they are indexed as
// extra passages of the same Paper (Chunk.doc = 'supplement') with page and section info.
//
//   multipart/form-data: file, workspaceId, paperId          (upload a PDF / DOCX)
//   application/json:    { workspaceId, paperId, url }       (index a file already online)
//
// Indexing runs after the response; the Paper's supplementState goes queued → done | failed.

import { after, NextResponse } from "next/server";
import { uploadPapersToStorage } from "@/lib/storage";
import { getWorkspaceGraph } from "@/lib/graph/client";
import { fetchDocumentText, indexPaperText } from "@/lib/graph/document-index";
import { PAPER_CHUNKS, SET_PAPER_SUPPLEMENT } from "@/lib/graph/queries";
import { requireWorkspaceMember } from "../../papers/_access";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  let workspaceId: string | null = null;
  let paperId: string | null = null;
  let url: string | null = null;

  if (req.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await req.formData();
    workspaceId = String(form.get("workspaceId") ?? "");
    paperId = String(form.get("paperId") ?? "");
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
    const access = await requireWorkspaceMember(workspaceId);
    if ("error" in access) return access.error;
    const uploaded = await uploadPapersToStorage(file, `${workspaceId}/supplements/${Date.now()}-${file.name}`, file.type);
    if (!uploaded?.success || !uploaded.url) return NextResponse.json({ error: "upload failed" }, { status: 500 });
    url = uploaded.url;
  } else {
    const body = (await req.json().catch(() => ({}))) as { workspaceId?: string; paperId?: string; url?: string };
    workspaceId = body.workspaceId ?? null;
    paperId = body.paperId ?? null;
    url = body.url ?? null;
    const access = await requireWorkspaceMember(workspaceId);
    if ("error" in access) return access.error;
  }
  if (!paperId || !url || !/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: "paperId and a valid url are required" }, { status: 400 });
  }

  const ws = workspaceId!;
  const pid = paperId;
  const src = url;
  const graph = await getWorkspaceGraph(ws);
  const marked = await graph.query<{ paperId: string }>(SET_PAPER_SUPPLEMENT, {
    params: { paperId: pid, chunks: 0, url: src, at: Date.now(), state: "queued" } as never,
  });
  if (!marked.data?.length) return NextResponse.json({ error: "paper not in the graph" }, { status: 404 });

  after(async () => {
    const g = await getWorkspaceGraph(ws);
    try {
      const fetched = await fetchDocumentText(src, { allowHtml: true });
      if (!fetched.ok) {
        await g.query(SET_PAPER_SUPPLEMENT, { params: { paperId: pid, chunks: 0, url: src, at: Date.now(), state: `failed:${fetched.reason}` } as never });
        return;
      }
      const n = await indexPaperText(ws, pid, fetched.doc, { doc: "supplement", sourceUrl: src });
      await g.query(SET_PAPER_SUPPLEMENT, { params: { paperId: pid, chunks: n, url: src, at: Date.now(), state: "done" } as never });
      console.log(`[adam] supplement indexed for ${pid}: ${n} passages`);
    } catch (err) {
      console.error(`[adam] supplement failed for ${pid}`, err);
      await g.query(SET_PAPER_SUPPLEMENT, { params: { paperId: pid, chunks: 0, url: src, at: Date.now(), state: "failed:error" } as never }).catch(() => {});
    }
  });

  return NextResponse.json({ queued: true, paperId: pid, url: src });
}

/** GET /api/adam/supplement?workspaceId=…&paperId=… — a paper's passages (body + supplements) in reading order. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const access = await requireWorkspaceMember(searchParams.get("workspaceId"));
  if ("error" in access) return access.error;
  const paperId = searchParams.get("paperId");
  if (!paperId) return NextResponse.json({ error: "paperId is required" }, { status: 400 });
  const graph = await getWorkspaceGraph(access.workspaceId);
  const rows = (await graph.roQuery(PAPER_CHUNKS, { params: { paperId } as never })).data ?? [];
  return NextResponse.json({ paperId, chunks: rows });
}
