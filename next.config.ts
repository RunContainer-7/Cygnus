import type { NextConfig } from "next";
import pkg from "./package.json";

const devOrigins = (process.env.CYGNUS_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const isDesktopBuild = process.env.CYGNUS_STANDALONE === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: devOrigins,
  devIndicators: false,
  env: {
    NEXT_PUBLIC_CYGNUS_VERSION: pkg.version,
  },
  // The desktop build runs the app from a bundled standalone server.
  output: isDesktopBuild ? "standalone" : undefined,
  experimental: isDesktopBuild
    ? {
        // Never write Next's response cache into the desktop install directory.
        // Cygnus has no ISR/fetch cache; user files live in CYGNUS_WORKSPACE_DIR.
        isrFlushToDisk: false,
      }
    : undefined,
};

export default nextConfig;
