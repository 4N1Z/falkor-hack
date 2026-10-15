import OAuth from "oauth-1.0a";
import crypto from "crypto";
import { cookies } from "next/headers";
import db from "@/db";
import { auth } from "@/auth";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
// Create an OAuth instance
const oauth = new OAuth({
  consumer: {
    key: process.env.ZOTERO_CLIENT_KEY!,
    secret: process.env.ZOTERO_CLIENT_SECRET!,
  },
  signature_method: "HMAC-SHA1",
  hash_function(baseString, key) {
    return crypto.createHmac("sha1", key).update(baseString).digest("base64");
  },
});
// callback/route.ts
export async function GET(request: Request) {
  // console.log("🔄 Zotero callback initiated");

  const session = await auth();
  if (!session?.user?.id) {
    // console.log("❌ No authenticated session found");
    return Response.redirect(`${process.env.APP_URL}/login`);
  }

  const url = new URL(request.url);
  const params = url.searchParams;
  const { oauth_token, oauth_verifier } = Object.fromEntries(params);

  if (!oauth_token || !oauth_verifier) {
    console.error("❌ Missing OAuth parameters");
    return new Response("Missing required parameters", { status: 400 });
  }

  const cookiesStore = await cookies();
  const requestToken = cookiesStore.get("requestToken")?.value;
  const requestTokenSecret = cookiesStore.get("requestTokenSecret")?.value;

  if (!requestToken || !requestTokenSecret) {
    console.error("❌ Request tokens not found in cookies");
    return new Response("Request token and secret not found", { status: 404 });
  }

  if (requestToken !== oauth_token) {
    console.error("❌ Request token mismatch");
    return new Response("Request token mismatch in callback response", {
      status: 400,
    });
  }

  // console.log("🔄 Exchanging temporary tokens for access tokens");
  const requestData = {
    url: "https://www.zotero.org/oauth/access",
    method: "POST",
    data: {
      oauth_token,
      oauth_verifier,
    },
  };

  const authHeader = oauth.toHeader(
    oauth.authorize(requestData, {
      key: oauth_token,
      secret: requestTokenSecret,
    })
  );

  try {
    const response = await fetch("https://www.zotero.org/oauth/access", {
      method: "POST",
      headers: {
        ...authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        oauth_verifier,
        oauth_token,
      }),
    });

    if (!response.ok) {
      console.error("❌ Failed to get access token from Zotero");
      return new Response("Failed to get access token", { status: 500 });
    }

    const data = await response.text();
    const responseParams = new URLSearchParams(data);
    const zoteroAccessToken = responseParams.get("oauth_token");
    const zoteroAccessTokenSecret = responseParams.get("oauth_token_secret");
    const zoteroUserId = responseParams.get("userID");

    if (!zoteroAccessToken || !zoteroAccessTokenSecret || !zoteroUserId) {
      console.error("❌ Invalid response format from Zotero");
      return new Response("Invalid response format", { status: 500 });
    }

    // console.log("✅ Successfully received access tokens");

    // Set new tokens
    cookiesStore.set("zoteroAccessToken", zoteroAccessToken);
    cookiesStore.set("zoteroAccessTokenSecret", zoteroAccessTokenSecret);
    cookiesStore.set("zoteroUserId", zoteroUserId);

    // Clear temporary tokens
    cookiesStore.delete("requestToken");
    cookiesStore.delete("requestTokenSecret");

    // Update database
    // console.log("💾 Updating database with new tokens");
    await db
      .update(users)
      .set({
        zoteroAccessToken,
        zoteroAccessTokenSecret,
        zoteroUserId,
      })
      .where(eq(users.id, session.user.id));

    // Handle callback
    if (cookiesStore.get("callback")) {
      const callback = cookiesStore.get("callback")?.value;
      cookiesStore.delete("callback");
      if (callback) {
        // console.log("↪️ Redirecting to callback:", callback);
        return Response.redirect(callback);
      }
    }

    // console.log("↪️ Redirecting to dashboard");
    return Response.redirect(`${process.env.APP_URL}/dashboard`);
  } catch (error) {
    console.error("❌ Error in token exchange:", error);
    return new Response("Failed to exchange tokens", { status: 500 });
  }
}
