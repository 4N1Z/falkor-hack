// auth/route.ts
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

export async function GET(request: Request) {
  // console.log("🔑 Zotero auth route initialized");
  const url = new URL(request.url);
  const params = url.searchParams;
  const cookiesStore = cookies();

  if (params.get("callback")) {
    const callback = params.get("callback");
    if (callback) {
      cookiesStore.set("callback", callback);
      // console.log("📍 Callback URL saved:", callback);
    }
  }

  const session = await auth();
  if (!session?.user?.id) {
    // console.log("❌ No authenticated session found");
    return Response.redirect(`${process.env.APP_URL}/login`);
  }

  // Check if the user already has valid Zotero tokens
  if (
    cookiesStore.get("zoteroAccessToken") &&
    cookiesStore.get("zoteroUserId")?.value
  ) {
    // console.log("✅ User already has valid Zotero tokens");

    // Handle callback redirection
    if (cookiesStore.get("callback")) {
      const callback = cookiesStore.get("callback")?.value;
      if (callback) {
        // console.log("↪️ Redirecting to callback:", callback);
        return Response.redirect(callback);
      }
    }

    return Response.redirect(`${process.env.APP_URL}/dashboard`);
  }

  // Check for existing tokens in database
  // console.log("🔍 Checking database for existing Zotero tokens");
  const user = await db
    .select({
      zoteroAccessToken: users.zoteroAccessToken,
      zoteroAccessTokenSecret: users.zoteroAccessTokenSecret,
      zoteroUserId: users.zoteroUserId,
    })
    .from(users)
    .where(eq(users.id, session.user.id));

  // If user has tokens in database, set them in cookies
  if (
    user?.[0]?.zoteroAccessToken &&
    user[0].zoteroAccessTokenSecret &&
    user[0].zoteroUserId
  ) {
    // console.log("📝 Setting Zotero tokens from database to cookies");
    cookiesStore.set("zoteroAccessToken", user[0].zoteroAccessToken);
    cookiesStore.set(
      "zoteroAccessTokenSecret",
      user[0].zoteroAccessTokenSecret
    );
    cookiesStore.set("zoteroUserId", user[0].zoteroUserId);

    if (cookiesStore.get("callback")) {
      const callback = cookiesStore.get("callback")?.value;
      if (callback) {
        // console.log("↪️ Redirecting to callback:", callback);
        return Response.redirect(callback);
      }
    }

    return Response.redirect(`${process.env.APP_URL}/dashboard`);
  }

  // Start OAuth process
  // console.log("🔄 Starting OAuth process");
  const requestTokenData = {
    url: "https://www.zotero.org/oauth/request",
    method: "POST",
    data: {
      oauth_callback: `${process.env.APP_URL}/api/zotero/callback`,
    },
  };

  try {
    const requestHeader = oauth.toHeader(oauth.authorize(requestTokenData));
    // console.log("📤 Requesting temporary tokens from Zotero");

    const res = await fetch("https://www.zotero.org/oauth/request", {
      method: "POST",
      headers: {
        ...requestHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (!res.ok) {
      // console.error("❌ Failed to get request token:", res.status);
      throw new Error(`Failed to get request token: ${res.status}`);
    }

    const data = await res.text();
    const tokens = new URLSearchParams(data);
    const requestToken = tokens.get("oauth_token");
    const requestTokenSecret = tokens.get("oauth_token_secret");

    if (!requestToken || !requestTokenSecret) {
      console.error("❌ Invalid response from Zotero");
      throw new Error("Invalid response from Zotero");
    }

    // console.log("✅ Received temporary tokens from Zotero");
    cookiesStore.set("requestToken", requestToken);
    cookiesStore.set("requestTokenSecret", requestTokenSecret);

    // Build authorization URL
    const authorizeUrl = new URL("https://www.zotero.org/oauth/authorize");
    authorizeUrl.searchParams.append("oauth_token", requestToken);
    authorizeUrl.searchParams.append("library_access", "1");
    authorizeUrl.searchParams.append("notes_access", "1");
    authorizeUrl.searchParams.append("write_access", "1");
    authorizeUrl.searchParams.append("all_groups", "write");

    // console.log("↪️ Redirecting to Zotero authorization page");
    return Response.redirect(authorizeUrl.toString());
  } catch (error) {
    console.error("❌ Error in OAuth process:", error);
    return new Response("OAuth process failed", { status: 500 });
  }
}
