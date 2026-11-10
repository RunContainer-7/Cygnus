import type { NextConfig } from "next";

const devOrigins = (process.env.CYGNUS_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: devOrigins,
  devIndicators: false,
};

export default nextConfig;
