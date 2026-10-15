import { auth } from "@/auth";
import { zoteroClient } from "@/components/zotero/src";
import { NextRequest } from "next/server";
import { cookies } from "next/headers";

export async function GET(
  req: NextRequest,
  { params }: { params: { itemKey: string } }
) {
  const { itemKey } = params;

  // Get both cookie stores for comparison
  const cookieStore = cookies();
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

  try {
    

    // Get item from Zotero
    const item = await zoteroClient.item({ itemKey });
    if (!item?.data) {
      console.error("Item not found or invalid response", { itemKey });
      return Response.json(
        {
          status: item?.status || 404,
          message: item?.message || "Item not found",
          data: null,
        },
        { status: item?.status ? 200 : 404 }
      );
    }

    return Response.json(
      {
        status: 200,
        message: "Item found",
        data: item.data,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error processing request:", error);
    return Response.json(
      {
        status: 500,
        message: "Internal server error",
        data: null,
      },
      { status: 500 }
    );
  }
}
