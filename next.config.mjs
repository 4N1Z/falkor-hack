import { hostname } from "os";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
// Import env here to validate during build. Using jiti we can import .ts files :)
await jiti.import("./src/env");


/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Load these with Node's own require instead of bundling them. falkordb pulls in
  // @js-temporal/polyfill → jsbi, whose CJS default export breaks under Turbopack
  // bundling ("e.BigInt is not a function").
  serverExternalPackages: ["falkordb", "@typesafe-ai/sdk"],
  images: {
    remotePatterns: [
      { hostname: "images.unsplash.com", protocol: "https" },
      { hostname: "assets.aceternity.com", protocol: "https" },
      {hostname:"dvftuokutylysenmwjzw.supabase.co", protocol:"https"},
      {hostname:"img.logo.dev", protocol:"https"},
      {hostname:"avatar.iran.liara.run", protocol:"https"},
      {hostname:"lh3.googleusercontent.com", protocol:"https"}
    ],

  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;