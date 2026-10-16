import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    SERVICE_ROLE_KEY: z.string().min(1),
    DB_NAME: z.string().min(1),
    PW: z.string().min(1),
    REACT_EDITOR: z.string().min(1),
    STRAPI_API_KEY: z.string().min(1),
    OPENAI_API_KEY: z.string().min(1),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    AUTH_SECRET: z.string().min(1),
    AUTH_GOOGLE_ID: z.string().min(1),
    AUTH_GOOGLE_SECRET: z.string().min(1),
    AUTH_DRIZZLE_URL: z.string().url(),
    NODE_ENV: z.string().min(1),
    ZOTERO_API_ENDPOINT: z.string().url(),
    ZOTERO_CLIENT_KEY: z.string().min(1),
    APP_URL: z.string().url(),
    ZOTERO_CLIENT_SECRET: z.string().min(1),
    SHOW_OUTRAGEOUS_CONTENT: z.string().min(1),
    FALKORDB_URL: z.string().url(),
    TYPESAFE_API_KEY: z.string().optional(),
    SEMANTIC_SCHOLAR_API_KEY: z.string().optional(),
    MCP_TOKEN: z.string().min(16).optional(),
  },
  // Everything that goes in this should go in the experimental__runtimeEnv
  client: {
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
    NEXT_PUBLIC_SITE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_ZOTERO_CALLBACK_URL: z.string().url(),
  },

  // Everything that goes in the client should go in here
  experimental__runtimeEnv: {
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_ZOTERO_CALLBACK_URL:
      process.env.NEXT_PUBLIC_ZOTERO_CALLBACK_URL,
  },
});
