import { auth } from "@/auth";
import { zoteroClient } from "@/components/zotero/src";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  // check if user is logged in
  // if not redirect to login page
  // Get both cookie stores for comparison
  const cookieStore = await cookies();
  const requestCookies = req.cookies;

  // Check authentication using both methods
  const session = await auth();
  if (!session?.user?.id) {
    console.error("Authentication failed - no session");
    return Response.json(
      {
        status: 401,
        message: "Unauthorized",
        data: null,
      },
      { status: 401 }
    );
  }

  // Get Zotero tokens
  const zoteroAccessToken =
    requestCookies.get("zoteroAccessToken") ||
    cookieStore.get("zoteroAccessToken");
  const zoteroAccessTokenSecret =
    requestCookies.get("zoteroAccessTokenSecret") ||
    cookieStore.get("zoteroAccessTokenSecret");
  const zoteroUserId =
    requestCookies.get("zoteroUserId") || cookieStore.get("zoteroUserId");

  // Check Zotero connection
  if (
    !zoteroAccessToken?.value ||
    !zoteroAccessTokenSecret?.value ||
    !zoteroUserId?.value
  ) {
    console.error("Zotero tokens missing", {
      hasAccessToken: !!zoteroAccessToken,
      hasSecret: !!zoteroAccessTokenSecret,
      hasUserId: !!zoteroUserId,
    });
    return Response.json(
      {
        status: 401,
        message: "Zotero not connected",
        data: null,
      },
      { status: 401 }
    );
  }

  // get items from zotero
  const items = await zoteroClient.items({
    searchParams: req.url.split("?")[1] || "",
  });
  if (!items || !items.data || items.data.length <= 0) {
    return Response.json({
      status: 404,
      message: items.message || "Items not found",
      data: null,
    });
  }
  return Response.json({
    status: 200,
    message: items.message || "Items found",
    data: items.data,
  });
}
