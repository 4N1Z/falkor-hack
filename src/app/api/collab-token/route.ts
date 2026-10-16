import { auth } from "@/auth";
import { signCollabToken } from "@/lib/collab-token";

/**
 * Issues a short-lived token the editor passes to the Hocuspocus server.
 * Authorisation per-document is enforced on the socket (scripts/serve.mts);
 * this endpoint only proves who the caller is.
 */
export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    console.error("[collab-token] AUTH_SECRET is not set");
    return new Response("Collaboration unavailable", { status: 503 });
  }

  return Response.json(
    { token: signCollabToken(userId, secret) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
