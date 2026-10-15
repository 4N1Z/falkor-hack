/**
 * API ROUTE - /api/zotero/collections
 * This route is used to get all the collections from the zotero account of a user
 * @param req
 * @returns
 */

import { auth } from "@/auth";
import { zoteroClient } from "@/components/zotero/src";

export async function GET(req: Request) {
  // check if the user is logged in , if not redirect to login page
  const session = await auth();
  if (!session || !session.user || !session.user.id) {
    return Response.redirect(`${process.env.APP_URL}/login`);
  }

  // check if the user has zoteroAccessToken
  const zoteroStatus = await zoteroClient.status();
  if (!zoteroStatus) {
    return Response.json({
      status: 401,
      message: "Zotero not connected",
      data: {},
    });
  }

  const collections = await zoteroClient.collections();
  if (!collections || !collections.data) {
    return Response.json({
      status: 404,
      message: "No collections found",
      data: {},
    });
  }

  return Response.json({
    status: 200,
    message: "Collections found",
    data: collections.data,
  });
}
