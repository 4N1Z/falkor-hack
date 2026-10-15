import { auth } from "@/auth";
import { zoteroClient } from "@/components/zotero/src";

export async function GET(req: Request) {
  // check if the user is logged in
  // if not redirect to login page
  const session = await auth();
  if (!session || !session.user || !session.user.id) {
    return Response.redirect(`${process.env.APP_URL}/login`);
  }

  // check if the user has zoteroAccessToken
  const zoteroStatus = await zoteroClient.status({});
  if (!zoteroStatus) {
    return Response.json({
      status: 401,
      message: "Zotero not connected",
      data: {},
    });
  }

  const publications = await zoteroClient.publications();
  if (!publications || !publications.data) {
    return Response.json({
      status: 404,
      message: "No publications found",
      data: {},
    });
  }

  return Response.json({
    status: 200,
    message: "Publications found",
    data: publications.data,
  });
}
