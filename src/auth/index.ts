import NextAuth, { DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import db from "@/db";
import {
  accounts,
  authenticators,
  sessions,
  users,
  verificationTokens,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

declare module "next-auth" {
  interface Session {
    user: {
      zoteroAccessToken: string | null;
      zoteroAccessTokenSecret: string | null;
      zoteroUserId: string | null;
    } & DefaultSession["user"];
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
          redirect_uri: process.env.NODE_ENV === "production" ? "https://neuraquery.com/api/auth/callback/google" : "http://localhost:3000/api/auth/callback/google",
        },
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    authenticatorsTable: authenticators,
    sessionsTable: sessions,
    accountsTable: accounts,
    verificationTokensTable: verificationTokens,
  }),
  trustHost: true,
  // useSecureCookies: process.env.NODE_ENV === 'production',
  cookies: {
    pkceCodeVerifier: {
      name: "next-auth.pkce.code_verifier",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  callbacks: {
    authorized: async ({ auth }) => {
      // Logged in users are authenticated, otherwise redirect to login page
      return !!auth;
    },

    // async signIn({ user, account, profile, email, credentials }) {
    //   console.log("signIn callback details:", { user, account, profile, email, credentials });
    //   return true;
    // },

    async session({ session, user }) {
      if (session) {
        const dbuser = await db
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            zoteroAccessToken: users.zoteroAccessToken,
            zoteroAccessTokenSecret: users.zoteroAccessTokenSecret,
            zoteroUserId: users.zoteroUserId,
          })
          .from(users)
          .where(eq(users.id, user.id));

        if (
          dbuser.length > 0 &&
          dbuser[0].zoteroAccessToken &&
          dbuser[0].zoteroAccessTokenSecret &&
          dbuser[0].zoteroUserId
        ) {
          session.user.zoteroAccessToken = dbuser[0].zoteroAccessToken;
          session.user.zoteroAccessTokenSecret =
            dbuser[0].zoteroAccessTokenSecret;
          session.user.zoteroUserId = dbuser[0].zoteroUserId;
        }
        try {
          const cookieStore = await cookies();
          // check if the cookies are set
          if (
            cookieStore.get("zoteroAccessToken") &&
            cookieStore.get("zoteroAccessTokenSecret") &&
            cookieStore.get("zoteroUserId")
          ) {
            return session;
          }
          cookieStore.set(
            "zoteroAccessToken",
            session.user.zoteroAccessToken || ""
          );
          cookieStore.set(
            "zoteroAccessTokenSecret",
            session.user.zoteroAccessTokenSecret || ""
          );
          cookieStore.set("zoteroUserId", session.user.zoteroUserId || "");
        } catch (e) {
          // console.log("Error setting cookies:", e);
        }
      }
      return session;
    },

    redirect({ url, baseUrl }) {
      // Define allowed hosts
      const allowedHosts = [
        "localhost:3000",
        "0.0.0.0:3000",
        "neuraquery.com",
        "www.neuraquery.com",
      ];

      // Check if URL is allowed
      if (
        url.startsWith(baseUrl) ||
        allowedHosts.some((host) => url.includes(host))
      ) {
        return url;
      }
      // console.log("Redirecting to baseUrl:", baseUrl);
      return baseUrl;
    },
  },
  events: {
    async createUser(message) {
      // console.log("User created:", JSON.stringify(message));
    },
  },
  // debug: process.env.NODE_ENV === "development",
});
