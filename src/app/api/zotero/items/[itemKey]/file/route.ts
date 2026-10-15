import { auth } from "@/auth";
import { zoteroClient } from "@/components/zotero/src";
import { cookies } from "next/headers";

export async function GET(
  req: Request,
  { params }: { params: { itemKey: string } }
) {
  const { itemKey } = params;

  // check if user is logged in
  // if not redirect to login page
  const session = await auth();
  if (!session || !session.user || !session.user.id) {
    return Response.redirect(`${process.env.APP_URL}/login`);
  }
  const cookieStore = cookies();
  const zoteroAccessToken = cookieStore.get("zoteroAccessToken");
  const zoteroAccessTokenSecret = cookieStore.get("zoteroAccessTokenSecret");
  const zoteroUserId = cookieStore.get("zoteroUserId");
  // check if user has zoteroAccessToken
  if (!zoteroAccessToken || !zoteroAccessTokenSecret || !zoteroUserId) {
    return Response.json({
      status: 401,
      message: "Zotero not connected",
      data: {},
    });
  }
  const zoteroStatus = await zoteroClient.status({
    zoteroAccessToken: zoteroAccessToken.value,
    zoteroAccessTokenSecret: zoteroAccessTokenSecret.value,
    zoteroUserId: zoteroUserId.value,
  });

  if (!zoteroStatus.status) {
    return Response.json({
      status: 401,
      message: "Zotero not connected",
      data: {},
    });
  }

  try {
    const file = await zoteroClient.file({ itemKey });
    if (!file || !file.data) {
      return Response.json({
        status: file.status || 404,
        message: file.message || "File not found",
        data: null,
      });
    }

    // Get the original content type from the blob
    const contentType = file.data.blob.type || "application/octet-stream";

    // Set headers
    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set(
      "Content-Disposition",
      `attachment; filename="${file.data.filename}"`
    );

    // Return the file as a downloadable response
    return new Response(file.data.blob, {
      headers,
      status: 200,
    });
  } catch (error) {
    console.error("File download error:", error);
    return Response.json({
      status: 500,
      message: "Error processing file download",
      data: null,
    });
  }
}
