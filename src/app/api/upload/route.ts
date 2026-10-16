// app/api/upload/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { uploadPapersToStorage } from "@/lib/storage";
import { addPaper } from "@/db/actions/paper-actions";
import { checkWorkspaceAccess } from "@/db/actions/authorization-check";

import { V6Options } from "uuid";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user || session === null) {
      return new Response("Unauthorized", { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const workspaceId = formData.get("workspaceId") as string;
    const title = formData.get("title") as string;

    // console.log("FormData from page:", formData, file, workspaceId, title)

    if (!file || !workspaceId) {
      return new Response("Missing required fields", { status: 400 });
    }

    // Upload to storage
    const uploadResult = await uploadPapersToStorage(
      file,
      `${workspaceId}/${Date.now()}-${file.name}`,
      file.type
    );

    if (!uploadResult?.success || !uploadResult.url) {
      return new Response("Upload failed", { status: 500 });
    }

    // console.log("Supabase Uploads:", uploadResult);

    // Add to database
    const dbResult = await addPaper({
      uploadUrl: uploadResult.url,
      userId: session.user.id!,
      workspaceId:workspaceId ,
      title: title || file.name.replace(/\.[^/.]+$/, ""),
      fileType: file.type,
      abstract: "",
      fileId: "",
    });

    if (dbResult.error) {
      return new NextResponse(dbResult.error, { status: 500 });
    }

    return new Response(
      JSON.stringify({
        sucess: true,
        url: uploadResult.url,
        paper: dbResult.data,
      })
    );
  } catch (error) {
    console.error("[UPLOAD_POST]", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal Error",
        status: 500,
      })
    );
  }
}
