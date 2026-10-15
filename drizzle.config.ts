import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// schema path specifies the main schema in this project.
// It is used t
export default defineConfig({
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  out: "./supabase/migrations",
  dbCredentials: {
    // host: process.env.DB_HOST,
    url: process.env.DATABASE_URL!,
  },

  breakpoints: true,
  strict: true,
  verbose: true,
});

