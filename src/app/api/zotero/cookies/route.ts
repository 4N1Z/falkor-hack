import { cookies } from "next/headers";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const cookieStore = cookies();
  const zoteroAccessToken = req.cookies.get("zoteroAccessToken");
  const zoteroAccessTokenSecret = req.cookies.get("zoteroAccessTokenSecret");
  const zoteroUserId = req.cookies.get("zoteroUserId");
  return Response.json({
    zoteroAccessToken,
    zoteroAccessTokenSecret,
    zoteroUserId,
    cookieStore,
  });
}
